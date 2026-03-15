require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const multer = require('multer');
const ngrok = require('@ngrok/ngrok');
const rateLimit = require('express-rate-limit');
const { logError } = require('./lib/logger');
const helmet = require('helmet');
const { validateRestaurant, validateMenu } = require('./lib/validators');
const { loadOrders, saveOrders, loadFavorites, saveFavorites, loadPrefs, savePrefs, orderUserMatch, prefsKey } = require('./lib/orders');
const restaurantLib = require('./lib/restaurant');
const { getCachedRestaurant, getCachedMenu, invalidateRestaurantCache, invalidateMenuCache, isOpen, validateCoupon, formatOrderConfirm, getActiveCampaign, loadMenuForPreview, MENU_PATH, RESTAURANT_PATH } = restaurantLib;
const getRestaurant = getCachedRestaurant;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = parseInt(process.env.PORT) || 3005;
const USE_NGROK = process.env.USE_NGROK === 'true' || process.env.USE_NGROK === '1';

let baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN bulunamadı. .env dosyasını oluştur ve token ekle.');
  process.exit(1);
}

// WhatsApp Business Cloud API (opsiyonel)
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'wpmenu-verify';
const WA_API_VERSION = process.env.WA_API_VERSION || 'v21.0';
const WA_APP_SECRET = process.env.WA_APP_SECRET || '';
const whatsappEnabled = !!(WA_PHONE_NUMBER_ID && WA_ACCESS_TOKEN);

const waPhone = () => String(WA_PHONE_NUMBER_ID).trim();
const waTo = (to) => String(to).replace(/\D/g, '');

async function sendWhatsAppMessage(to, text) {
  if (!whatsappEnabled) return;
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${waPhone()}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WA_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: waTo(to),
        type: 'text',
        text: { body: text }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[WhatsApp] Gönderim hatası:', res.status, err);
      logError('WhatsApp send', new Error(err));
    }
  } catch (e) {
    console.error('[WhatsApp] Gönderim exception:', e.message);
    logError('WhatsApp send', e);
  }
}

// WhatsApp interaktif: en fazla 3 yanıt butonu (id + title, title max 20 karakter)
async function sendWhatsAppReplyButtons(to, bodyText, buttons) {
  if (!whatsappEnabled || !buttons.length) return;
  const list = buttons.slice(0, 3).map(b => ({
    type: 'reply',
    reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) }
  }));
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${waPhone()}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WA_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: waTo(to),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: { buttons: list }
        }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      logError('WhatsApp buttons', new Error(err));
    }
  } catch (e) {
    logError('WhatsApp buttons', e);
  }
}

// WhatsApp: tek butonla URL açan mesaj (Menü linki için)
async function sendWhatsAppUrlButton(to, bodyText, buttonText, url) {
  if (!whatsappEnabled) return;
  const apiUrl = `https://graph.facebook.com/${WA_API_VERSION}/${waPhone()}/messages`;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WA_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: waTo(to),
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: bodyText },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: String(buttonText).slice(0, 20),
              url: String(url)
            }
          }
        }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      logError('WhatsApp url button', new Error(err));
    }
  } catch (e) {
    logError('WhatsApp url button', e);
  }
}

let orders = loadOrders();
let orderIdCounter = Math.max(1, ...orders.map(o => o.id), 0) + 1;

const bot = new TelegramBot(TOKEN, { polling: true });

// 409 = aynı bot başka yerde de polling yapıyor; log spam önle
let last409Log = 0;
bot.on('polling_error', (err) => {
  const is409 = (err.message || '').includes('409') || (err.response && err.response.statusCode === 409);
  if (is409) {
    if (Date.now() - last409Log > 60000) {
      last409Log = Date.now();
      console.error('❌ Telegram: Aynı bot zaten başka bir yerde çalışıyor (409). Sadece tek bir "npm start" çalıştırın ve diğer terminalleri kapatın.');
    }
    logError('Telegram polling', err);
    return;
  }
  logError('Telegram polling', err);
  console.error('❌ Telegram polling:', err.message);
});
bot.on('message', () => {});

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    const mimeOk = ALLOWED_MIMES.includes(file.mimetype);
    const extOk = ext && ALLOWED_EXT.includes(ext);
    if (mimeOk && extOk) return cb(null, true);
    cb(new Error('Sadece resim dosyaları (JPEG, PNG, WebP, GIF) yüklenebilir.'));
  }
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ——— WhatsApp Webhook: raw body for signature (must be before express.json()) ———
app.get('/webhook/whatsapp', (req, res) => {
  const mode = (req.query['hub.mode'] || '').trim();
  const token = (req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'] || '';
  if (mode === 'subscribe' && token && token === WA_VERIFY_TOKEN.trim()) {
    res.status(200).send(String(challenge));
  } else {
    res.sendStatus(403);
  }
});

function verifyWhatsAppSignature(req, bodyRaw) {
  if (!WA_APP_SECRET) return true;
  const sig = req.headers['x-hub-signature-256'] || '';
  if (!sig.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET).update(bodyRaw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

app.post('/webhook/whatsapp', express.raw({ type: 'application/json' }), (req, res) => {
  const bodyRaw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (WA_APP_SECRET && !verifyWhatsAppSignature(req, bodyRaw)) {
    return res.sendStatus(403);
  }
  try {
    req.body = bodyRaw.length ? JSON.parse(bodyRaw.toString()) : {};
  } catch {
    req.body = {};
  }
  res.sendStatus(200);
  if (!whatsappEnabled) {
    console.log('[WhatsApp] Webhook alındı ama WhatsApp kapalı (WA_* .env)');
    return;
  }
  if (req.body?.object !== 'whatsapp_business_account') {
    console.log('[WhatsApp] Webhook alındı, object:', req.body?.object || 'yok');
    return;
  }
  const entries = req.body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const messages = value.messages || [];
      if (messages.length) console.log('[WhatsApp] Gelen mesaj sayısı:', messages.length);
      const contacts = value.contacts || [];
      const profileName = (contacts[0]?.profile?.name) || 'Müşteri';
      for (const msg of messages) {
        const from = msg.from;
        const type = msg.type;
        if (type === 'location' && msg.location) {
          const locKey = 'wa_' + from;
          const orderId = pendingLocationForOrder.get(locKey);
          if (orderId) {
            pendingLocationForOrder.delete(locKey);
            const order = orders.find(o => o.id === orderId && o.whatsappId === String(from));
            if (order) {
              order.location = { lat: msg.location.latitude, lng: msg.location.longitude };
              saveOrders(orders);
              sendWhatsAppMessage(from, '✅ Konumunuz siparişe eklendi. Teşekkürler!');
            }
          }
          continue;
        }
        let body = '';
        if (type === 'text' && msg.text) body = (msg.text.body || '').trim();
        if (type === 'button' && msg.button) body = (msg.button.text || '').trim();
        if (type === 'interactive' && msg.interactive) {
          const btn = msg.interactive.button_reply || msg.interactive.list_reply;
          body = (btn && (btn.title || btn.id)) || '';
        }
        // Buton yanıtı: interactive.button_reply.id
        const buttonId = (type === 'interactive' && msg.interactive?.button_reply?.id) ? msg.interactive.button_reply.id.trim().toLowerCase() : '';
        const cmd = buttonId || body.toLowerCase();
        console.log('[WhatsApp] Yanıtlanıyor from:', from, 'cmd:', cmd || '(hoş geldin)');
        const menuLink = `${baseUrl}/menu.html?channel=whatsapp&userId=${from}`;
        const r = getRestaurant();
        const openNow = isOpen(r);
        const status = openNow ? '🟢 Açık' : '🔴 Kapalı';

        if (cmd === 'menu' || cmd === 'menü' || cmd === 'sipariş' || cmd === 'siparis' || cmd === '1') {
          sendWhatsAppUrlButton(from, `${r.name || 'MeraPaket'} — ${status}\n\nSipariş vermek için aşağıdaki butona tıklayın.`, 'Menüyü Aç', menuLink);
        } else if (cmd === 'siparişlerim' || cmd === 'siparislerim' || cmd === '2' || cmd === 'orders') {
          const userOrders = orders.filter(o => o.whatsappId === String(from)).slice(-5).reverse();
          if (userOrders.length === 0) {
            sendWhatsAppReplyButtons(from, 'Henüz siparişiniz yok. Menüden sipariş verebilirsiniz.', [
              { id: 'menu', title: '🛒 Menü Aç' }
            ]);
          } else {
            const lines = userOrders.map(o => `#${o.id} — ${o.status} — ${o.total}₺`);
            sendWhatsAppMessage(from, '📋 Son siparişleriniz:\n\n' + lines.join('\n'));
            sendWhatsAppUrlButton(from, 'Yeni sipariş veya detay için menüyü açın.', 'Menüyü Aç', menuLink);
          }
        } else if (cmd === 'yardim' || cmd === 'yardım' || cmd === 'iletişim' || cmd === '3' || cmd === 'help') {
          sendWhatsAppMessage(from, `${r.name || 'MeraPaket'}\n\n📍 ${r.address || '-'}\n📞 ${r.phone || '-'}\n🕐 ${r.hours || '-'}`);
        } else {
          sendWhatsAppReplyButtons(from, `Merhaba ${profileName}!\n\n${r.name || 'MeraPaket'} — ${status}\n\nAşağıdaki butonlardan seçin:`, [
            { id: 'menu', title: '🛒 Menü Aç' },
            { id: 'orders', title: '📋 Siparişlerim' },
            { id: 'help', title: 'ℹ️ Yardım' }
          ]);
        }
      }
    }
  }
});

app.use(express.json());

// Rate limiting: 60 istek/dakika
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { ok: false, error: 'Çok fazla istek. Lütfen bekleyin.' }
});
app.use('/api/', apiLimiter);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const ADMIN_TOKENS_PATH = path.join(__dirname, 'data', 'admin-tokens.json');
const adminTokens = new Map(); // token -> expiry time

function loadAdminTokens() {
  try {
    const raw = fs.readFileSync(ADMIN_TOKENS_PATH, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    Object.entries(obj).forEach(([t, expiry]) => {
      const token = String(t).trim();
      if (token && typeof expiry === 'number' && expiry > now) adminTokens.set(token, expiry);
    });
  } catch {
    // dosya yok veya geçersiz
  }
}

function saveAdminTokens() {
  try {
    const dataDir = path.dirname(ADMIN_TOKENS_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const now = Date.now();
    const obj = {};
    adminTokens.forEach((expiry, token) => {
      if (expiry > now) obj[token] = expiry;
    });
    fs.writeFileSync(ADMIN_TOKENS_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[admin-tokens] Kayıt hatası:', err.message);
  }
}

loadAdminTokens();
if (ADMIN_PASSWORD && adminTokens.size > 0) {
  try {
    const fp = path.relative(process.cwd(), ADMIN_TOKENS_PATH);
    console.log(`   Admin token'ları yüklendi: ${adminTokens.size} oturum (${fp})`);
  } catch (_) {}
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const token = getAdminTokenFromRequest(req);
  const expiry = adminTokens.get(token);
  if (expiry && Date.now() < expiry) return next();
  if (expiry) {
    adminTokens.delete(token);
    saveAdminTokens();
  }
  res.status(401).json({ ok: false, error: 'Yetkisiz. Giriş yapın.' });
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.json({ ok: true, token: 'no-auth' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, error: 'Geçersiz şifre' });
  const token = crypto.randomBytes(32).toString('hex');
  adminTokens.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
  saveAdminTokens();
  res.json({ ok: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getAdminTokenFromRequest(req);
  adminTokens.delete(token);
  saveAdminTokens();
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAdmin, (req, res) => {
  res.json({ ok: true, role: 'admin' });
});

function isLocalhost() {
  return baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
}

// ——— API ———
app.get('/api/menu', (req, res) => {
  const menu = getCachedMenu();
  if (!menu) return res.status(500).json({ error: 'Menü yüklenemedi' });
  res.json(menu);
});
app.get('/api/favorites', (req, res) => {
  const { telegramId, whatsappId } = req.query;
  const favs = loadFavorites().filter(f =>
    (telegramId && f.telegramId === telegramId) || (whatsappId && f.whatsappId === whatsappId)
  );
  res.json({ favorites: favs });
});
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const favs = loadFavorites();
  const today = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
  res.json({
    favoritesCount: favs.length,
    totalOrders: orders.length,
    totalRevenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    todayOrders: today.length,
    todayRevenue: today.reduce((s, o) => s + (o.total || 0), 0)
  });
});
app.get('/api/analytics', requireAdmin, (req, res) => {
  const byStatus = {};
  orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  res.json({ byStatus, total: orders.length });
});
app.get('/api/favorites/:id', (req, res) => {
  const { telegramId, whatsappId } = req.query;
  const fav = loadFavorites().find(f => {
    if (f.id !== parseInt(req.params.id)) return false;
    return (telegramId && f.telegramId === telegramId) || (whatsappId && f.whatsappId === whatsappId);
  });
  if (!fav) return res.status(404).json({ error: 'Favori bulunamadı' });
  res.json(fav);
});
app.post('/api/favorites', (req, res) => {
  const { telegramId, whatsappId, orderId, items, total, name } = req.body;
  const userId = telegramId || whatsappId;
  if (!userId || !orderId || !items || total == null) {
    return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
  }
  const favs = loadFavorites();
  const id = favs.length ? Math.max(...favs.map(f => f.id)) + 1 : 1;
  const fav = {
    id, orderId: parseInt(orderId), items, total: Number(total),
    name: name || `Sipariş ${orderId}`
  };
  if (telegramId) fav.telegramId = String(telegramId);
  if (whatsappId) fav.whatsappId = String(whatsappId);
  favs.push(fav);
  saveFavorites(favs);
  res.json({ ok: true, favoriteId: id });
});
app.delete('/api/favorites/:id', (req, res) => {
  const { telegramId, whatsappId } = req.query;
  const id = parseInt(req.params.id);
  const favs = loadFavorites();
  const idx = favs.findIndex(f => {
    if (f.id !== id) return false;
    return (telegramId && f.telegramId === String(telegramId)) || (whatsappId && f.whatsappId === String(whatsappId));
  });
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Favori bulunamadı' });
  favs.splice(idx, 1);
  saveFavorites(favs);
  res.json({ ok: true });
});
app.get('/api/restaurant', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rest = getCachedRestaurant();
  rest.isOpen = isOpen(rest);
  rest.minOrderAmount = Number(rest.minOrderAmount) || 0;
  res.json(rest);
});
app.get('/api/user/prefs', (req, res) => {
  const key = prefsKey(req.query.telegramId, req.query.whatsappId);
  if (!key) return res.status(400).json({ error: 'telegramId veya whatsappId gerekli' });
  const p = loadPrefs()[key] || { notify: true, addresses: [] };
  res.json(p);
});
app.post('/api/user/prefs', (req, res) => {
  const { telegramId, whatsappId, notify, address } = req.body;
  const key = prefsKey(telegramId, whatsappId);
  if (!key) return res.status(400).json({ ok: false });
  const prefs = loadPrefs();
  if (!prefs[key]) prefs[key] = { notify: true, addresses: [] };
  if (typeof notify === 'boolean') prefs[key].notify = notify;
  if (address) {
    const addrs = prefs[key].addresses || [];
    if (!addrs.includes(address)) addrs.push(address);
    prefs[key].addresses = addrs.slice(-5);
  }
  savePrefs(prefs);
  res.json({ ok: true });
});
app.post('/api/coupon/validate', (req, res) => {
  const { code, subtotal } = req.body;
  const result = validateCoupon(code, Number(subtotal) || 0, getRestaurant);
  if (!result) return res.json({ ok: false, error: 'Geçersiz kupon' });
  res.json({ ok: true, discount: result.discount, finalTotal: Math.max(0, (Number(subtotal) || 0) - result.discount) });
});
app.post('/api/upload', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err && err.message && err.message.includes('resim')) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err) return next(err);
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Dosya yok' });
  const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const finalExt = ALLOWED_EXT.includes(safeExt) ? safeExt : 'jpg';
  const newName = req.file.filename + '.' + finalExt;
  const newPath = path.join(UPLOADS_DIR, newName);
  fs.renameSync(req.file.path, newPath);
  res.json({ ok: true, url: '/uploads/' + newName });
});

app.put('/api/restaurant', requireAdmin, (req, res) => {
  const { error, value } = validateRestaurant(req.body || {});
  if (error) return res.status(400).json({ ok: false, error: 'Geçersiz veri: ' + error });
  try {
    fs.writeFileSync(RESTAURANT_PATH, JSON.stringify(value, null, 2));
    invalidateRestaurantCache();
    res.json({ ok: true });
  } catch (e) {
    logError('Restaurant save', e);
    res.status(500).json({ ok: false, error: 'Kaydedilemedi' });
  }
});
app.put('/api/menu', requireAdmin, (req, res) => {
  const { error, value } = validateMenu(req.body || {});
  if (error) return res.status(400).json({ ok: false, error: 'Geçersiz veri: ' + error });
  try {
    fs.writeFileSync(MENU_PATH, JSON.stringify(value, null, 2));
    invalidateMenuCache();
    res.json({ ok: true });
  } catch (e) {
    logError('Menu save', e);
    res.status(500).json({ ok: false, error: 'Kaydedilemedi' });
  }
});

// ——— Sipariş API ———
app.post('/api/order', (req, res) => {
  try {
    const { telegramId, whatsappId, items, total, address, notes, orderType, paymentMethod, location, couponCode } = req.body;
    const userId = telegramId || whatsappId;
    if (!userId || !items || total == null) {
      return res.status(400).json({ ok: false, error: 'Eksik bilgi (telegramId veya whatsappId gerekli)' });
    }
    const rest = getRestaurant();
    if (!isOpen(rest)) {
      return res.status(400).json({ ok: false, error: 'Restoran şu an kapalı. Çalışma saatleri: ' + (rest.hours || rest.hoursOpen + ' - ' + rest.hoursClose) });
    }
    const subtotal = Number(total);
    const minOrder = Number(rest.minOrderAmount) || 0;
    if (subtotal < minOrder) {
      return res.status(400).json({ ok: false, error: `Minimum sipariş tutarı ${minOrder}₺. Sepetiniz: ${subtotal}₺` });
    }
    let discountAmount = 0;
    let finalTotal = subtotal;
    if (couponCode) {
      const coup = validateCoupon(couponCode, subtotal, getRestaurant);
      if (coup) {
        discountAmount = coup.discount;
        finalTotal = Math.max(0, subtotal - discountAmount);
      }
    }
    const id = orderIdCounter++;
    const payMethod = ['kapida_nakit', 'kapida_pos'].includes(paymentMethod) ? paymentMethod : 'kapida_nakit';
    const isGelAl = (orderType || 'paket') === 'gel_al' || (orderType || '') === 'restoran';
    const defaultEst = isGelAl
      ? (rest.estimatedMinutesGelAl ?? rest.estimatedMinutes ?? 25)
      : (rest.estimatedMinutesPaket ?? rest.estimatedMinutes ?? 25);
    const order = {
      id, items,
      total: finalTotal, subtotal, discountAmount,
      address: address || 'Belirtilmedi', notes: notes || '', orderType: orderType || 'paket',
      paymentMethod: payMethod,
      location: location && typeof location === 'object' && location.lat && location.lng ? location : null,
      couponCode: discountAmount ? couponCode : null,
      status: 'Alındı', createdAt: new Date().toISOString(),
      estimatedMinutes: defaultEst
    };
    if (telegramId) order.telegramId = String(telegramId);
    if (whatsappId) order.whatsappId = String(whatsappId);
    orders.push(order);
    saveOrders(orders);
    const prefsKeyUser = prefsKey(telegramId, whatsappId);
    const addr = order.address && order.address !== 'Belirtilmedi' ? order.address : null;
    if (addr && prefsKeyUser) {
      const prefs = loadPrefs();
      if (!prefs[prefsKeyUser]) prefs[prefsKeyUser] = { notify: true, addresses: [] };
      const addrs = prefs[prefsKeyUser].addresses || [];
      if (!addrs.includes(addr)) addrs.push(addr);
      prefs[prefsKeyUser].addresses = addrs.slice(-5);
      savePrefs(prefs);
    }
    const confirmText = formatOrderConfirm(order, getRestaurant);
    if (telegramId) {
      bot.sendMessage(telegramId, confirmText, { parse_mode: 'HTML' }).catch(e => logError('Bot mesaj', e));
      pendingLocationForOrder.set(String(telegramId), id);
      bot.sendMessage(telegramId, '📍 Teslimat adresi için konumunuzu paylaşır mısınız?\n\n<b>Atamaya tıklayın → Konum</b>', { parse_mode: 'HTML' }).catch(() => {});
    } else if (whatsappId) {
      sendWhatsAppMessage(whatsappId, confirmText.replace(/<[^>]+>/g, '').trim());
      pendingLocationForOrder.set('wa_' + String(whatsappId), id);
      sendWhatsAppMessage(whatsappId, '📍 Teslimat adresi için konumunuzu paylaşabilirsiniz (konum gönderin).');
    }
    res.json({ ok: true, orderId: id });
  } catch (e) {
    logError('Sipariş hatası', e);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu' });
  }
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.json({ orders: [...orders].reverse() });
});
app.get('/api/my-orders', (req, res) => {
  const { telegramId, whatsappId } = req.query;
  const key = prefsKey(telegramId, whatsappId);
  if (!key) return res.status(400).json({ error: 'telegramId veya whatsappId gerekli' });
  const list = orders.filter(o => orderUserMatch(o, telegramId, whatsappId)).slice(-20).reverse();
  res.json({ orders: list });
});
app.get('/api/orders/:id', (req, res) => {
  const { telegramId, whatsappId } = req.query;
  const order = orders.find(o => o.id === parseInt(req.params.id) && orderUserMatch(o, req.query.telegramId, req.query.whatsappId));
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  res.json(order);
});

app.post('/api/orders/:id/add', (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId, whatsappId, items, total } = req.body;
  const order = orders.find(o => o.id === id && orderUserMatch(o, telegramId, whatsappId));
  if (!order) return res.status(404).json({ ok: false, error: 'Sipariş bulunamadı' });
  const canAdd = ['Alındı', 'Hazırlanıyor', 'Hazır'].includes(order.status);
  if (!canAdd) return res.status(400).json({ ok: false, error: 'Sipariş yola çıktı, ekleme yapılamaz' });
  if (!items || total == null) return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
  const prevItems = order.items || '';
  order.items = prevItems ? `${prevItems}, ${items}` : items;
  order.total = (order.total || 0) + Number(total);
  if (order.subtotal != null) order.subtotal += Number(total);
  saveOrders(orders);
  const addMsg = `➕ Eklemeler sipariş #${id} eklendi.\n\nYeni toplam: ${order.total}₺`;
  if (order.telegramId) bot.sendMessage(order.telegramId, addMsg, { parse_mode: 'HTML' }).catch(() => {});
  else if (order.whatsappId) sendWhatsAppMessage(order.whatsappId, addMsg);
  res.json({ ok: true, order });
});

const CANCEL_MINUTES = 10;
function canCustomerCancel(order) {
  return order.status === 'Alındı' && (Date.now() - new Date(order.createdAt).getTime()) < CANCEL_MINUTES * 60 * 1000;
}

function getAdminTokenFromRequest(req) {
  return (req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')).trim();
}

function isAdminRequest(req) {
  if (!ADMIN_PASSWORD) return true;
  const token = getAdminTokenFromRequest(req);
  const expiry = adminTokens.get(token);
  return !!(expiry && Date.now() < expiry);
}

app.patch('/api/orders/:id', (req, res, next) => {
  const id = parseInt(req.params.id);
  const { status, cancelReason, estimatedMinutes, telegramId, whatsappId } = req.body || {};
  const order = orders.find(o => o.id === id);
  if (!order || !status) return res.status(400).json({ ok: false });
  const isAdmin = isAdminRequest(req);
  if (status === 'İptal' && !isAdmin) {
    const userId = telegramId || whatsappId;
    if (!userId || !orderUserMatch(order, telegramId, whatsappId)) return res.status(403).json({ ok: false, error: 'Bu siparişe ait değilsiniz.' });
    if (!canCustomerCancel(order)) return res.status(400).json({ ok: false, error: 'Sipariş artık iptal edilemez veya 10 dakika geçti.' });
    order.status = 'İptal';
    order.cancelReason = 'Müşteri iptali';
    saveOrders(orders);
    return res.json({ ok: true, order });
  }
  if (!isAdmin) return res.status(401).json({ ok: false, error: 'Yetkisiz. Giriş yapın.' });
  next();
}, (req, res) => {
  const id = parseInt(req.params.id);
  const { status, cancelReason, estimatedMinutes } = req.body || {};
  const order = orders.find(o => o.id === id);
  const valid = ['Alındı', 'Hazırlanıyor', 'Hazır', 'Yola Çıktı', 'Teslim Edildi', 'İptal'];
  if (!valid.includes(status)) return res.status(400).json({ ok: false });
  order.status = status;
  if (status === 'İptal') order.cancelReason = (cancelReason || '').trim();
  else order.cancelReason = undefined;
  if (estimatedMinutes != null && estimatedMinutes !== '') {
    const mins = Number(estimatedMinutes);
    if (!Number.isNaN(mins) && mins > 0) order.estimatedMinutes = mins;
  }
  saveOrders(orders);
  const r = getRestaurant();
  const est = order.estimatedMinutes ?? r.estimatedMinutes ?? 25;
  const estSuffix = (status === 'Hazırlanıyor' || status === 'Hazır') ? `\n⏱ Tahminen ${est} dakika içinde hazır olacak.` : '';
  const msgs = {
    'Hazırlanıyor': '👨‍🍳 Siparişin hazırlanıyor.' + estSuffix,
    'Hazır': '✅ Hazır, birazdan yola çıkacak.' + estSuffix,
    'Yola Çıktı': '🚗 Siparişin yolda!',
    'Teslim Edildi': '🎉 Teslim edildi. Afiyet olsun!',
    'İptal': '❌ Siparişin iptal edildi.'
  };
  if (msgs[status]) {
    const prefsKeyUser = prefsKey(order.telegramId, order.whatsappId);
    const prefs = loadPrefs();
    const notify = (prefsKeyUser && (prefs[prefsKeyUser] || {}).notify) !== false;
    if (notify) {
      const statusText = `📦 Sipariş #${id}\n\n${msgs[status]}`;
      if (order.telegramId) {
        let opts = {};
        if (status === 'Teslim Edildi') {
          const favs = loadFavorites();
          const isFav = favs.some(f => f.telegramId === order.telegramId && f.orderId === id);
          if (!isFav) opts.reply_markup = { inline_keyboard: [[{ text: '⭐ Favorilere Ekle', callback_data: `fav_add_${id}` }]] };
        }
        bot.sendMessage(order.telegramId, `📦 <b>Sipariş #${id}</b>\n\n${msgs[status]}`, { parse_mode: 'HTML', ...opts }).catch(() => {});
        if (status === 'Teslim Edildi') {
          setTimeout(() => {
            bot.sendMessage(order.telegramId, 'Siparişiniz nasıldı? Yorumlarınız bizim için önemli 💚').catch(() => {});
          }, 60 * 1000);
        }
      } else if (order.whatsappId) {
        sendWhatsAppMessage(order.whatsappId, statusText);
        if (status === 'Teslim Edildi') {
          setTimeout(() => {
            sendWhatsAppMessage(order.whatsappId, 'Siparişiniz nasıldı? Yorumlarınız bizim için önemli 💚');
          }, 60 * 1000);
        }
      }
    }
  }
  res.json({ ok: true, order });
});

// ——— Buton akışları ———
const menuUrl = (chatId, extra = '') => `${baseUrl}/menu.html?tg=${chatId}${extra ? '&' + extra : ''}`;
const helpUrl = () => `${baseUrl}/help.html`;

// web_app = Telegram içinde mini uygulama açar (HTTPS gerekli). localhost'ta url kullan.
function menuButton(chatId, text, extra = '') {
  const url = menuUrl(chatId, extra);
  if (isLocalhost()) return { text, url };
  return { text, web_app: { url } };
}

function buildMainKeyboard(chatId) {
  const useUrl = !isLocalhost();
  const siparisBtn = useUrl ? menuButton(chatId, '🍽️ Menüyü açın') : { text: '🍽️ Menüyü açın', callback_data: 'open_menu' };
  const activeCampaign = getActiveCampaign();
  const row2 = [
    { text: '📋 Siparişlerim', callback_data: 'my_orders' },
    { text: '⭐ Favorilerim', callback_data: 'open_favorites' }
  ];
  if (activeCampaign) row2.push({ text: '🎯 Kampanyalarım', callback_data: 'campaigns' });
  return {
    inline_keyboard: [
      [siparisBtn],
      row2,
      [{ text: '📍 Adres & iletişim', callback_data: 'help' }, { text: '⚙️ Ayarlar', callback_data: 'settings' }]
    ]
  };
}

function sendMainMenu(chatId, firstName) {
  const r = getRestaurant();
  const name = firstName || 'Müşteri';
  const openNow = isOpen(r);
  const status = openNow ? '🟢 Açık' : '🔴 Kapalı';
  const text = `👋 Merhaba ${name}!\n\n<b>${r.name || 'MeraPaket'}</b> — ${status}\n${r.hours || ''}\n\nNe yapmak istersin? Aşağıdaki butonlardan seçebilirsin.`;
  return bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: buildMainKeyboard(chatId) }).catch(e => logError('Bot mesaj', e));
}

// Konum sipariş verdikten sonra istenir (menüden değil)
const pendingLocationForOrder = new Map();

bot.on('message', (msg) => {
  if (msg.location) {
    const chatId = msg.chat.id;
    const orderId = pendingLocationForOrder.get(String(chatId));
    if (orderId) {
      pendingLocationForOrder.delete(String(chatId));
      const order = orders.find(o => o.id === orderId);
      if (order) {
        order.location = { lat: msg.location.latitude, lng: msg.location.longitude };
        saveOrders(orders);
      }
      bot.sendMessage(chatId, '✅ Konumun alındı, teşekkürler!', { reply_markup: buildMainKeyboard(chatId) }).catch(() => {});
    } else {
      sendMainMenu(chatId, msg.from?.first_name);
    }
    return;
  }
  if (msg.text) sendMainMenu(msg.chat.id, msg.from?.first_name);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'open_menu') {
    bot.answerCallbackQuery(query.id);
    if (isLocalhost()) {
      await bot.sendMessage(chatId, `Menüyü açıp sipariş verebilirsin:\n\n${menuUrl(chatId)}`);
    } else {
      await bot.sendMessage(chatId, 'Menüyü açıp yemek seçebilirsin. Aşağıdaki butona tıkla:', {
        reply_markup: { inline_keyboard: [[menuButton(chatId, '🍽️ Menüyü açın')], [{ text: '⬅️ Geri', callback_data: 'main_menu' }]] }
      });
    }
    return;
  }

  if (data === 'open_favorites') {
    bot.answerCallbackQuery(query.id);
    const favUrl = menuUrl(chatId, 'section=favorites');
    if (isLocalhost()) {
      await bot.sendMessage(chatId, `Favorilerin:\n\n${favUrl}`);
    } else {
      const favBtn = { text: '⭐ Favorilerim', web_app: { url: favUrl } };
      await bot.sendMessage(chatId, 'Favori siparişlerine buradan ulaşabilirsin:', {
        reply_markup: { inline_keyboard: [[favBtn], [{ text: '⬅️ Geri', callback_data: 'main_menu' }]] }
      });
    }
    return;
  }

  if (data === 'menu_preview') {
    bot.answerCallbackQuery(query.id);
    if (isLocalhost()) {
      await bot.sendMessage(chatId, `Menüyü açıp sipariş verebilirsin:\n\n${menuUrl(chatId)}`);
    } else {
      await bot.sendMessage(chatId, 'Menüyü açıp yemek seçebilirsin. Butona tıkla:', {
        reply_markup: { inline_keyboard: [[menuButton(chatId, '🍽️ Menüyü açın')], [{ text: '⬅️ Geri', callback_data: 'main_menu' }]] }
      });
    }
    return;
  }

  if (data === 'my_orders') {
    const userOrders = orders.filter(o => o.telegramId === String(chatId)).slice(-10).reverse();
    const activeOrders = userOrders.filter(o => o.status !== 'Teslim Edildi' && o.status !== 'İptal');
    const pastOrders = userOrders.filter(o => o.status === 'Teslim Edildi').slice(0, 5);
    bot.answerCallbackQuery(query.id);

    const shortItems = (itemsStr) => {
      if (!itemsStr) return '';
      const parts = itemsStr.split(', ').slice(0, 2);
      return parts.map(p => p.replace(/\d+x\s+/, '').replace(/\s*\(\d+₺\)/, '')).join(', ') + (itemsStr.split(', ').length > 2 ? '...' : '');
    };
    const statusEmo = { Alındı: '📥', Hazırlanıyor: '👨‍🍳', Hazır: '✓', 'Yola Çıktı': '🚗' };
    let text = '<b>📋 Siparişlerim</b>\n\n';
    if (activeOrders.length > 0) {
      text += '<b>Devam eden siparişler</b>\n';
      activeOrders.forEach(o => {
        text += `${statusEmo[o.status] || '•'} ${o.status} — ${shortItems(o.items) || 'Sipariş'}\n`;
      });
      text += '\n';
    }
    if (pastOrders.length > 0) {
      text += '<b>Geçmiş siparişler</b>\n';
      pastOrders.forEach(o => {
        text += `• ${shortItems(o.items) || 'Sipariş'} — ${o.total}₺\n`;
      });
    }
    if (activeOrders.length === 0 && pastOrders.length === 0) text += 'Henüz sipariş yok. Yeni sipariş vermek için butona tıkla.';

    const CANCEL_MINUTES = 10;
    const canCancel = (o) => o.status === 'Alındı' && (Date.now() - new Date(o.createdAt).getTime()) < CANCEL_MINUTES * 60 * 1000;
    const canAdd = (o) => ['Alındı', 'Hazırlanıyor', 'Hazır'].includes(o.status);
    const kb = { inline_keyboard: [] };
    if (activeOrders.length > 0) {
      activeOrders.forEach(o => {
        const hint = (shortItems(o.items) || String(o.total) + '₺').slice(0, 15);
        const row = [{ text: `${statusEmo[o.status] || ''} ${o.status} — ${hint}`, callback_data: `order_status_${o.id}` }];
        if (canAdd(o)) row.push({ text: '➕ Ürün ekleyebilirsiniz', callback_data: `order_add_${o.id}` });
        if (canCancel(o)) row.push({ text: '❌ İptal', callback_data: `order_cancel_${o.id}` });
        kb.inline_keyboard.push(row);
      });
    }
    pastOrders.forEach(o => {
      const lbl = (shortItems(o.items) || '').slice(0, 20) + ((shortItems(o.items) || '').length > 20 ? '…' : '') || o.total + '₺';
      kb.inline_keyboard.push([{ text: `📋 Detay gör — ${lbl}`, callback_data: `order_detail_${o.id}` }]);
    });
    kb.inline_keyboard.push(
      [isLocalhost() ? { text: '🍽️ Teşekkürler! Yeni sipariş ver', callback_data: 'open_menu' } : menuButton(chatId, '🍽️ Teşekkürler! Yeni sipariş ver')],
      [{ text: '🏠 Ana sayfa', callback_data: 'main_menu' }]
    );

    await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb }).catch(() =>
      bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb })
    );
    return;
  }

  if (data.startsWith('order_cancel_')) {
    const orderId = parseInt(data.replace('order_cancel_', ''));
    const order = orders.find(o => o.id === orderId && o.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (!order) {
      await bot.sendMessage(chatId, 'Böyle bir sipariş bulunamadı.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    if (order.status !== 'Alındı') {
      await bot.sendMessage(chatId, 'Bu sipariş artık iptal edilemez, çok ilerlemiş.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const created = new Date(order.createdAt).getTime();
    if (Date.now() - created > 10 * 60 * 1000) {
      await bot.sendMessage(chatId, 'İptal için 10 dakika geçmiş. İptal etmek istersen bizimle iletişime geç.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    order.status = 'İptal';
    order.cancelReason = 'Müşteri iptali';
    saveOrders(orders);
    await bot.sendMessage(chatId, 'Siparişin iptal edildi.', { reply_markup: buildMainKeyboard(chatId) });
    return;
  }

  if (data.startsWith('order_add_')) {
    const orderId = parseInt(data.replace('order_add_', ''));
    const order = orders.find(o => o.id === orderId && o.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (!order) {
      await bot.sendMessage(chatId, 'Böyle bir sipariş bulunamadı.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    if (!['Alındı', 'Hazırlanıyor', 'Hazır'].includes(order.status)) {
      await bot.sendMessage(chatId, 'Siparişin yolda, artık ekleme yapamıyoruz.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const useUrl = !isLocalhost();
    await bot.sendMessage(chatId, 'Menüden eklemek istediklerini seç. Sepete eklenecek:', {
      reply_markup: useUrl ? { inline_keyboard: [[menuButton(chatId, '➕ Menüden ekleyin', `add=${orderId}`)], [{ text: '⬅️ Geri', callback_data: 'my_orders' }]] } : undefined
    });
    if (!useUrl) await bot.sendMessage(chatId, menuUrl(chatId, `add=${orderId}`)).catch(() => {});
    return;
  }

  if (data.startsWith('order_detail_')) {
    const orderId = parseInt(data.replace('order_detail_', ''));
    const order = orders.find(o => o.id === orderId && o.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (!order) {
      await bot.sendMessage(chatId, 'Böyle bir sipariş bulunamadı.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const text = `<b>Sipariş Detayı</b>\n\n${order.items}\n\n📍 ${order.address}\n💰 ${order.total}₺`;
    const kb = { inline_keyboard: [[{ text: '📋 Siparişlerime dön', callback_data: 'my_orders' }]] };
    await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb }).catch(() =>
      bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb })
    );
    return;
  }

  if (data.startsWith('order_status_')) {
    const orderId = parseInt(data.replace('order_status_', ''));
    const order = orders.find(o => o.id === orderId && o.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (!order) {
      await bot.sendMessage(chatId, 'Böyle bir sipariş bulunamadı.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const statusEmo = { Alındı: '📥', Hazırlanıyor: '👨‍🍳', Hazır: '✅', 'Yola Çıktı': '🚗', 'Teslim Edildi': '🎉' };
    const text = `<b>Siparişiniz</b>\n\n${statusEmo[order.status] || '•'} ${order.status}\n💰 ${order.total}₺`;
    const canAdd = ['Alındı', 'Hazırlanıyor', 'Hazır'].includes(order.status);
    const kb = {
      inline_keyboard: [
        ...(canAdd ? [[{ text: '➕ Ürün ekleyebilirsiniz', callback_data: `order_add_${order.id}` }]] : []),
        [{ text: '📋 Siparişlerime dön', callback_data: 'my_orders' }]
      ]
    };
    await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb }).catch(() =>
      bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb })
    );
    return;
  }

  if (data.startsWith('fav_add_')) {
    const orderId = parseInt(data.replace('fav_add_', ''));
    const order = orders.find(o => o.id === orderId);
    bot.answerCallbackQuery(query.id);
    if (!order || order.telegramId !== String(chatId)) {
      await bot.sendMessage(chatId, 'Böyle bir sipariş bulunamadı.');
      return;
    }
    const favs = loadFavorites();
    if (favs.some(f => f.telegramId === String(chatId) && f.orderId === orderId)) {
      await bot.sendMessage(chatId, 'Bu sipariş zaten favorilerinde.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    favs.push({
      id: (favs.length ? Math.max(...favs.map(f => f.id)) + 1 : 1),
      telegramId: String(chatId),
      orderId,
      items: order.items,
      total: order.total,
      name: `Sipariş ${orderId}`
    });
    saveFavorites(favs);
    bot.answerCallbackQuery(query.id, { text: '⭐ Favorilere eklendi' });
    return;
  }

  if (data === 'favorites') {
    const favs = loadFavorites().filter(f => f.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (favs.length === 0) {
      await bot.sendMessage(chatId, 'Henüz favori siparişin yok. Geçmiş siparişlerden favorilere ekleyebilirsin.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const text = '<b>⭐ Favorilerim</b>\n\n' + favs.map(f => `• ${f.name} — ${f.total}₺`).join('\n');
    const kb = {
      inline_keyboard: favs.map(f => [{ text: `🛒 ${f.name}`, callback_data: `fav_order_${f.id}` }]).concat([[{ text: '⬅️ Geri', callback_data: 'my_orders' }]])
    };
    await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb }).catch(() =>
      bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb })
    );
    return;
  }

  if (data.startsWith('fav_order_')) {
    const favId = parseInt(data.replace('fav_order_', ''));
    const fav = loadFavorites().find(f => f.id === favId && f.telegramId === String(chatId));
    bot.answerCallbackQuery(query.id);
    if (!fav) {
      await bot.sendMessage(chatId, 'Bu favori bulunamadı.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const useUrl = !isLocalhost();
    await bot.sendMessage(chatId, useUrl ? 'Bu favori sipariş sepete eklenecek. Butona tıkla:' : `Menüyü aç:\n${menuUrl(chatId, `fav=${favId}`)}`, {
      reply_markup: useUrl ? { inline_keyboard: [[menuButton(chatId, '🍽️ Teşekkürler! Bu siparişi tekrar verin', `fav=${favId}`)], [{ text: '⬅️ Geri', callback_data: 'favorites' }]] } : undefined
    });
    return;
  }

  if (data === 'settings' || data.startsWith('notify_')) {
    bot.answerCallbackQuery(query.id);
    if (data.startsWith('notify_')) {
      const on = data === 'notify_on';
      const prefs = loadPrefs();
      if (!prefs[chatId]) prefs[chatId] = { notify: true, addresses: [] };
      prefs[chatId].notify = on;
      savePrefs(prefs);
    }
    const prefs = loadPrefs()[chatId] || { notify: true, addresses: [] };
    const addrs = prefs.addresses || [];
    let text = '<b>⚙️ Ayarlar</b>\n\n';
    text += `Bildirimler: ${prefs.notify ? 'Açık — Sipariş durumu güncellenince haberdar olursun.' : 'Kapalı'}\n`;
    if (addrs.length) text += '\n<b>Kayıtlı adresler:</b>\n' + addrs.slice(-3).map((a, i) => `${i + 1}. ${a.slice(0, 40)}${a.length > 40 ? '...' : ''}`).join('\n');
    const kb = {
      inline_keyboard: [
        [{ text: prefs.notify ? '🔕 Bildirimleri kapat' : '🔔 Bildirimleri aç', callback_data: prefs.notify ? 'notify_off' : 'notify_on' }],
        [{ text: '🏠 Ana sayfa', callback_data: 'main_menu' }]
      ]
    };
    await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb }).catch(() =>
      bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb })
    );
    return;
  }

  if (data === 'campaigns') {
    const campaign = getActiveCampaign(getRestaurant);
    bot.answerCallbackQuery(query.id);
    if (!campaign) {
      await bot.sendMessage(chatId, 'Şu an aktif kampanya yok.', { reply_markup: buildMainKeyboard(chatId) });
      return;
    }
    const desc = campaign.description || 'Aktif kampanya';
    const text = `🎯 <b>Aktif Kampanya</b>\n\n${desc}\n\nMenüden sipariş verirken otomatik uygulanacak.`;
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: buildMainKeyboard(chatId) });
    return;
  }

  if (data === 'help') {
    const r = getRestaurant();
    const text = `<b>${r.name || 'MeraPaket'}</b>\n\n📍 ${r.address || '-'}\n📞 ${r.phone || '-'}\n🕐 ${r.hours || '-'}`;
    bot.answerCallbackQuery(query.id);
    const useUrl = !isLocalhost();
    const kb = {
      inline_keyboard: [
        ...(useUrl ? [[{ text: '🌐 Detaylı Bilgi', url: helpUrl() }]] : []),
        [{ text: '🏠 Ana sayfa', callback_data: 'main_menu' }]
      ]
    };
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  if (data === 'main_menu') {
    bot.answerCallbackQuery(query.id);
    await sendMainMenu(chatId, query.from?.first_name);
  }
});

app.get('/', (req, res) => res.redirect('/menu.html'));
app.get('/qr', (req, res) => {
  const r = getRestaurant();
  const menuLink = baseUrl + '/menu.html';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR Menü - ${r.name || 'MeraPaket'}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff"><h1>${r.name || 'MeraPaket'}</h1><p>Menüyü açmak için linke tıklayın veya QR kod ile tarayın</p><p><a href="${menuLink}" style="color:#22c55e">${menuLink}</a></p><p style="color:#666;font-size:12px">QR için: <a href="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(menuLink)}" target="_blank" style="color:#22c55e">QR Kod Oluştur</a></p></body></html>`);
});

function startServer(port) {
  const server = app.listen(port, async () => {
    console.log(`\n🚀 MeraPaket Menü`);
    console.log(`   Yerel:  http://localhost:${port}`);
    console.log(`   Panel:  http://localhost:${port}/panel.html`);
    if (whatsappEnabled) {
      console.log(`   WhatsApp webhook: ${baseUrl}/webhook/whatsapp`);
    } else {
      console.log(`   WhatsApp: .env'de WA_PHONE_NUMBER_ID ve WA_ACCESS_TOKEN tanımlayın`);
    }

    if (USE_NGROK) {
      try {
        const listener = await ngrok.forward({ addr: port, authtoken_from_env: true });
        baseUrl = listener.url();
        console.log(`\n   ngrok:  ${baseUrl}`);
        console.log(`   Menü:   ${baseUrl}/menu.html`);
        console.log(`   Yardım: ${baseUrl}/help.html`);
      } catch (e) {
        console.error('\n   ⚠️ ngrok başlatılamadı:', e.message);
        console.log('   Not: ngrok.com hesabı ve authtoken gerekebilir.');
      }
    }
    console.log('\n');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${port} meşgul, ${port + 1} deneniyor...`);
      startServer(port + 1);
    } else throw err;
  });
}
startServer(PORT);
