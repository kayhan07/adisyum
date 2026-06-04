# Adisyum Production QA Checklist

Deploy öncesi bu liste sırayla tamamlanır. Her madde tenant izolasyonu, temiz kurulum ve cross-device POS davranışını korumak için zorunludur.

## Asset MIME QA

- `npm run build` çalışır ve standalone static asset sync tamamlanır.
- `npm run asset:mime` CSS/JS assetlerinin doğru MIME ile servis edileceğini doğrular.
- `/adisyum-root-assets/_next/static/...` root app assetlerini, `/website-assets/_next/static/...` public website assetlerini ayrı servis eder.
- Browser console'da `Refused to apply style` veya `strict MIME type checking` hatası yoktur.

## Yeni Tenant Clean-Start QA

- `npm run tenant:clean-start` geçer.
- Yeni tenant sadece tenant, default branch, company profile, admin user, subscription ve gerekli rol/yetki kayıtlarıyla başlar.
- Ürün, kategori, reçete, stok, cari, kasa, sipariş, ödeme, yazıcı, runtime snapshot, masa ve floor verisi boş gelir.
- Refresh sonrası eski demo ürün, masa veya adisyon geri gelmez.

## Tenant Isolation QA

- `npm run tenant:identity-drift` ve `npm run tenant:access-policy` geçer.
- Tenant A verisi Tenant B oturumunda görünmez.
- Runtime response'ları `tenantId` ve gereken yerde `branchId` döndürür.
- System Admin session tenant endpointlerini tenant kullanıcısı gibi kullanamaz.

## Cross-Device POS QA

- `npm run pos:cross-device` geçer.
- Cihaz A'da açılan masa/adisyon Cihaz B'de aynı tenant ve branch altında görünür.
- Cihaz A tahsilat yaptığında masa server tarafında kapanır, Cihaz B refresh sonrası kapalı/empty hali görür.
- Aktif order listesi ödemesi kapanmış masayı aktif göstermemelidir.

## Payment / Finance QA

- `npm run pos:critical-flow` ve `npm run finance:reconciliation` geçer.
- Nakit/kart tahsilatta kasa hareketi tenantId + branchId ile oluşur.
- Cari tahsilatta cari hareket tenantId + branchId ile oluşur.
- Aynı ödeme iki kez işlenmez.

## Printer Mapping / Test Print QA

- `npm run printer:tenant-scope` geçer.
- Aynı agent altında kasa, mutfak, bar ve genel yazıcı rolleri ayrı atanabilir.
- Test print sonucu API ve UI tarafında `ok`, `status`, `deviceId`, `printerName`, `role`, `tenantId`, `branchId` ile görünür.
- Tenant A yazıcı mapping'i Tenant B tarafında görünmez.
- Browser production bundle içinde `localhost:3001` yoktur; `npm run bundle:no-localhost` geçer.

## Company Profile QA

- System Admin'de girilen firma bilgisi app tarafında görünür.
- App tarafında güncellenen firma bilgisi refresh sonrası kalır.
- Firma profili tenantId ile scoped kalır ve başka tenant kaydını ezmez.

## System Admin Lifecycle QA

- Tenant create çalışır ve clean-start kuralını bozmaz.
- Abonelik tarihi değiştirme, +30 gün, +1 ay, +1 yıl ve limitsiz lisans aksiyonları çalışır.
- Askıya alma, aktif yapma, devre dışı bırakma, soft delete ve restore aksiyonları çalışır.
- Admin şifre sıfırlama ve ilk girişte şifre değişimi zorunlu aksiyonları çalışır.

## Turkish Encoding QA

- `npm run encoding:tr` geçer.
- UI, metadata, public website copy, hata mesajları ve dokümantasyonda mojibake kalmaz.
- `Yönetim`, `güvenli`, `ürün`, `ödeme`, `tahsilat`, `yazıcı`, `müşteri`, `cari`, `reçete`, `mutfak` gibi metinler temiz UTF-8 görünür.

## Deploy Commands

```bash
cd /root/adisyum
git pull origin main
npm install
npx prisma generate
npm run build
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
pm2 save
```

## PM2 Process Check

```bash
pm2 list
curl -I http://127.0.0.1:3000/api/runtime-build-id
curl -I http://127.0.0.1:3010
```

Beklenen processler:

- `adisyum-root-app`
- `adisyum-website`
- `adisyum-worker`

## Nginx Reload Check

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo tail -n 80 /var/log/nginx/error.log
```

## Cloudflare Cache Purge Notu

- Deploy ve static asset sync tamamlanmadan Cloudflare cache purge yapma.
- Deploy bittikten sonra `/app/login`, `/system-admin/login`, `/floor`, `/api/runtime-build-id` için hard refresh veya cache purge ile yeni asset hashleri doğrulanır.
- Purge sonrası browser console'da eski chunk, MIME veya 404 asset hatası kalmamalıdır.
