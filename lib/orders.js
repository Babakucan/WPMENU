const fs = require('fs');
const path = require('path');

const ORDERS_PATH = path.join(__dirname, '..', 'data', 'orders.json');
const FAVORITES_PATH = path.join(__dirname, '..', 'data', 'favorites.json');
const PREFS_PATH = path.join(__dirname, '..', 'data', 'userPrefs.json');
const FEEDBACK_PATH = path.join(__dirname, '..', 'data', 'feedback.json');

function normalizeExtras(extras) {
  if (!Array.isArray(extras)) return [];
  return extras
    .map((ex) => ({
      name: String((ex && ex.name) || '').trim(),
      price: Number((ex && ex.price) || 0) || 0
    }))
    .filter((ex) => ex.name);
}

function normalizeItemsStructured(itemsStructured) {
  if (!Array.isArray(itemsStructured)) return [];
  return itemsStructured
    .map((item) => ({
      productId: String((item && item.productId) || '').trim(),
      qty: Math.max(1, Number((item && item.qty) || 1) || 1),
      removes: Array.isArray(item && item.removes) ? item.removes.map((r) => String(r || '').trim()).filter(Boolean) : [],
      extras: normalizeExtras(item && item.extras)
    }))
    .filter((item) => item.productId);
}

function loadOrders() {
  try {
    const arr = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
    if (!Array.isArray(arr)) return [];
    return arr.map((o) => ({
      ...o,
      itemsStructured: normalizeItemsStructured(o.itemsStructured)
    }));
  } catch {
    return [];
  }
}

function saveOrders(arr) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(arr, null, 2));
}

function loadFavorites() {
  try {
    const arr = JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8'));
    if (!Array.isArray(arr)) return [];
    return arr.map((f) => ({
      ...f,
      itemsStructured: normalizeItemsStructured(f.itemsStructured)
    }));
  } catch {
    return [];
  }
}

function saveFavorites(arr) {
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(arr, null, 2));
}

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function savePrefs(obj) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(obj, null, 2));
}

function loadFeedback() {
  try {
    const arr = JSON.parse(fs.readFileSync(FEEDBACK_PATH, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFeedback(arr) {
  fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(Array.isArray(arr) ? arr : [], null, 2));
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

module.exports = {
  loadOrders,
  saveOrders,
  loadFavorites,
  saveFavorites,
  loadPrefs,
  savePrefs,
  loadFeedback,
  saveFeedback,
  normalizeItemsStructured,
  orderUserMatch,
  prefsKey,
  ORDERS_PATH,
  FAVORITES_PATH,
  PREFS_PATH,
  FEEDBACK_PATH
};
