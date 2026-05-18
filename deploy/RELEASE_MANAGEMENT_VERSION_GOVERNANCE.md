# Adisyum Release Management & Version Governance

## Amaç

Adisyum artık cloud SaaS, Electron desktop, Windows bridge servisleri, local print agent, offline queue, fiscal adapter ve sertifikalı donanım katmanlarından oluşan dağıtık bir restoran operasyon platformudur.

Bu fazın amacı güvenli dağıtım için merkezi sürüm kaydı, uyumluluk matrisi, staged rollout, rollback ve saha diagnostik altyapısını tek operasyon modelinde toplamaktır.

## Kurulan Mimari

### Version Registry

Kaynak dosya:

- `lib/release-governance.ts`

Takip edilen bileşenler:

- `cloud`
- `desktop`
- `bridge`
- `agent`
- `fiscal-adapter`

Her kayıt şunları taşır:

- sürüm
- rollout kanalı
- minimum uyumlu component sürümleri
- desteklenen donanım statüleri
- update başarı oranı
- rollback oranı
- reconnect failure oranı
- post-update incident oranı

### Rollout Kanalları

Desteklenen kanallar:

- `internal`
- `pilot`
- `beta`
- `certified`
- `general`

Rollout planı tenant hedefleme, yüzde bazlı açılım, güvenlik kapıları, rollback sürümü ve rollout sağlık metrikleri içerir.

### Compatibility Matrix

Uyumluluk kuralları bloklayıcı veya uyarı seviyesinde tanımlanır.

Örnekler:

- Desktop `1.0.0`, Bridge `>= 1.0.0` ister.
- Desktop `1.0.0`, Cloud `>= 2026.05.19` ister.
- Fiscal Adapter `0.5.0`, vendor sertifikasyonu tamamlanmadan internal kanalda kalır.

### Release Operations API

Endpoint:

- `GET /api/system-admin/release-operations`
- `POST /api/system-admin/release-operations`

Güvenlik:

- Sadece `tenantId = system`
- Sadece `role = super_admin`

POST aksiyonları:

- `diagnostic_snapshot`
- `rollback_plan`
- `validate`

### Release Operations Center

Route:

- `/system-admin/release-operations`

Sekmeler:

- Sürümler
- Rollout
- Cihazlar
- Başarısız Güncellemeler
- Rollback
- Sertifikasyon
- Diagnostik

### Remote Diagnostic Snapshot

Snapshot çıktısı:

- bridge state
- spool state
- printer state
- queue health
- sync lag
- fiscal adapter status
- installed versions
- compatibility findings

### Rollback Orchestration Foundation

Rollback planı şu scope seviyeleri için hazırlanır:

- tenant
- branch
- device group
- component

Rollback checklist:

- rollout pause
- offline queue replay guard doğrulama
- diagnostic snapshot alma
- tenant/branch/device-group seviyesinde kontrollü downgrade

## Donanım Sertifikasyon Bağlantısı

Release governance, `lib/device-certification.ts` üzerinden cihaz sertifikasyon matrisine bağlanır.

Sürüm rollout kararları donanım statülerini dikkate alır:

- Certified
- Beta
- Experimental
- Unsupported

## Simülasyon

Komut:

```bash
npm run release:simulate-failures
```

Simüle edilen durumlar:

- uyumsuz bridge ile desktop update
- sağlıklı bridge rollout
- sertifikasyonsuz fiscal adapter rollout

## Üretim Güvenlik Kuralları

1. Offline queue replay guard aktif değilse bridge rollout genişletilmemeli.
2. Rollback paketi yoksa staged rollout pilot dışına çıkarılmamalı.
3. Fiscal adapter vendor sertifikasyonu tamamlanmadan general release yapılamaz.
4. Uyumsuz bridge/desktop kombinasyonu bloklanır.
5. Post-update incident oranı yükselirse rollout pause edilmelidir.

## Sonraki Sertleştirme Adımları

- Release kayıtlarını DB modeline taşımak
- Desktop auto-updater ile imzalı manifest doğrulamasını bağlamak
- Device heartbeat verisinden gerçek installed version envanteri üretmek
- Rollback komutlarını bridge agent komut kuyruğuna bağlamak
- Rollout health metriklerini operational event stream ile korele etmek
