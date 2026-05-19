# Adisyum Multi-Region Resilience & Disaster Recovery

## Amaç

Adisyum cloud SaaS, desktop app, bridge servisleri, offline queue, release governance, autonomous operations ve realtime telemetry katmanlarından oluşan dağıtık bir operasyon platformudur.

Bu fazda amaç büyük arıza olaylarında blast radius sınırlandırmak, region/failure-domain izolasyonu yapmak ve recovery kararlarını operatör tarafından anlaşılır hale getirmektir.

## Failure Domain Model

Kaynak:

- `lib/disaster-recovery.ts`

Tanımlı domain tipleri:

- device
- branch
- tenant
- rollout group
- infrastructure region
- Redis cluster
- websocket cluster
- orchestration workers

Her domain şunları taşır:

- region
- parent domain
- blast radius
- isolation policy
- recovery mode
- health score

## Recovery Modes

Desteklenen modlar:

- Normal
- Degraded
- Offline Safe
- Recovery
- Readonly Emergency

## Incident Escalation Tiers

Desteklenen eskalasyon katmanları:

- local incident
- tenant incident
- infrastructure incident
- regional incident
- platform-wide emergency

## Region Readiness

İlk readiness modeli:

- `eu-central` primary
- `eu-west-standby` standby / failover-ready

Region health sinyalleri:

- Redis
- websocket
- database
- worker pool
- queue backlog
- reconnect storm score

## Disaster Recovery API

Endpoint:

- `GET /api/system-admin/disaster-recovery`
- `POST /api/system-admin/disaster-recovery`

Güvenlik:

- `tenantId = system`
- `role = super_admin`

POST aksiyonları:

- `snapshot`
- `simulate_recovery`

## Disaster Recovery Center

Route:

- `/system-admin/disaster-recovery`

Sekmeler:

- Region Health
- Queue Recovery
- Realtime Recovery
- Failover Actions
- Recovery Timeline
- Blast Radius
- Emergency Policies
- Chaos Recovery

## Operational Recovery Snapshot

Snapshot içeriği:

- rollout state
- policy state
- queue state
- incident state
- device state
- active recovery mode

Bu snapshot ileride incident timeline, rollback governance ve remote support export ile bağlanacak şekilde tasarlanmıştır.

## Chaos Recovery Testing

Komut:

```bash
npm run release:simulate-disaster-recovery
```

Simüle edilen arızalar:

- Redis outage
- websocket collapse
- worker crash storm
- DB reconnect storm
- rollout corruption
- replay corruption
- region isolation

Beklenen davranış:

- Her senaryo recovery action üretir.
- Region/failover aksiyonları operator approval gate ister.
- Redis/queue arızalarında replay freeze ve degraded mode önerilir.
- Websocket arızalarında replay-safe reconnect ve stream rebuild önerilir.

## Üretim Sertleştirme Notları

1. Critical failover işlemleri otomatik uygulanmamalı, operator approval gate arkasında kalmalı.
2. Offline/fiscal replay akışları Redis veya worker instability sırasında dondurulmalı.
3. Websocket collapse durumunda UI degraded live mode'a geçmeli.
4. Region isolation durumunda readonly emergency modu ve standby region planı hazırlanmalı.
5. Failure domain kararları sibling tenant/domain etkisini engelleyecek şekilde izole edilmeli.

## Sonraki Adımlar

- Region health verisini gerçek infra heartbeat kaynaklarına bağlamak
- Redis/BullMQ recovery worker implementasyonu
- SSE/websocket stale stream detector
- DB replica lag ve failover approval workflow
- Recovery snapshot export ve incident timeline korelasyonu
