const fs = require('fs');
const path = require('path');
const { getSupabase, useSupabase } = require('./supabase');

const ORDERS_PATH = path.join(__dirname, '..', 'data', 'orders.json');
const FAVORITES_PATH = path.join(__dirname, '..', 'data', 'favorites.json');
const PREFS_PATH = path.join(__dirname, '..', 'data', 'userPrefs.json');

// ---- Order mapping (camelCase <-> snake_case) ----
function orderToRow(o) {
  return {
    id: o.id,
    telegram_id: o.telegramId || null,
    whatsapp_id: o.whatsappId || null,
    items: o.items || '',
    total: Number(o.total) || 0,
    subtotal: o.subtotal != null ? Number(o.subtotal) : null,
    discount_amount: o.discountAmount != null ? Number(o.discountAmount) : 0,
    address: o.address || 'Belirtilmedi',
    notes: o.notes || '',
    order_type: o.orderType || 'paket',
    payment_method: o.paymentMethod || 'kapida_nakit',
    location: o.location && typeof o.location === 'object' ? o.location : null,
    coupon_code: o.couponCode || null,
    status: o.status || 'Alındı',
    created_at: o.createdAt || new Date().toISOString(),
    estimated_minutes: o.estimatedMinutes != null ? o.estimatedMinutes : null,
    cancel_reason: o.cancelReason || null
  };
}

function rowToOrder(r) {
  if (!r) return null;
  const o = {
    id: r.id,
    telegramId: r.telegram_id,
    whatsappId: r.whatsapp_id,
    items: r.items,
    total: Number(r.total),
    address: r.address,
    notes: r.notes,
    orderType: r.order_type,
    status: r.status,
    createdAt: r.created_at
  };
  if (r.subtotal != null) o.subtotal = Number(r.subtotal);
  if (r.discount_amount != null) o.discountAmount = Number(r.discount_amount);
  if (r.payment_method) o.paymentMethod = r.payment_method;
  if (r.location) o.location = r.location;
  if (r.coupon_code) o.couponCode = r.coupon_code;
  if (r.estimated_minutes != null) o.estimatedMinutes = r.estimated_minutes;
  if (r.cancel_reason) o.cancelReason = r.cancel_reason;
  return o;
}

function favToRow(f) {
  return {
    id: f.id,
    telegram_id: f.telegramId || null,
    whatsapp_id: f.whatsappId || null,
    order_id: Number(f.orderId),
    items: f.items || null,
    total: Number(f.total) || 0,
    name: f.name || ''
  };
}

function rowToFav(r) {
  if (!r) return null;
  const f = { id: r.id, orderId: r.order_id, items: r.items, total: Number(r.total), name: r.name || '' };
  if (r.telegram_id) f.telegramId = r.telegram_id;
  if (r.whatsapp_id) f.whatsappId = r.whatsapp_id;
  return f;
}

// ---- Orders (async when Supabase) ----
async function loadOrdersFromDb() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('orders').select('*').order('id', { ascending: true });
  if (error) throw new Error('Supabase orders: ' + error.message);
  return (data || []).map(rowToOrder);
}

async function saveOrdersToDb(arr) {
  const supabase = getSupabase();
  const rows = arr.map(orderToRow);
  const { error: delErr } = await supabase.from('orders').delete().gte('id', 0);
  if (delErr) throw new Error('Supabase orders delete: ' + delErr.message);
  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('orders').insert(rows);
  if (insErr) throw new Error('Supabase orders insert: ' + insErr.message);
}

async function loadFavoritesFromDb() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('favorites').select('*').order('id', { ascending: true });
  if (error) throw new Error('Supabase favorites: ' + error.message);
  return (data || []).map(rowToFav);
}

async function saveFavoritesToDb(arr) {
  const supabase = getSupabase();
  const rows = arr.map(favToRow);
  const { error: delErr } = await supabase.from('favorites').delete().gte('id', 0);
  if (delErr) throw new Error('Supabase favorites delete: ' + delErr.message);
  if (rows.length === 0) return;
  const { error: insErr } = await supabase.from('favorites').insert(rows);
  if (insErr) throw new Error('Supabase favorites insert: ' + insErr.message);
}

async function loadPrefsFromDb() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('user_prefs').select('*');
  if (error) throw new Error('Supabase user_prefs: ' + error.message);
  const out = {};
  (data || []).forEach(r => {
    const addresses = r.addresses;
    out[r.user_key] = {
      notify: r.notify !== false,
      addresses: Array.isArray(addresses) ? addresses : []
    };
  });
  return out;
}

async function savePrefsToDb(obj) {
  const supabase = getSupabase();
  const entries = Object.entries(obj || {});
  for (const [user_key, val] of entries) {
    const notify = val && val.notify !== false;
    const addresses = Array.isArray(val && val.addresses) ? val.addresses : [];
    const { error } = await supabase.from('user_prefs').upsert(
      { user_key, notify, addresses },
      { onConflict: 'user_key' }
    );
    if (error) throw new Error('Supabase user_prefs upsert: ' + error.message);
  }
}

// ---- Public API: always returns Promise when Supabase, sync when file ----
function loadOrders() {
  if (useSupabase()) {
    return loadOrdersFromDb().catch(e => {
      console.error('[orders] Supabase load error:', e.message);
      return [];
    });
  }
  try {
    return Promise.resolve(JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')));
  } catch {
    return Promise.resolve([]);
  }
}

function saveOrders(arr) {
  if (useSupabase()) {
    return saveOrdersToDb(arr).catch(e => {
      console.error('[orders] Supabase save error:', e.message);
      throw e;
    });
  }
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(arr, null, 2));
  return Promise.resolve();
}

function loadFavorites() {
  if (useSupabase()) {
    return loadFavoritesFromDb().catch(e => {
      console.error('[orders] Supabase favorites load error:', e.message);
      return [];
    });
  }
  try {
    return Promise.resolve(JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8')));
  } catch {
    return Promise.resolve([]);
  }
}

function saveFavorites(arr) {
  if (useSupabase()) {
    return saveFavoritesToDb(arr).catch(e => {
      console.error('[orders] Supabase favorites save error:', e.message);
      throw e;
    });
  }
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(arr, null, 2));
  return Promise.resolve();
}

function loadPrefs() {
  if (useSupabase()) {
    return loadPrefsFromDb().catch(e => {
      console.error('[orders] Supabase prefs load error:', e.message);
      return {};
    });
  }
  try {
    return Promise.resolve(JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')));
  } catch {
    return Promise.resolve({});
  }
}

function savePrefs(obj) {
  if (useSupabase()) {
    return savePrefsToDb(obj).catch(e => {
      console.error('[orders] Supabase prefs save error:', e.message);
      throw e;
    });
  }
  fs.writeFileSync(PREFS_PATH, JSON.stringify(obj, null, 2));
  return Promise.resolve();
}

function orderUserMatch(order, telegramId, whatsappId) {
  if (telegramId && order.telegramId === String(telegramId)) return true;
  if (whatsappId && order.whatsappId === String(whatsappId)) return true;
  return false;
}

function prefsKey(telegramId, whatsappId) {
  if (whatsappId) return 'wa_' + String(whatsappId);
  if (telegramId) return String(telegramId);
  return null;
}

/** Mevcut JSON verisini Supabase'e tek seferlik yüklemek için (migrasyon scripti). */
async function seedSupabase(ordersArr, favoritesArr, prefsObj) {
  if (!useSupabase()) throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
  await saveOrdersToDb(ordersArr || []);
  await saveFavoritesToDb(favoritesArr || []);
  await savePrefsToDb(prefsObj || {});
}

module.exports = {
  loadOrders,
  saveOrders,
  loadFavorites,
  saveFavorites,
  loadPrefs,
  savePrefs,
  orderUserMatch,
  prefsKey,
  seedSupabase,
  ORDERS_PATH,
  FAVORITES_PATH,
  PREFS_PATH
};
