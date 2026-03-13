# MeraPaket - Telegram Menü & Sipariş

Telegram üzerinden menü gösteren ve sipariş alan sistem.

## Özellikler

- **Telegram Bot** – Tüm mesajlara cevap, butonlarla menü/sipariş
- **Web Menü** – Kategoriler, ürünler, sepete ekleme (+/−)
- **Sipariş Türü** – Paket servis veya restoran içi
- **Restoran Paneli** – Sipariş listesi, durum güncelleme
- **Sipariş Takibi** – Durum değişince müşteriye Telegram bildirimi
- **Kalıcı Veri** – Siparişler `data/orders.json` dosyasında tutulur

## Kurulum

1. `npm install`
2. `.env` oluştur:

```
TELEGRAM_BOT_TOKEN=your_token
PORT=3005
USE_NGROK=true
NGROK_AUTHTOKEN=ngrok_dashboard_dan_al
```

3. ngrok token: [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) – Ücretsiz kayıt
4. `npm start` – ngrok otomatik başlar, tüm butonlar link olarak çalışır

## Klasör Yapısı

```
├── config/
│   └── menu.json      # Menü (kategoriler, ürünler, fiyatlar)
├── data/
│   └── orders.json    # Siparişler
├── public/
│   ├── menu.html      # Müşteri menü sayfası
│   └── panel.html     # Restoran paneli
├── server.js
└── .env
```

## Menü Düzenleme

`config/menu.json` dosyasını düzenle:

- `categories` – Kategori listesi
- Her kategoride `products` – Ürünler (id, name, price, image)

## API

| Endpoint | Açıklama |
|----------|----------|
| GET /api/menu | Menü verisi |
| POST /api/order | Sipariş oluştur |
| GET /api/orders | Tüm siparişler |
| PATCH /api/orders/:id | Sipariş durumu güncelle |

## Telefonda Test

`ngrok http 3005` çalıştır, oluşan HTTPS URL'yi `.env` içinde `BASE_URL` olarak ayarla.
