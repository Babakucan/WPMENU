# Telegram Buton Yapısı – Sadeleştirme Önerileri

## Tasarım Kararı: Favoriler

**Favorilerim** Telegram botunda değil, **menü dashboard'unda** (menu.html web arayüzünde) işlenecek. Kullanıcı menüyü açtığında favori siparişlerine oradan erişir.

---

## Mevcut Yapı

### Ana Menü
```
🛒 Sipariş Ver
📋 Siparişlerim  |  🍽️ Menü
ℹ️ İletişim      |  ⚙️ Ayarlar
```

### Sorunlar
- **Sipariş Ver** ve **Menü** aynı amaca hizmet ediyor (ikisi de menüye götürüyor)
- **Menü** butonu ekstra adım: önce önizleme, sonra "Sipariş Ver" → gereksiz tıklama

---

## Öneri A: Sadeleştirilmiş Ana Menü (Önerilen)

### Yeni Yapı
```
🛒 Menüyü Aç          ← Tek, net giriş noktası (web_app)
📋 Siparişlerim
ℹ️ İletişim      |  ⚙️ Ayarlar
```

### Değişiklikler
1. **Menü** kaldırılır → tek buton: **🛒 Menüyü Aç**
2. "Sipariş Ver" → "Menüyü Aç" (daha net)
3. **Favorilerim** Telegram’da değil; menu.html (dashboard) içinde

### Etkisi
- 3 satır, daha sade
- Favoriler web menüde; sipariş akışı tek yerde

---

## Öneri B: Menü Önizlemeyi Koruyan Sürüm

Bazı kullanıcılar önce fiyatları görüp sonra açmak isteyebilir.

### Yapı
```
🛒 Sipariş Ver        ← Direkt menü (web_app)
📋 Siparişlerim  |  🍽️ Menü Önizleme
ℹ️ İletişim  |  ⚙️ Ayarlar
```

### Değişiklikler
1. **Menü** → **Menü Önizleme** (amaç netleşir)
2. Favoriler menu.html'de

---

## Öneri C: Minimal (Sadece En Kritikler)

```
🛒 Sipariş Ver
📋 Siparişlerim
ℹ️ İletişim  |  ⚙️ Ayarlar
```

- **Menü** kaldırılır (Sipariş Ver zaten menüyü açıyor)
- Favoriler menu.html dashboard’unda

---

## Ek Öneriler

### 1. Menü (menu.html) İçinde Favoriler
- Web menüde "Kayıtlı Adresler" benzeri **Favori Siparişler** bölümü
- Tek tıkla sepete ekleme (reorder)
- Teslim Edildi’de “Favorilere Ekle” ile kayıt; listeleme ve tekrar sipariş menüde

### 2. İletişim Adı
**İletişim** → **📍 Adres & İletişim** (adres + iletişim birlikte anlaşılır)

### 3. Menü Önizleme Metni
Menü önizlemede: *"Fiyatları gördünüz. Sipariş vermek için butona tıklayın."*

---

## Yaratıcı Alternatifler

### Yaklaşım D: Tek Güçlü CTA
Ana odak sipariş; diğerleri ikincil.

```
🍽️ Sipariş Ver / Yemek Seç      ← web_app, büyük tek buton
────────────────────────
Siparişlerim  |  İletişim  |  Ayarlar
```

- İlk satır tek, belirgin ana aksiyon
- Alt satır yardımcı butonlar

### Yaklaşım E: Aksiyon Odaklı Metinler
Sipariş Ver yerine daha samimi ifadeler.

| Şu an | Alternatif |
|-------|------------|
| Sipariş Ver | Ne yesem? / Acıktım, sipariş! |
| Siparişlerim | Nerede siparişim? |
| İletişim | Neredesiniz? / Adres ve Telefon |

### Yaklaşım F: İki Adımlı Hiyerarşi
Ana menüde 2 buton; detay alt menüde.

```
🍽️ Sipariş Ver     ← web_app
📋 Hesabım         ← Siparişlerim + İletişim + Ayarlar
```

### Yaklaşım G: Duruma Göre Butonlar
Aktif sipariş varsa farklı göster: Sipariş Ver | Siparişim / Takip | İletişim  
(Sipariş numarası müşteriye gösterilmez; sadece "Siparişim" veya "Sipariş Takibi")

### Yaklaşım H: Reply Keyboard (Sabit Alt Menü)
Inline yerine klavyede her zaman görünen butonlar – daha native his.

### Yaklaşım I: Tek Satır
```
[ Sipariş Ver ] [ Siparişlerim ] [ İletişim ]
```
Menü kaldır, 3 buton, Ayarlar İletişim içinde veya /ayarlar komutu

---

## Önerilen Uygulama

**Hızlı:** Yaklaşım I (Menü kaldır, 3 buton)
**Dikkat çekici:** Yaklaşım D + E (tek CTA + samimi metinler)
**Cesur:** Yaklaşım G (duruma göre) veya H (reply keyboard)

Gerekli değişiklikler:
1. `buildMainKeyboard` güncelle (Menü kaldır, Sipariş Ver → Menüyü Aç)
2. `menu_preview` callback'ini kaldır veya yönlendir
3. **Favoriler** için menu.html’de bölüm ekle (favori listesi, sepete ekle)
