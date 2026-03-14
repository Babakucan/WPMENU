# WPMENU

WhatsApp ve Telegram üzerinden restoran menüsü ve sipariş yönetimi. Müşteriler menüden seçim yapar, ürünleri özelleştirebilir (malzeme çıkar/ekle), sipariş verir; restoran panelden siparişleri ve menüyü yönetir.

**Hedef platform:** WhatsApp • **Test platformu:** Telegram

---

## Özellikler

### Müşteri Tarafı
- **Telegram Web App** – Menü sohbet içinde açılır (native deneyim)
- **Kategorili menü** – Ana yemekler, içecekler, tatlılar vb.
- **Ürün içeriği ve açıklama** – İçindekiler (chip) ve açıklama metni
- **Malzeme özelleştirme** – İstenmeyen malzemeyi tıklayarak çıkarma (üstü çizili), ekstra malzeme seçimi (fiyatlı)
- **Arama** – Ürün adıyla filtreleme
- **Sepet** – Canlı toplam, kupon, minimum sipariş kontrolü; özelleştirilmiş ürünler sipariş metninde belirtilir
- **Adres yönetimi** – Kayıtlı adresler, konum paylaşımı
- **Sipariş türü** – Paket servis / Gel Al
- **Ödeme** – Kapıda nakit, kapıda POS
- **Siparişlerim** – Aktif/geçmiş siparişler, durum takibi
- **Tahmini süre** – Siparişe göre tahmini hazırlık süresi
- **Tekrar sipariş** – Geçmiş siparişe hızlı ekleme
- **Siparişe ekleme** – Aktif siparişe ürün ekleme
- **Favoriler** – Sık kullanılan siparişleri kaydetme
- **Tema** – Koyu / açık mod
- **Çalışma saati** – Restoran kapalıysa uyarı

### Restoran Tarafı (Admin Panel)
- **Siparişler** – Liste, filtre (durum), durum güncelleme, tahmini süre, yazdırma
- **Menü yönetimi** – Kart görünümü: ana alanda sadece ürün adı, fiyat ve açıklama; **+** ile detay (Restoran fiyatı, sadece restoran içi, içerik malzemeleri satır satır, ekstra malzemeler, sil)
- **İçerik (malzemeler)** – Her satıra bir malzeme; kayıt virgülle ayrılmış string
- **Ekstra malzemeler** – Her satır: Malzeme adı, Fiyat (müşteri sepette ekleyebilir)
- **Restoran ayarları** – Adres, saatler, min. tutar, kuponlar, tahmini süreler
- **Kampanyalar** – Sipariş sayısı / kupon kampanyaları
- **İstatistik** – Günlük özet, durum dağılımı
- **Panel giriş** – Şifre ile koruma (`.env` `ADMIN_PASSWORD`)

---

## Kurulum

### Gereksinimler
- Node.js 16+
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))
- (Opsiyonel) WhatsApp Business API ve ngrok (canlı test için HTTPS)

### Adımlar

1. **Bağımlılıkları yükle**
   ```bash
   npm install
   ```

2. **Ortam değişkenlerini ayarla**
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasını düzenle:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   PORT=3005
   USE_NGROK=true
   NGROK_AUTHTOKEN=ngrok_dashboard_token
   ADMIN_PASSWORD=panel_sifreniz
   ```
   `ADMIN_PASSWORD` boş bırakılırsa panel şifresiz açılır.

3. **Uygulamayı başlat**
   ```bash
   npm start
   ```

4. **ngrok ile test**
   - [ngrok Dashboard](https://dashboard.ngrok.com/get-started/your-authtoken) üzerinden ücretsiz authtoken al
   - `USE_NGROK=true` ile başlatıldığında HTTPS URL otomatik oluşur
   - Telegram Web App sadece HTTPS URL’lerde çalışır
   - Proxy arkasında rate-limit doğru çalışması için Express `trust proxy` ayarlıdır

---

## Klasör Yapısı

```
├── config/
│   ├── menu.json       # Menü (kategoriler, ürünler: name, price, priceRestoran, contents, description, extras, onlyDineIn)
│   └── restaurant.json # Restoran ayarları, kuponlar, kampanyalar
├── data/
│   ├── orders.json     # Siparişler
│   ├── favorites.json  # Favori siparişler
│   └── userPrefs.json  # Kullanıcı tercihleri (adresler)
├── lib/
│   └── logger.js       # Hata loglama
├── public/
│   ├── menu.html       # Müşteri menü sayfası
│   ├── panel.html      # Admin paneli
│   ├── help.html       # Yardım / iletişim
│   └── telegram-web-app.js
├── server.js
├── PRD.md
└── README.md
```

---

## Yapılandırma

### Menü (`config/menu.json`)
```json
{
  "categories": [
    {
      "id": "ana-yemekler",
      "name": "Ana Yemekler",
      "icon": "🍽️",
      "products": [
        {
          "id": "lahmacun",
          "name": "Lahmacun",
          "price": 45,
          "priceRestoran": 40,
          "image": "",
          "contents": "domates,kıyma,soğan",
          "description": "Taş fırında.",
          "extras": [{ "name": "Extra peynir", "price": 10 }],
          "onlyDineIn": false
        }
      ]
    }
  ]
}
```
- `contents`: Virgülle ayrılmış malzemeler (panelde satır satır düzenlenir)
- `description`: Müşteriye görünen açıklama
- `extras`: Müşterinin ekleyebileceği ekstra malzemeler (name, price)

### Restoran (`config/restaurant.json`)
- `name`, `address`, `phone`, `hoursOpen`, `hoursClose`
- `minOrderAmount` – Minimum sipariş tutarı (₺)
- `estimatedMinutes`, `estimatedMinutesGelAl`, `estimatedMinutesPaket`
- `coupons` – Kupon listesi
- Kampanya ayarları

---

## API Özeti

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/menu` | GET, PUT | Menü verisi / güncelleme |
| `/api/restaurant` | GET, PUT | Restoran ayarları |
| `/api/order` | POST | Sipariş oluştur |
| `/api/orders` | GET | Tüm siparişler (admin) |
| `/api/orders/:id` | GET, PATCH | Sipariş detayı / durum ve tahmini süre |
| `/api/orders/:id/add` | POST | Siparişe ekleme |
| `/api/user/prefs` | GET, POST | Kullanıcı tercihleri |
| `/api/favorites` | GET, POST | Favoriler |
| `/api/coupon/validate` | POST | Kupon doğrulama |
| `/api/admin/stats` | GET | İstatistikler |

---

## Sayfalar

| URL | Açıklama |
|-----|----------|
| `/` | menu.html’e yönlendirme |
| `/menu.html` | Müşteri menü (`?tg=`, `?reorder=`, `?fav=`, `?add=`, `?table=`, `?address=`) |
| `/panel.html` | Admin paneli |
| `/help.html` | İletişim bilgileri |
| `/qr` | QR menü linki |

---

## WhatsApp Desteği

WhatsApp webhook ve mesajlaşma entegrasyonu mevcuttur. `.env` içinde `WA_*` değişkenleri ile yapılandırılır. Telegram ile test için aynı menü ve API kullanılır; kimlik `telegramId` veya `whatsappId` ile ayrılır.

Detaylar için [PRD.md](./PRD.md) dosyasına bakın.

---

## Lisans

MIT
