# ADISYUM Real Restaurant Pilot Program & Field Validation

## Pilot Program Scope

The pilot field system validates ADISYUM in real restaurant conditions across:

- stability
- printer reliability
- offline behavior
- fiscal POS behavior
- device health
- restaurant UX speed
- peak-hour performance

Pilot tenants receive enhanced telemetry, advanced logs, field diagnostics, crash reporting, device telemetry, print telemetry and sync telemetry.

## Data Collection

Pilot telemetry can be ingested in two ways:

- `POST /api/pilot-field/ingest`
- `POST /api/desktop-bridge/telemetry` with a nested `pilot` payload

Collected field signals:

- printer disconnects
- websocket reconnects
- WiFi instability
- offline duration
- print retry count
- fiscal transaction latency
- Windows restart events
- memory usage
- CPU spikes
- crash reports
- queue snapshots
- UX flow metrics

## Device Chaos Testing

The field runner models the restaurant chaos scenarios that operators should test onsite:

- printer unplug
- network loss
- Redis restart
- PostgreSQL reconnect
- COM port change
- USB reconnect
- Windows sleep/wakeup
- internet loss
- router restart

Run:

```bash
npm run field:pilot-runner
```

Useful environment:

```bash
BRIDGE_URL=http://127.0.0.1:4891
CLOUD_URL=http://127.0.0.1:3000
TENANT_ID=restaurant-001
RESTAURANT_NAME="Pilot Restaurant"
AUTH_COOKIE="adisyon_admin_token=..."
```

## Pilot Dashboard

System-admin monitoring now includes a `Pilot Saha` tab fed by `/api/system-admin/observability`.

Dashboard cards:

- pilot restaurant count
- unhealthy restaurants
- failing devices
- print stability score
- real-world production readiness score

Restaurant details:

- restaurant health score
- print stability score
- fiscal readiness score
- offline recovery score
- device reliability matrix
- top risks
- recent field events

## Scores

Restaurant health score:

- printer stability
- sync/offline reliability
- websocket uptime
- fiscal success rate
- offline recovery success
- user error rate

Print stability score:

- average print latency
- failed print percentage
- retry rate
- duplicate print incidents
- kitchen/bar split success
- ESC/POS encoding failures

Fiscal readiness score:

- successful transactions
- failed fiscal commands
- timeout rates
- reconnect rates
- Z/X report success
- payment verification mismatch

Real-world production readiness score:

- print stability
- fiscal readiness
- offline recovery
- restaurant health

## Device Reliability Matrix

Each pilot restaurant report produces a device matrix with:

- device id
- type
- vendor
- failures
- reconnects
- max latency
- health score

## Offline Field Validation

Required onsite assertion:

1. Disconnect internet.
2. Create order.
3. Take payment.
4. Print kitchen/cashier tickets.
5. Reconnect internet.
6. Verify sync reconcile.
7. Confirm no data loss.

Any data loss incident pushes the restaurant into critical readiness risk.

## Current Production Readiness

Current implementation status: **Pilot Program Ready**

Ready:

- pilot tenant enable/disable actions
- pilot diagnostics ingest
- desktop bridge pilot telemetry passthrough
- chaos result collection
- field runner
- pilot operations dashboard payload
- system-admin pilot tab
- pilot field report scoring

Needs real-world execution:

- at least 3 restaurant pilots
- 7-day continuous bridge runtime per restaurant
- peak-hour observation window
- printer unplug/reconnect drill
- internet loss/reconnect drill
- fiscal POS vendor confirmation
- staff UX observation session
