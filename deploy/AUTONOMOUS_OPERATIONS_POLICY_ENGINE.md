# Adisyum Autonomous Operations & Policy Engine

## Amaç

Adisyum artık manuel izlenen bir POS değil; cloud, desktop, bridge servisleri, offline queue, fiscal adapter, release governance ve saha telemetrisi bulunan dağıtık bir operasyon platformudur.

Bu fazda amaç, operatörlerin her sinyale tek tek müdahale etmesini beklemek yerine policy-driven otomatik reaksiyon altyapısı kurmaktır.

## Kurulan Katmanlar

### Policy Engine

Kaynak:

- `lib/autonomous-operations.ts`

Policy modeli:

- condition
- threshold
- severity
- cooldown
- approval gate
- recommended/automatic actions
- correlation id

### İlk Policy Seti

Eklenen politikalar:

- Rollout incident spike protection
- Reconnect storm containment
- Low update success rollback gate
- Offline queue replay protection
- Printer fleet instability detector
- Fiscal timeout burst guard

### Otomatik Aksiyonlar

Desteklenen aksiyon tipleri:

- `pause_rollout`
- `request_diagnostics`
- `create_incident`
- `quarantine_channel`
- `freeze_offline_replay`
- `require_operator_approval`
- `rollback_rollout`

Rollback ve fiscal retry gibi riskli aksiyonlar operator approval gate arkasında tutulur.

### Release Operations Entegrasyonu

Endpoint:

- `GET /api/system-admin/release-operations`
- `POST /api/system-admin/release-operations`

Yeni payload alanı:

- `automation.policies`
- `automation.decisions`
- `automation.summary`
- `automation.riskSignals`

Yeni POST aksiyonu:

- `simulate_chaos`

### UI

Route:

- `/system-admin/release-operations`

Yeni sekmeler:

- Otomasyon
- Politikalar
- Chaos Test

Ekran artık sadece sürüm governance değil; rollout automation, policy kararları, approval gerektiren aksiyonlar ve chaos test çıktısını da gösterir.

## Chaos Testing

Komut:

```bash
npm run release:simulate-autonomous-chaos
```

Simüle edilen durumlar:

- reconnect storm
- rollout corruption
- printer fleet failure
- offline replay corruption
- bridge crash loop

Beklenen davranış:

- Her senaryo en az bir policy tetikler.
- Rollout corruption durumunda pause/rollback approval önerilir.
- Offline replay corruption durumunda replay freeze önerilir.
- Reconnect storm durumunda rollout channel quarantine önerilir.

## Üretim Güvenlik Modeli

1. Otomatik aksiyonlar önce decision olarak üretilir.
2. Kritik aksiyonlar approval gate ile ayrılır.
3. Fiscal ve rollback aksiyonları otomatik uygulanmaz; operator onayı ister.
4. Diagnostik snapshot, incident creation ve quarantine önerileri policy output olarak izlenir.
5. Policy kararları release governance ve incident timeline ile korele edilecek şekilde correlation id taşır.

## Sonraki Sertleştirme

- Policy kararlarını DB append-only event journal'a yazmak
- Otomatik aksiyon executor worker eklemek
- Incident engine ile gerçek incident create entegrasyonu yapmak
- Bridge komut kuyruğuna diagnostic/restart/freeze replay komutları bağlamak
- Approval workflow için system-admin operator action modeli eklemek
