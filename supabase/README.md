# Supabase (backend-only)

Backend sadece **Supabase** ile konuşur; frontend veritabanını görmez.

## Kurulum

1. **Supabase projesi** oluştur: [supabase.com](https://supabase.com) → New project.

2. **Tabloları oluştur:** Dashboard → SQL Editor → `schema.sql` dosyasının içeriğini yapıştırıp çalıştır.

3. **`.env`** dosyasına ekle:
   - Proje Ayarları → API → **Project URL** → `SUPABASE_URL`
   - Aynı sayfada **service_role** (gizli) key → `SUPABASE_SERVICE_ROLE_KEY`

4. **Mevcut JSON verisini taşı (isteğe bağlı):**
   ```bash
   node scripts/migrate-to-supabase.js
   ```

5. Sunucuyu başlat: `npm start`. Artık sipariş/favori/prefs verisi Supabase’den okunup yazılacak.

## Not

- `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` **tanımlı değilse** uygulama eskisi gibi `data/*.json` dosyalarını kullanır.
- **service_role** key’i sadece backend’de kalsın; frontend’e veya public repo’ya koyma.
