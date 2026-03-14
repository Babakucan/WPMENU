# WPMENU — Ürün Gereksinimleri Belgesi (PRD)

**Versiyon:** 1.1  
**Tarih:** Mart 2025  
**Hedef Platform:** WhatsApp (üretim), Telegram (test)

---

## 1. Vizyon ve Hedef

WPMENU, restoranların **WhatsApp** ve **Telegram** üzerinden müşterilere dijital menü sunmasını ve sipariş almasını sağlayan hafif bir web uygulamasıdır. Müşteri menüden seçim yapar, ürünleri malzeme bazında özelleştirebilir; restoran panelden siparişleri ve menüyü yönetir.

### Temel Hedefler
- Sohbet platformlarından tek tıkla menü açma
- WhatsApp ve Telegram ile uyumlu mimari
- Restoranın menü, çalışma saatleri ve kampanyaları yönetmesi
- Müşterinin malzeme çıkar/ekle ile ürün özelleştirmesi
- Minimum kurulum ve bakım maliyeti

---

## 2. Kullanıcı Tipleri

| Rol | Açıklama |
|-----|----------|
| **Müşteri** | Bot üzerinden menüyü açan, ürün özelleştirip sipariş veren kişi |
| **Restoran Yöneticisi** | Siparişleri takip eden, durum ve tahmini süre güncelleyen, menü ve ayarları düzenleyen kişi |

---

## 3. Fonksiyonel Gereksinimler

### 3.1 Müşteri Akışı

- Bot başlatıldığında karşılama mesajı ve ana menü butonları
- **Sipariş Ver** → Menüyü açar (Telegram’da web_app ile in-app, WhatsApp’ta link ile tarayıcıda)
- Kategorilere göre menü listesi (Ana Yemekler, İçecekler, Tatlılar vb.)
- **Ürün bilgisi:** İçindekiler (chip), açıklama, fiyat
- **Malzeme özelleştirme (ürün kartında):**
  - İçindekilerden çıkarmak istenen malzemeye tıklanır → üstü çizili işaretlenir
  - Ekstra malzemeler tıklanarak seçilir (fiyat sepete eklenir)
  - **+** ile sepete eklenir; sipariş metninde “çıkar: …” ve “+Ekstra …” yer alır
- Ürün arama
- Sepete ekleme / çıkarma; özelleştirilmiş ürünler için çıkarılan ve eklenen malzemeler sipariş detayında
- Minimum sipariş tutarı kontrolü
- Kayıtlı adreslerden seçim veya yeni adres girme, konum paylaşımı
- Paket servis / Gel Al seçimi
- Ödeme yöntemi (Kapıda Nakit / Kapıda POS)
- Kupon kodu uygulama
- Sipariş notu
- Sipariş onayı ve bot üzerinden teyit mesajı
- Aktif siparişleri listeleme ve durum takibi; tahmini süre gösterimi
- Geçmiş siparişlere “Tekrar Sipariş”, aktif siparişe ekleme
- Sipariş iptali (Alındı durumunda, kısa süre içinde)
- Favori siparişlere kaydetme ve tekrar sipariş
- Tema (koyu / açık)

### 3.2 Restoran (Admin) Akışı

- **Siparişler:** Tüm siparişleri listeleme, duruma göre filtreleme; durum güncelleme (Alındı → Hazırlanıyor → Hazır → Yola Çıktı → Teslim Edildi / İptal); tahmini süre (dakika) girme; müşteriye durum ve tahmin bildirimi; yazdırma
- **Menü yönetimi:**
  - Her ürün bir **kart** olarak gösterilir
  - **Ana alan (her zaman görünür):** Ürün adı, Paket fiyatı, Kısa açıklama
  - **+ butonu:** Kartı genişletir; **−** ile kapatılır (her kart kendi açık/kapalı durumunda)
  - **Detay alanı (açıldığında):** Restoran fiyatı (opsiyonel), “Sadece restoran içi” seçeneği, **İçerik (malzemeler)** (her satıra bir malzeme), **Ekstra malzemeler** (her satır: Malzeme, Fiyat), Sil butonu
- **İçerik malzemeleri:** Panelde satır satır girilir; kayıtta virgülle ayrılmış string olarak saklanır (API ve müşteri menüsü uyumlu)
- **Restoran ayarları:** Ad, adres, telefon, çalışma saatleri, min. sipariş, kuponlar, tahmini süreler (genel / Gel Al / Paket)
- **Kampanyalar:** Sipariş sayısı veya kupon kampanyaları
- **İstatistik:** Günlük sipariş sayısı, toplam ciro, durum dağılımı
- **Panel giriş:** Şifre ile koruma (`.env` `ADMIN_PASSWORD`)

---

## 4. Teknik Gereksinimler

### 4.1 Mimari İlkeler

- **Platform bağımsız çekirdek:** Sipariş akışı ve API platformdan bağımsız çalışır.
- **Kimlik:** Müşteri kimliği `telegramId` veya `whatsappId`; URL parametreleri `?tg=`, `?phone=` vb. ile iletilir.
- **Proxy:** ngrok vb. arkasında çalışırken `trust proxy` açıktır; rate-limit ve IP doğru çalışır.

### 4.2 Veri Yapısı

- **Siparişler:** `data/orders.json` (items metni özelleştirme bilgisi içerebilir: çıkar: …, +Ekstra …)
- **Favoriler:** `data/favorites.json`
- **Kullanıcı tercihleri:** `data/userPrefs.json` (adresler)
- **Menü:** `config/menu.json` — Ürün alanları: `id`, `name`, `price`, `priceRestoran`, `image`, `contents` (virgülle ayrılmış), `description`, `extras` (array of `{ name, price }`), `onlyDineIn`
- **Restoran:** `config/restaurant.json`

### 4.3 API Genel Yapısı

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/menu` | GET, PUT | Menü verisi / güncelleme |
| `/api/restaurant` | GET, PUT | Restoran ayarları |
| `/api/order` | POST | Sipariş oluşturma |
| `/api/orders` | GET | Tüm siparişler (admin) |
| `/api/orders/:id` | GET, PATCH | Sipariş detayı / durum ve tahmini süre güncelleme |
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
| Kimlik | `telegramId` | `whatsappId` |
| Tema | `Telegram.WebApp.colorScheme` | CSS varsayılan |
| Sipariş sonrası | `WebApp.close()` ile kapanma | Sayfa kalır |
| Bildirim | Bot mesajı | Webhook ile mesaj |

Tüm geliştirmelerde Telegram’a özel davranışlar `window.Telegram?.WebApp` ile ayrılır; temel akış web formu + API üzerinden çalışır.

---

## 6. Güvenlik ve Performans

- Rate limiting: 60 istek/dakika (proxy güvenilir)
- Hassas bilgiler `.env` içinde, commit edilmez
- Panel erişimi şifre ile (`ADMIN_PASSWORD`)
- Express `trust proxy` ngrok/proxy için etkin

---

## 7. Yol Haritası

### Faz 1 (Tamamlandı)
- [x] Telegram bot + web menü
- [x] web_app ile in-app deneyim
- [x] Sepet, adres, kupon
- [x] Admin panel ve panel şifresi
- [x] Sipariş durumu ve tahmini süre güncelleme
- [x] Favori ve tekrar sipariş, siparişe ekleme
- [x] Ürün içeriği, açıklama, ekstra malzemeler
- [x] Müşteri tarafında malzeme çıkar/ekle (kart üzerinde)
- [x] Menü yönetiminde kart görünümü, + ile detay, içerik satır satır
- [x] WhatsApp webhook entegrasyonu

### Faz 2 (İsteğe Bağlı / İleride)
- [ ] sendData ile sohbet içi onay akışı
- [ ] Bölge / mesafe kontrolü
- [ ] Ürün notu (serbest metin, malzeme dışı)

### Faz 3 (İleride)
- [ ] Veritabanı (SQLite/PostgreSQL)
- [ ] Çoklu dil desteği
- [ ] Ürün fotoğrafı yükleme ve büyütme

---

## 8. Kabul Kriterleri

- Müşteri, bot üzerinden menüyü açıp ürünleri özelleştirerek (malzeme çıkar/ekle) sipariş verebilmeli
- Restoran, panelden siparişleri görebilmeli, durumu ve tahmini süreyi güncelleyebilmeli
- Restoran, menüde kart görünümünde sadece isim/fiyat/açıklama görmeli; + ile detay alanını açabilmeli
- İçerik malzemeleri panelde satır satır düzenlenebilmeli
- Telegram’da menü web_app ile sohbet içinde açılmalı
- ngrok/HTTPS ile test edilebilmeli
- WhatsApp ve Telegram aynı API ve menü yapısını kullanmalı
