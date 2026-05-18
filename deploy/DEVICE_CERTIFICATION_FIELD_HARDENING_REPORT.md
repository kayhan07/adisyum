# Device Certification and Field Hardening

## Added in this phase

- official device certification matrix
- device certification panel in tenant operations
- broader hardware certification script
- field hardening simulation script
- replay guards for local sync and fiscal queues
- desktop diagnostics panel
- field reliability metric ingestion

## Certification model

Statuses:

- Certified
- Beta
- Experimental
- Unsupported

Tracked dimensions:

- vendor
- model
- driver type
- connection type
- known issues
- last validation date

## Printer validation coverage

`npm run hardware:test-device-certification`

Validates:

- bridge health
- printer discovery
- ESC/POS Turkish render path
- cash drawer pulse path
- fiscal boundary visibility
- queue visibility

Existing `npm run hardware:test-print-reliability` remains the stress path for:

- multi-copy printing
- Turkish payload sample
- kitchen/bar/cashier routing
- queue latency
- duplicate print rejection

## Offline integrity

Desktop bridge sync queue now accepts `mutationId` and `requestId`.

Replay rule:

- same tenant + same mutationId + non-dead state = duplicate, do not enqueue again

Fiscal queue uses the same mutation-integrity rule to avoid duplicate payment/fiscal execution during reconnect storms.

## Desktop support

The desktop app now exposes:

- bridge summary
- queue inspection
- update status
- service status
- diagnostics export bundle

## Remaining field certification work

- physical validation of each real printer model
- fiscal vendor SDK certification
- drawer pulse timing profiles per supported printer
- Windows spool crash drill on real venues
- offline reconnect drills under poor Wi-Fi
- signed updater rollout drills
