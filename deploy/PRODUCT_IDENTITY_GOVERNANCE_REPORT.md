# Product Identity Governance Report

## Amaç

Ürün adı artık runtime kimliği olarak kullanılmamalıdır. Ürün adı değişebilir; POS, offline sync, websocket, cache ve entegrasyon kimlikleri değişmemelidir.

## Eklenen Kimlik Katmanı

Product entity için canonical identity alanları tanımlandı:

- `id`: internal UUID
- `posKey`: immutable POS/runtime identity
- `sku`: operasyonel ürün kodu
- `barcode`: fiziksel barkod
- `externalId`: entegrasyon/import kimliği
- `legacyKey`: migration uyumluluk anahtarı
- `revision`: ürün yayın/revizyon numarası

## Runtime Kimlik Kuralları

- POS kataloglarında `id` artık runtime `posKey` olarak yayınlanır.
- Eski display-name id değeri `productId` / `legacyKey` olarak taşınır.
- Order mutation payload'larında:
  - `posKey`
  - `productId`
  - `legacyKey`
  - `sku`
  - `barcode`
  - `externalId`
  - `revision`
  gönderilir.
- `/api/pos/table-orders` metadata içine canonical identity alanlarını yazar.
- UUID olmayan legacy POS key'leri DB lookup kırılmasına neden olmaz.

## Migration ve Audit

Yeni scriptler:

```bash
npm run products:identity-test
npm run products:migrate-identities
npm run products:audit-types
```

`products:migrate-identities`:

- eksik `posKey` üretir
- `legacyKey` korur
- duplicate posKey durumunda ürün UUID ile deterministic yeni key üretir
- revision değerini en az 1'e sabitler

`products:audit-types`:

- productType dağılımını
- POS-visible ürün sayısını
- eksik posKey kayıtlarını
- duplicate posKey/barcode risklerini
- şüpheli legacy satış ürünlerini
raporlar.

## Product Operations UX

Ürün Operasyon Merkezi artık ürün satırında POS Key ve revision bilgisini gösterir. Arama POS Key, SKU ve barcode üzerinden de çalışır.

## Production Sırası

Schema alanları için deploy sırasında Prisma migration/db push uygulanmalıdır. Ardından:

```bash
cd /root/adisyum
npm run products:audit-types
DRY_RUN=0 npm run products:migrate-identities
npm run products:audit-types
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```

## Sonuç

Adisyum POS runtime artık display-name kimliklerine bağlı kalmadan immutable `posKey` ile çalışacak şekilde hazırlanmıştır. Legacy ürünler migration uyumluluğu ile kırılmadan taşınır.
