# WPMENU — Ürün Gereksinimleri Belgesi (PRD)

**Versiyon:** 1.0  
**Tarih:** Mart 2025  
**Hedef Platform:** WhatsApp (üretim), Telegram (test)

---

## 1. Vizyon ve Hedef

WPMENU, restoranların **WhatsApp** ve **Telegram** üzerinden müşterilere dijital menü sunmasını ve sipariş almasını sağlayan hafif bir web uygulamasıdır. Müşteri menüden seçim yapar, adres ve ödeme bilgilerini girer; restoran ise panelden siparişleri yönetir ve durum güncellemeleri gönderir.

### Temel Hedefler
- Sohbet platformlarından tek tıkla menü açma
- WhatsApp’a uyumlu veya uyarlanabilir mimari
- Restoranın kendi verilerini (menü, çalışma saatleri) yönetmesi
- Minimum kurulum ve bakım maliyeti

---

## 2. Kullanıcı Tipleri

| Rol | Açıklama |
|-----|----------|
| **Müşteri** | Bot üzerinden menüyü açan, sipariş veren kişi |
| **Restoran Yöneticisi** | Siparişleri takip eden, durum güncelleyen, menü ve ayarları düzenleyen kişi |

---

## 3. Fonksiyonel Gereksinimler

### 3.1 Müşteri Akışı

- Bot başlatıldığında karşılama mesajı ve ana menü butonları
- **Sipariş Ver** → Menüyü açar (Telegram’da web_app ile in-app, WhatsApp’ta link ile tarayıcıda)
- Kategorilere göre menü listesi (Ana Yemekler, İçecekler, Tatlılar vb.)
- Ürün arama
- Sepete ekleme / çıkarma
- Minimum sipariş tutarı kontrolü
- Kayıtlı adreslerden seçim veya yeni adres girme
- Konum paylaşımı
- Paket servis / restoran içi seçimi
- Ödeme yöntemi (Kapıda Nakit / Kapıda POS)
- Kupon kodu uygulama
- Sipariş notu
- Sipariş onayı ve bot üzerinden teyit mesajı
- Aktif siparişleri listeleme ve durum takibi
- Geçmiş siparişlere “Tekrar Sipariş” (reorder)
- Aktif siparişe ekleme yapma
- Sipariş iptali (Alındı durumunda, 10 dk içinde)
- Bildirim tercihi (açık/kapalı)
- Favori siparişlere kaydetme ve tekrar sipariş

### 3.2 Restoran (Admin) Akışı

- Tüm siparişleri listeleme ve filtreleme
- Sipariş durumu güncelleme (Alındı → Hazırlanıyor → Hazır → Yola Çıktı → Teslim Edildi / İptal)
- Menü CRUD (kategoriler, ürünler, fiyatlar)
- Restoran ayarları (ad, adres, telefon, çalışma saatleri, min. sipariş, kuponlar)
- Günlük/günlük özet raporlar
- Kupon tanımlama (yüzde veya sabit indirim)

---

## 4. Teknik Gereksinimler

### 4.1 Mimari İlkeler

- **Platform bağımsız çekirdek:** Ana sipariş akışı ve API platformdan bağımsız çalışır.
- **Feature detection:** Telegram’a özel özellikler `window.Telegram?.WebApp` ile sarmalanır; yoksa fallback davranış kullanılır.
- **Kimlik:** Müşteri kimliği URL parametresinde (`?tg=` veya `?phone=`); backend her ikisini destekleyecek şekilde tasarlanır.

### 4.2 Veri Yapısı

- **Siparişler:** `data/orders.json`
- **Favoriler:** `data/favorites.json`
- **Kullanıcı tercihleri:** `data/userPrefs.json` (adresler, bildirim tercihi)
- **Menü:** `config/menu.json`
- **Restoran:** `config/restaurant.json`

### 4.3 API Genel Yapısı

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/menu` | GET | Menü verisi |
| `/api/restaurant` | GET | Restoran ayarları |
| `/api/order` | POST | Sipariş oluşturma |
| `/api/orders` | GET | Tüm siparişler |
| `/api/orders/:id` | GET | Tekil sipariş |
| `/api/orders/:id` | PATCH | Sipariş durumu güncelleme |
| `/api/orders/:id/add` | POST | Siparişe ekleme |
| `/api/user/prefs` | GET, POST | Kullanıcı tercihleri |
| `/api/favorites` | GET, POST | Favori işlemleri |
| `/api/coupon/validate` | POST | Kupon doğrulama |
| `/api/admin/stats` | GET | Admin istatistikleri |

---

## 5. Telegram vs WhatsApp Uyumluluğu

| Özellik | Telegram | WhatsApp |
|---------|----------|----------|
| Menü linki | `web_app` ile in-app açılır | URL ile tarayıcıda açılır |
| Kimlik | `telegramId` (chat_id) | `phone` (planlanan) |
| Tema | `Telegram.WebApp.colorScheme` | CSS ile varsayılan tema |
| Sipariş sonrası | `WebApp.close()` ile kapanma | Normal sayfa kalır |
| Bildirim | Bot mesajı | Bot/API mesajı (planlanan) |

Tüm geliştirmelerde Telegram’a özel davranışlar `if (window.Telegram?.WebApp)` ile ayrılmalı; temel akış her zaman web formu + API üzerinden çalışmalıdır.

---

## 6. Güvenlik ve Performans

- Rate limiting: 60 istek/dakika
- Hassas bilgiler `.env` içinde, asla commit edilmemeli
- Panel erişimi için kimlik doğrulama (planlanan)
- CORS ve CSP kuralları (planlanan)

---

## 7. Yol Haritası

### Faz 1 (Tamamlandı)
- [x] Telegram bot + web menü
- [x] web_app ile in-app deneyim
- [x] Sepet, adres, kupon
- [x] Admin panel
- [x] Sipariş durumu güncelleme
- [x] Favori ve tekrar sipariş

### Faz 2 (Planlanan)
- [ ] sendData ile sohbet içi onay akışı
- [ ] Sticky kategori navigasyonu
- [ ] Ürün özelleştirme modalı (notlar)
- [ ] Bölge / mesafe kontrolü
- [ ] Panel giriş şifresi

### Faz 3 (Planlanan)
- [ ] WhatsApp Business API entegrasyonu
- [ ] Veritabanı (SQLite/PostgreSQL)
- [ ] Çoklu dil desteği
- [ ] Görsel büyütme (ürün fotoğrafları)

---

## 8. Kabul Kriterleri

- Müşteri, bot üzerinden başlatıp sipariş verebilmeli
- Restoran, panelden siparişleri görebilmeli ve durumu güncelleyebilmeli
- Telegram’da menü, sohbet içinde (web_app) açılmalı
- localhost dışında ngrok/HTTPS ile test edilebilmeli
- WhatsApp’a geçişte yalnızca bot/entegrasyon tarafı değişmeli; web menü ve API korunmalı
