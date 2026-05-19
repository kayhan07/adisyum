# Product Operations Center Report

## Amaç

Adisyum ürün yönetimi artık tekil ürün ekleme yüzeyi değil, satış, stok, reçete, maliyet, şube görünürlüğü, POS güvenliği ve runtime yayını kapsayan operasyon merkezi olarak ele alınır.

## Eklenen Mimari

- `/operations/products` altında Ürün Operasyon Merkezi oluşturuldu.
- Ürün domainleri ayrı operasyon sekmelerine bölündü:
  - Satış Ürünleri
  - Hammaddeler
  - Yarı Mamüller
  - Combo Ürünler
  - Modifier Grupları
  - Varyantlar
- `lib/product-operations.ts` ile test edilebilir saf operasyon motoru eklendi.

## Sağlık ve Maliyet

- Satış ürünü sağlık kontrolleri:
  - reçete eksik
  - kategori eksik
  - fiyat eksik
  - yazıcı rotası eksik
  - düşük marj
- Stok/hammadde kontrolleri:
  - kritik stok
  - POS görünürlüğü engeli
- Reçete satırlarından teorik maliyet ve marj hesaplanır.

## Domain Güvenliği

- POS görünürlüğü yalnızca `sale_product` ve `combo_product` için işaretlenir.
- `stock_item` ve `semi_product` ürünleri operasyon merkezinde stok/reçete alanında görünür, POS yayınına dahil edilmez.
- Kritik olay modeli `stock_item_in_pos_scope` sızıntısını görünür kılar.

## Operasyonel Yüzeyler

- Enterprise tablo:
  - arama
  - domain filtresi
  - bulk seçim
  - sağlık skoru
  - maliyet/marj
  - şube görünürlüğü
  - runtime görünürlüğü
- Bulk operasyon yüzeyi:
  - toplu fiyat güncelleme
  - şube görünürlüğü
  - yazıcı rotası
  - QR görünürlüğü
- Etki simülasyonu:
  - etkilenen reçete
  - etkilenen şube
  - cache/runtime hedefleri
- Reçete grafiği:
  - ürünün kullandığı hammadde satırları
  - bağımlı ürün sayısı
- Audit zaman çizgisi:
  - operasyon aksiyonları append-only mantığıyla gösterilir.
- Runtime güvenli yayın paneli:
  - POS cache invalidation
  - websocket bildirim
  - offline katalog güvenliği
  - versiyon geri alma

## Test

Yeni test scripti:

```bash
npm run products:operations-test
```

Kapsadığı kontroller:

- satış ürünü POS görünür
- combo ürün POS görünür
- hammadde POS görünmez
- hammadde stock_items domainindedir
- düşük stok uyarısı üretir
- maliyet/marj hesaplanır
- reçete etki simülasyonu bağımlılıkları bulur

## Kalan Üretim Önerileri

- Audit kayıtlarını kalıcı DB tablosuna bağla.
- Bulk operasyonları API transaction akışına bağla.
- Şube bazlı fiyat ve görünürlük override'larını DB şemasına taşı.
- Ürün versiyonlarını append-only revision tablosuna bağla.
- Runtime publish adımında websocket event + offline catalog version bump üret.
