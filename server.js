require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const ngrok = require('@ngrok/ngrok');
const rateLimit = require('express-rate-limit');
const { logError } = require('./lib/logger');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = parseInt(process.env.PORT) || 3005;
const USE_NGROK = process.env.USE_NGROK === 'true' || process.env.USE_NGROK === '1';

let baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

const ORDERS_PATH = path.join(__dirname, 'data', 'orders.json');
const FAVORITES_PATH = path.join(__dirname, 'data', 'favorites.json');
const PREFS_PATH = path.join(__dirname, 'data', 'userPrefs.json');
const MENU_PATH = path.join(__dirname, 'config', 'menu.json');
const RESTAURANT_PATH = path.join(__dirname, 'config', 'restaurant.json');

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN bulunamadı. .env dosyasını oluştur ve token ekle.');
  process.exit(1);
}

function loadOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function saveOrders(arr) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(arr, null, 2));
}
function loadFavorites() {
  try {
    return JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function saveFavorites(arr) {
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(arr, null, 2));
}
function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')); } catch { return {}; }
}
function savePrefs(obj) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(obj, null, 2));
}

let orders = loadOrders();
let orderIdCounter = Math.max(1, ...orders.map(o => o.id), 0) + 1;

const bot = new TelegramBot(TOKEN, { polling: true });

bot.on('polling_error', (err) => {
  logError('Telegram polling', err);
  console.error('❌ Telegram polling:', err.message);
});
bot.on('message', (msg) => {
  console.log('📩', msg.from?.username || msg.from?.id, '→', (msg.text || '').slice(0, 40));
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting: 60 istek/dakika
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { ok: false, error: 'Çok fazla istek. Lütfen bekleyin.' }
});
app.use('/api/', apiLimiter);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const adminTokens = new Set();

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const token = req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token && adminTokens.has(token)) return next();
  res.status(401).json({ ok: false, error: 'Yetkisiz. Giriş yapın.' });
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.json({ ok: true, token: 'no-auth' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, error: 'Geçersiz şifre' });
  const token = crypto.randomBytes(32).toString('hex');
  adminTokens.add(token);
  res.json({ ok: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  adminTokens.delete(token);
  res.json({ ok: true });
});

function isLocalhost() {
  return baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
}

// ——— API ———
app.get('/api/menu', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(MENU_PATH, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Menü yüklenemedi' });
  }
});
app.get('/api/favorites', (req, res) => {
  const favs = loadFavorites().filter(f => f.telegramId === req.query.telegramId);
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
  const fav = loadFavorites().find(f => f.id === parseInt(req.params.id) && f.telegramId === req.query.telegramId);
  if (!fav) return res.status(404).json({ error: 'Favori bulunamadı' });
  res.json(fav);
});
app.post('/api/favorites', (req, res) => {
  const { telegramId, orderId, items, total, name } = req.body;
  if (!telegramId || !orderId || !items || total == null) {
    return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
  }
  const favs = loadFavorites();
  const id = favs.length ? Math.max(...favs.map(f => f.id)) + 1 : 1;
  favs.push({
    id, telegramId: String(telegramId), orderId: parseInt(orderId), items, total: Number(total),
    name: name || `Sipariş ${orderId}`
  });
  saveFavorites(favs);
  res.json({ ok: true, favoriteId: id });
});
app.get('/api/restaurant', (req, res) => {
  try {
    const rest = JSON.parse(fs.readFileSync(RESTAURANT_PATH, 'utf8'));
    rest.isOpen = isOpen(rest);
    rest.minOrderAmount = Number(rest.minOrderAmount) || 0;
    res.json(rest);
  } catch {
    res.json({ name: '', address: '', phone: '', hours: '', isOpen: true, minOrderAmount: 0 });
  }
});
app.get('/api/user/prefs', (req, res) => {
  const p = loadPrefs()[req.query.telegramId] || { notify: true, addresses: [] };
  res.json(p);
});
app.post('/api/user/prefs', (req, res) => {
  const { telegramId, notify, address } = req.body;
  if (!telegramId) return res.status(400).json({ ok: false });
  const prefs = loadPrefs();
  if (!prefs[telegramId]) prefs[telegramId] = { notify: true, addresses: [] };
  if (typeof notify === 'boolean') prefs[telegramId].notify = notify;
  if (address) {
    const addrs = prefs[telegramId].addresses || [];
    if (!addrs.includes(address)) addrs.push(address);
    prefs[telegramId].addresses = addrs.slice(-5);
  }
  savePrefs(prefs);
  res.json({ ok: true });
});
app.post('/api/coupon/validate', (req, res) => {
  const { code, subtotal } = req.body;
  const result = validateCoupon(code, Number(subtotal) || 0);
  if (!result) return res.json({ ok: false, error: 'Geçersiz kupon' });
  res.json({ ok: true, discount: result.discount, finalTotal: Math.max(0, (Number(subtotal) || 0) - result.discount) });
});
app.put('/api/restaurant', requireAdmin, (req, res) => {
  try {
    fs.writeFileSync(RESTAURANT_PATH, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    logError('Restaurant save', e);
    res.status(500).json({ ok: false, error: 'Kaydedilemedi' });
  }
});
app.put('/api/menu', requireAdmin, (req, res) => {
  try {
    fs.writeFileSync(MENU_PATH, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    logError('Menu save', e);
    res.status(500).json({ ok: false, error: 'Kaydedilemedi' });
  }
});

// ——— Sipariş API ———
app.post('/api/order', (req, res) => {
  try {
    const { telegramId, items, total, address, notes, orderType, paymentMethod, location, couponCode } = req.body;
    if (!telegramId || !items || total == null) {
      return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
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
      const coup = validateCoupon(couponCode, subtotal);
      if (coup) {
        discountAmount = coup.discount;
        finalTotal = Math.max(0, subtotal - discountAmount);
      }
    }
    const id = orderIdCounter++;
    const payMethod = ['kapida_nakit', 'kapida_pos'].includes(paymentMethod) ? paymentMethod : 'kapida_nakit';
    const order = {
      id, telegramId: String(telegramId), items,
      total: finalTotal, subtotal, discountAmount,
      address: address || 'Belirtilmedi', notes: notes || '', orderType: orderType || 'paket',
      paymentMethod: payMethod,
      location: location && typeof location === 'object' && location.lat && location.lng ? location : null,
      couponCode: discountAmount ? couponCode : null,
      status: 'Alındı', createdAt: new Date().toISOString()
    };
    orders.push(order);
    saveOrders(orders);
    const addr = order.address && order.address !== 'Belirtilmedi' ? order.address : null;
    if (addr) {
      const prefs = loadPrefs();
      if (!prefs[telegramId]) prefs[telegramId] = { notify: true, addresses: [] };
      const addrs = prefs[telegramId].addresses || [];
      if (!addrs.includes(addr)) addrs.push(addr);
      prefs[telegramId].addresses = addrs.slice(-5);
      savePrefs(prefs);
    }
    bot.sendMessage(telegramId, formatOrderConfirm(order), { parse_mode: 'HTML' }).catch(e => logError('Bot mesaj', e));
    pendingLocationForOrder.set(String(telegramId), id);
    bot.sendMessage(telegramId, '📍 Sana kolay gelsin diye konumunu paylaşır mısın? Böylece adresini daha doğru bulabiliriz.\n\n<b>Konum</b> gönderebilir veya adresini yazabilirsin.', { parse_mode: 'HTML' }).catch(() => {});
    console.log('📥 Sipariş ' + id);
    res.json({ ok: true, orderId: id });
  } catch (e) {
    logError('Sipariş hatası', e);
    res.status(500).json({ ok: false, error: 'Bir hata oluştu' });
  }
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.json({ orders: [...orders].reverse() });
});
app.get('/api/orders/:id', requireAdmin, (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id) && o.telegramId === req.query.telegramId);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  res.json(order);
});

app.post('/api/orders/:id/add', (req, res) => {
  const id = parseInt(req.params.id);
  const { telegramId, items, total } = req.body;
  const order = orders.find(o => o.id === id);
  if (!order || order.telegramId !== String(telegramId)) return res.status(404).json({ ok: false, error: 'Sipariş bulunamadı' });
  const canAdd = ['Alındı', 'Hazırlanıyor', 'Hazır'].includes(order.status);
  if (!canAdd) return res.status(400).json({ ok: false, error: 'Sipariş yola çıktı, ekleme yapılamaz' });
  if (!items || total == null) return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
  const prevItems = order.items || '';
  order.items = prevItems ? `${prevItems}, ${items}` : items;
  order.total = (order.total || 0) + Number(total);
  if (order.subtotal != null) order.subtotal += Number(total);
  saveOrders(orders);
  bot.sendMessage(telegramId, `➕ Eklediklerin siparişe dahil edildi.\n\nYeni tutar: ${order.total}₺`, { parse_mode: 'HTML' }).catch(() => {});
  res.json({ ok: true, order });
});

app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const order = orders.find(o => o.id === id);
  if (!order || !status) return res.status(400).json({ ok: false });
  const valid = ['Alındı', 'Hazırlanıyor', 'Hazır', 'Yola Çıktı', 'Teslim Edildi', 'İptal'];
  if (!valid.includes(status)) return res.status(400).json({ ok: false });
  order.status = status;
  saveOrders(orders);
  const msgs = {
    'Hazırlanıyor': '👨‍🍳 Siparişin hazırlanıyor.',
    'Hazır': '✅ Hazır, birazdan yola çıkacak.',
    'Yola Çıktı': '🚗 Siparişin yolda!',
    'Teslim Edildi': '🎉 Teslim edildi. Afiyet olsun!',
    'İptal': '❌ Siparişin iptal edildi.'
  };
  if (msgs[status]) {
    const prefs = loadPrefs();
    const notify = (prefs[order.telegramId] || {}).notify !== false;
    if (notify) {
      let opts = {};
      if (status === 'Teslim Edildi') {
        const favs = loadFavorites();
        const isFav = favs.some(f => f.telegramId === order.telegramId && f.orderId === id);
        if (!isFav) opts.reply_markup = { inline_keyboard: [[{ text: '⭐ Teşekkürler! Favorilere ekle', callback_data: `fav_add_${id}` }]] };
      }
      bot.sendMessage(order.telegramId, `📦 <b>Siparişin</b>\n\n${msgs[status]}`, { parse_mode: 'HTML', ...opts }).catch(() => {});
      if (status === 'Teslim Edildi') {
        setTimeout(() => {
          bot.sendMessage(order.telegramId, 'Sipariş nasıldı? Yorumunu merak ediyoruz 💚').catch(() => {});
        }, 60 * 1000);
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

function getRestaurant() {
  try {
    return JSON.parse(fs.readFileSync(RESTAURANT_PATH, 'utf8'));
  } catch {
    return { name: 'MeraPaket', address: '-', phone: '-', hours: '-', minOrderAmount: 0, hoursOpen: '00:00', hoursClose: '23:59' };
  }
}

// Çalışma saatleri kontrolü (HH:mm formatı)
function isOpen(rest) {
  if (!rest.hoursOpen || !rest.hoursClose) return true;
  const now = new Date();
  const [oh, om] = rest.hoursOpen.split(':').map(Number);
  const [ch, cm] = rest.hoursClose.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = oh * 60 + om;
  let closeMin = ch * 60 + cm;
  if (closeMin <= openMin) closeMin += 24 * 60; // Gece yarısı geçiyorsa
  const nowNorm = nowMin < openMin ? nowMin + 24 * 60 : nowMin;
  return nowNorm >= openMin && nowNorm < closeMin;
}

// Kupon doğrulama
function validateCoupon(code, subtotal) {
  const rest = getRestaurant();
  const coupons = rest.coupons || [];
  const c = coupons.find(x => String(x.code).toUpperCase() === String(code || '').toUpperCase());
  if (!c) return null;
  let discount = 0;
  if (c.type === 'percent') discount = Math.round(subtotal * (c.discount / 100));
  else if (c.type === 'fixed') discount = Math.min(c.discount, subtotal);
  return { discount, code: c.code };
}

function formatOrderConfirm(order) {
  const r = getRestaurant();
  const est = r.estimatedMinutes || 25;
  const payLabel = order.paymentMethod === 'kapida_pos' ? 'POS' : 'Nakit';
  const disc = order.discountAmount ? `\n🏷 İndirim: -${order.discountAmount}₺` : '';
  return `✅ <b>Siparişin alındı!</b>

📦 ${order.items}

📍 ${order.address}
${order.notes ? `📝 ${order.notes}\n` : ''}💳 ${payLabel}${disc}
💰 <b>${order.total}₺</b>

⏱ Tahminen ${est} dakika içinde hazır olacak.

Afiyet olsun!`;
}

function getActiveCampaign() {
  const r = getRestaurant();
  const campaigns = r.campaigns || {};
  for (const [key, c] of Object.entries(campaigns)) {
    if (c && c.enabled) return { key, ...c };
  }
  return null;
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

function loadMenuForPreview() {
  try {
    const m = JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'));
    const cats = m.categories || [];
    const all = [];
    cats.forEach(c => {
      (c.products || []).slice(0, 3).forEach(p => all.push({ name: p.name, price: p.price, icon: c.icon || '🍽️' }));
    });
    return all.slice(0, 6);
  } catch { return []; }
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
    const campaign = getActiveCampaign();
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
