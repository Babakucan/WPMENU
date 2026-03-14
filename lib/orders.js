const fs = require('fs');
const path = require('path');

const ORDERS_PATH = path.join(__dirname, '..', 'data', 'orders.json');
const FAVORITES_PATH = path.join(__dirname, '..', 'data', 'favorites.json');
const PREFS_PATH = path.join(__dirname, '..', 'data', 'userPrefs.json');

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
  try {
    return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function savePrefs(obj) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(obj, null, 2));
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
  orderUserMatch,
  prefsKey,
  ORDERS_PATH,
  FAVORITES_PATH,
  PREFS_PATH
};
