# POS Product Pipeline Regression Report

## Kök Neden

Product Creation Studio sonrası `productType` sınırı doğru şekilde sertleştirildi; fakat POS hattında iki legacy durum güvenli karşılanmıyordu:

1. POS seed/default ürün anahtarları UUID değildir.
   - Örnek: `Caffe Latte`, `Espresso`.
   - `/api/pos/table-orders` ürün id varsa doğrudan `Product.id` üzerinden DB lookup yapıyordu.
   - UUID olmayan POS katalog anahtarları Prisma/Postgres UUID lookup sırasında mutation hattını kırabiliyordu.

2. Legacy satış ürünleri yanlışlıkla `stock_item` / `semi_product` olarak sınıflanabiliyordu.
   - Eski inference ürün adında `sut`, `domates`, `un` gibi kelimeleri içerik bazlı yakalıyordu.
   - `Sutlac`, `Sutlu Kahve`, `Domates Corbasi` gibi satış ürünleri satış kategorisinde olsa bile stok ürünü sayılma riski taşıyordu.
   - DB repository sorguları sadece `productType in ('sale_product','combo_product')` yaptığı için yanlış sınıflanmış satış ürünleri POS kataloğundan tamamen düşüyordu.

## Kalıcı Düzeltmeler

- Hammadde isim inference kuralı sıkılaştırıldı.
  - Hammadde adı artık satış kategorisi varken tek başına ürün tipini `stock_item` yapmaz.
  - `Hammadde / Stok` gibi stok kategorileri hala kesin biçimde inventory-only kalır.
- POS-facing resolver eklendi.
  - `resolvePosFacingProductDomainType()` legacy yanlış sınıflanmış fakat satış kategorisi ve pozitif fiyatı olan ürünleri güvenli şekilde satış ürünü olarak kurtarır.
- Client POS katalog hattı sertleştirildi.
  - `loadStoredSaleProducts()`
  - `saveStoredSaleProducts()`
  - `buildPosCatalogFromStored()`
  legacy yanlış tipleri POS-facing resolver ile normalleştirir.
- DB repository POS katalogları fail-safe hale getirildi.
  - `ProductRepository.list()`
  - `ProductRepository.findById()`
  - `listTenantProducts()`
  artık aktif ürünleri okuyup kategori/fiyat ile domain resolver üzerinden güvenli filtreler.
- `/api/pos/table-orders` UUID guard eklendi.
  - UUID olmayan POS katalog anahtarları için DB lookup atlanır.
  - Böylece default/seed ürünler adisyona eklenirken mutation hattı kırılmaz.
- Repair/classify scriptleri güçlendirildi.
  - Satış kategorisinde, pozitif fiyatlı ve inventory-only işaretli legacy ürünler tekrar güvenli biçimde sınıflanabilir.
- Audit script eklendi.
  - `npm run products:audit-types`
  - Product type dağılımı, POS-visible ürün sayısı ve şüpheli legacy kayıtları raporlar.

## Doğrulama

- `npm run products:boundary-test`
  - Hammadde POS dışı kalır.
  - Combo/satış ürünü POS görünür.
  - Yanlışlıkla `stock_item` işaretlenmiş `Sutlac` satış kategorisi/fiyatı ile POS kataloğunda kurtarılır.
- `npm run products:operations-test`
- `npx tsc --noEmit`
- `npm run build`

## Production Komutları

Production DB erişimi VPS/container network içindedir. Deploy sonrası çalıştırılmalı:

```bash
cd /root/adisyum
npm run products:audit-types
DRY_RUN=0 npm run products:repair-domain-boundaries
```

## Beklenen Sonuç

- Hammadde/stok ürünleri POS/adisyon kataloğuna girmez.
- Legacy/null/yanlış sınıflanmış satış ürünleri POS kataloğunu boşaltmaz.
- Default POS ürünleri UUID olmadığı için adisyon mutation hattını kırmaz.
- Ürün ekleme ilk tıklamada DB-authoritative akışta çalışır.
