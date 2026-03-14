# WPMENU

WhatsApp ve Telegram üzerinden restoran menüsü ve sipariş yönetimi. Müşteriler menüden seçim yapar, sipariş verir; restoran panelden siparişleri yönetir.

**Hedef platform:** WhatsApp (üretim) • **Test platformu:** Telegram

---

## Özellikler

### Müşteri Tarafı
- **Telegram Web App** – Menü sohbet içinde açılır (native deneyim)
- **Kategorili menü** – Ana yemekler, içecekler, tatlılar vb.
- **Arama** – Ürün adıyla filtreleme
- **Sepet** – Canlı toplam, kupon, minimum sipariş kontrolü
- **Adres yönetimi** – Kayıtlı adresler, konum paylaşımı
- **Sipariş türü** – Paket servis / restoran içi
- **Ödeme** – Kapıda nakit, kapıda POS
- **Siparişlerim** – Aktif/geçmiş siparişler, durum takibi
- **Tekrar sipariş** – Geçmiş siparişe hızlı ekleme
- **Siparişe ekleme** – Aktif siparişe ürün ekleme
- **Favoriler** – Sık kullanılan siparişleri kaydetme
- **Tema** – Koyu / açık mod
- **Çalışma saati** – Restoran kapalıysa uyarı

### Restoran Tarafı (Admin Panel)
- Sipariş listesi ve durum güncelleme
- Menü düzenleme (CRUD)
- Restoran ayarları (adres, saatler, min. tutar, kuponlar)
- Günlük özet ve istatistikler

---

## Kurulum

### Gereksinimler
- Node.js 16+
- Telegram Bot Token ([@BotFather](https://t.me/BotFather))
- ngrok hesabı (canlı test için HTTPS)

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

---

## Klasör Yapısı

```
├── config/
│   ├── menu.json       # Menü (kategoriler, ürünler, fiyatlar)
│   └── restaurant.json # Restoran ayarları, kuponlar
├── data/
│   ├── orders.json     # Siparişler
│   ├── favorites.json  # Favori siparişler
│   └── userPrefs.json  # Kullanıcı tercihleri (adresler, bildirim)
├── lib/
│   └── logger.js       # Hata loglama
├── public/
│   ├── menu.html       # Müşteri menü sayfası
│   ├── panel.html      # Admin paneli
│   ├── help.html       # Yardım / iletişim
│   └── telegram-web-app.js  # TG Web App entegrasyonu
├── server.js
├── PRD.md              # Ürün gereksinimleri belgesi
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
        { "id": "lahmacun", "name": "Lahmacun", "price": 45, "image": "" }
      ]
    }
  ]
}
```

### Restoran (`config/restaurant.json`)
- `name`, `address`, `phone`, `hours`, `hoursOpen`, `hoursClose`
- `minOrderAmount` – Minimum sipariş tutarı (₺)
- `estimatedMinutes` – Tahmini teslimat süresi
- `coupons` – Kupon kodu listesi

---

## API Özeti

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/menu` | GET | Menü verisi |
| `/api/restaurant` | GET, PUT | Restoran ayarları |
| `/api/order` | POST | Sipariş oluştur |
| `/api/orders` | GET | Tüm siparişler |
| `/api/orders/:id` | GET, PATCH | Sipariş detayı / durum güncelleme |
| `/api/orders/:id/add` | POST | Siparişe ekleme |
| `/api/user/prefs` | GET, POST | Kullanıcı tercihleri |
| `/api/favorites` | GET, POST | Favoriler |
| `/api/coupon/validate` | POST | Kupon doğrulama |

---

## Sayfalar

| URL | Açıklama |
|-----|----------|
| `/` | menu.html’e yönlendirme |
| `/menu.html` | Müşteri menü (parametreler: `?tg=`, `?reorder=`, `?fav=`, `?add=`) |
| `/panel.html` | Admin paneli |
| `/help.html` | İletişim bilgileri |
| `/qr` | QR menü linki |

---

## WhatsApp’a Geçiş

Proje WhatsApp hedefli tasarlanmıştır. Şu an Telegram ile test edilmektedir. WhatsApp’a geçişte:
- Menü web sayfası ve API aynı kalır
- Sadece bot entegrasyonu (WhatsApp Business API) eklenir
- Kullanıcı kimliği `phone` ile desteklenecek şekilde genişletilir

Detaylar için [PRD.md](./PRD.md) dosyasına bakın.

---

## Lisans

MIT
