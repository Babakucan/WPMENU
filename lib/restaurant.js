const fs = require('fs');
const path = require('path');

const MENU_PATH = path.join(__dirname, '..', 'config', 'menu.json');
const RESTAURANT_PATH = path.join(__dirname, '..', 'config', 'restaurant.json');

const CACHE_TTL_MS = 10 * 1000;
let restaurantCache = { data: null, ts: 0 };
let menuCache = { data: null, ts: 0 };

function getCachedRestaurant() {
  if (restaurantCache.data && Date.now() - restaurantCache.ts < CACHE_TTL_MS) return restaurantCache.data;
  try {
    restaurantCache = { data: JSON.parse(fs.readFileSync(RESTAURANT_PATH, 'utf8')), ts: Date.now() };
    return restaurantCache.data;
  } catch {
    restaurantCache = { data: { name: 'MeraPaket', address: '-', phone: '-', hours: '-', minOrderAmount: 0, hoursOpen: '00:00', hoursClose: '23:59' }, ts: Date.now() };
    return restaurantCache.data;
  }
}

function getCachedMenu() {
  if (menuCache.data && Date.now() - menuCache.ts < CACHE_TTL_MS) return menuCache.data;
  try {
    menuCache = { data: JSON.parse(fs.readFileSync(MENU_PATH, 'utf8')), ts: Date.now() };
    return menuCache.data;
  } catch {
    menuCache = { data: null, ts: 0 };
    return null;
  }
}

function invalidateRestaurantCache() {
  restaurantCache = { data: null, ts: 0 };
}

function invalidateMenuCache() {
  menuCache = { data: null, ts: 0 };
}

function isOpen(rest) {
  if (!rest.hoursOpen || !rest.hoursClose) return true;
  const now = new Date();
  const [oh, om] = rest.hoursOpen.split(':').map(Number);
  const [ch, cm] = rest.hoursClose.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = oh * 60 + om;
  let closeMin = ch * 60 + cm;
  if (closeMin <= openMin) closeMin += 24 * 60;
  const nowNorm = nowMin < openMin ? nowMin + 24 * 60 : nowMin;
  return nowNorm >= openMin && nowNorm < closeMin;
}

function validateCoupon(code, subtotal, getRestaurantFn) {
  const rest = getRestaurantFn ? getRestaurantFn() : getCachedRestaurant();
  const coupons = rest.coupons || [];
  const c = coupons.find(x => String(x.code).toUpperCase() === String(code || '').toUpperCase());
  if (!c) return null;
  let discount = 0;
  if (c.type === 'percent') discount = Math.round(subtotal * (c.discount / 100));
  else if (c.type === 'fixed') discount = Math.min(c.discount, subtotal);
  return { discount, code: c.code };
}

function formatOrderConfirm(order, getRestaurantFn) {
  const r = getRestaurantFn ? getRestaurantFn() : getCachedRestaurant();
  const est = order.estimatedMinutes ?? r.estimatedMinutes ?? 25;
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

function getActiveCampaign(getRestaurantFn) {
  const r = getRestaurantFn ? getRestaurantFn() : getCachedRestaurant();
  const campaigns = r.campaigns || {};
  for (const [key, c] of Object.entries(campaigns)) {
    if (c && c.enabled) return { key, ...c };
  }
  return null;
}

function loadMenuForPreview(getCachedMenuFn) {
  const m = getCachedMenuFn ? getCachedMenuFn() : getCachedMenu();
  if (!m) return [];
  const cats = m.categories || [];
  const all = [];
  cats.forEach(c => {
    (c.products || []).slice(0, 3).forEach(p => all.push({ name: p.name, price: p.price, icon: c.icon || '🍽️' }));
  });
  return all.slice(0, 6);
}

module.exports = {
  getCachedRestaurant,
  getCachedMenu,
  invalidateRestaurantCache,
  invalidateMenuCache,
  isOpen,
  validateCoupon,
  formatOrderConfirm,
  getActiveCampaign,
  loadMenuForPreview,
  MENU_PATH,
  RESTAURANT_PATH
};
