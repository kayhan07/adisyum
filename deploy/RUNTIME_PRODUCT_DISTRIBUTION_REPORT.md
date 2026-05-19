# Runtime Product Distribution Report

## Amaç

Ürünler artık POS runtime'a ham `Product` satırı olarak değil, derlenmiş ve immutable katalog snapshot'ı olarak dağıtılır.

## Eklenen Mimari

- `CanonicalPosCatalog`
- `CanonicalPosCatalogItem`
- `catalogRevision`
- `productSnapshot`
- `branchOverlay`
- device sync metadata
- catalog observability metrics

## Catalog Compiler

Yeni compiler:

```ts
compileCanonicalPosCatalog(products, options)
```

Görevleri:

- yalnızca sellable ürünleri runtime'a dahil eder
- immutable `catalogRevision` üretir
- ürün snapshot'ını gömer
- branch overlay alanını hazırlar
- device sync lag / stale revision metriği üretir
- safe mode sebebini hesaplar

## Runtime API

Yeni endpoint:

```http
GET /api/runtime/pos-catalog
POST /api/runtime/pos-catalog
```

GET:

- tenant ürünlerini DB'den okur
- canonical catalog compile eder
- cihazın gönderdiği `catalogRevision` ile stale durumunu döner

POST:

- catalog compile eder
- `RuntimeState` içine immutable snapshot olarak yazar
- tenant scoped websocket event yayınlar:
  - `catalog.published`
  - `catalogRevision`
  - `checksum`
  - `itemCount`

## POS Runtime

- Local POS catalog builder artık compiled catalog item döndürür.
- Product card payload'ları `catalogRevision` taşır.
- Adisyon mutasyonu order item metadata içine gömer:
  - `posKey`
  - `catalogRevision`
  - `productRevision`
  - `productSnapshot`
  - `legacyKey`
  - `sku`
  - `barcode`
  - `externalId`

## Aktif Oturum Güvenliği

Order item artık canlı mutable product row'a bağımlı değildir. Ürün fiyatı/adı/reçetesi değişse bile açık adisyon satırı kendi runtime snapshot'ını taşır.

## Observability

Katalog snapshot'ı şu metrikleri üretir:

- stale device count
- invalid item count
- offline snapshot age
- compile duration
- checksum

## Test

Yeni test:

```bash
npm run products:catalog-test
```

Doğruladıkları:

- revision `CAT-*` formatında üretilir
- product snapshot item içine gömülür
- stale device algılanır
- empty catalog safe mode'a girer

## Production Yayın Sırası

```bash
cd /root/adisyum
git pull --ff-only origin main
npx prisma generate
npx prisma db push
npm run products:audit-types
DRY_RUN=0 npm run products:migrate-identities
npm run products:catalog-test
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```

## Kalan Sonraki Adımlar

- Desktop client catalogRevision heartbeat'i göndermeli.
- Offline queue replay catalogRevision mismatch kontrolü eklenmeli.
- Branch overlay DB tablosu ile fiyat/görünürlük override'ları kalıcılaştırılmalı.
- System-admin device sync paneli canlı revision durumunu göstermeli.
