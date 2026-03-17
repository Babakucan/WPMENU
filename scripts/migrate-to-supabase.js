#!/usr/bin/env node
/**
 * data/orders.json, data/favorites.json, data/userPrefs.json içeriğini
 * Supabase tablolarına tek seferlik aktarır.
 *
 * Kullanım:
 *   1. .env içinde SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olsun.
 *   2. Supabase Dashboard > SQL Editor'da supabase/schema.sql çalıştırılmış olsun.
 *   3. node scripts/migrate-to-supabase.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { seedSupabase } = require('../lib/orders');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJson(name) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return name === 'userPrefs.json' ? {} : [];
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`${name} parse hatası:`, e.message);
    return name === 'userPrefs.json' ? {} : [];
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ .env içinde SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlayın.');
    process.exit(1);
  }
  const orders = loadJson('orders.json');
  const favorites = loadJson('favorites.json');
  const prefs = loadJson('userPrefs.json');
  console.log('📂 Okunan: orders=%d, favorites=%d, prefs keys=%d', orders.length, favorites.length, Object.keys(prefs).length);
  await seedSupabase(orders, favorites, prefs);
  console.log('✅ Supabase tablolarına aktarıldı.');
}

main().catch(e => {
  console.error('❌ Hata:', e.message);
  process.exit(1);
});
