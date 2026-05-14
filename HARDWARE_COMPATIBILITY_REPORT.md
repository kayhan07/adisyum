# ADISYUM Hardware Compatibility Report

## Supported Device Matrix

| Vendor / Device | Type | Protocols | Status |
| --- | --- | --- | --- |
| Epson TM / ESC/POS | Thermal printer | ESC/POS, Windows spooler, raw TCP 9100 | Production adapter |
| Sunmi | Android/thermal printer | ESC/POS, USB, TCP | Adapter boundary ready |
| Generic network thermal | Thermal printer | Raw TCP 9100, ESC/POS | Production adapter |
| Generic USB printer | Thermal printer | Windows spooler, ESC/POS fallback | Production adapter |
| COM printer | Printer | COM adapter boundary | Ready for hardware SDK |
| Hugin | Fiscal POS | DLL, COM, TCP | Vendor SDK boundary ready |
| Vera | Fiscal POS | DLL, COM, TCP | Vendor SDK boundary ready |
| Ingenico | Fiscal POS/payment | TCP, COM, native SDK | Vendor SDK boundary ready |
| Pavo | Fiscal POS/payment | TCP, native SDK | Vendor SDK boundary ready |
| Beko | Fiscal POS | DLL, COM, TCP | Vendor SDK boundary ready |
| Profilo | Fiscal POS | DLL, COM, TCP | Vendor SDK boundary ready |
| Cash drawer | Peripheral | ESC/POS pulse | Ready |
| Barcode reader | Peripheral | Keyboard wedge | Ready |
| Scale | Peripheral | Serial/TCP boundary | Ready for hardware protocol |
| Customer display | Peripheral | Serial/USB/TCP boundary | Ready for hardware protocol |

## Hardware Compatibility Architecture

The Desktop Bridge now includes a device compatibility layer inside `tools/adisyum-pos-agent`:

- `DeviceCompatibilityEngine` detects printers, COM/PnP devices and vendor signatures.
- Vendor adapters classify Epson, Sunmi, Hugin, Vera, Ingenico, Pavo, Beko, Profilo and generic thermal devices.
- `EscPosAdapter` renders Turkish-safe ESC/POS payloads with cut, drawer pulse, QR and barcode commands.
- `WindowsSpoolerPrinterAdapter`, `EscPosPrinterAdapter` and `NetworkRawPrinterAdapter` select the safest transport automatically.
- `FiscalTransactionQueue` isolates fiscal commands behind a retryable queue.
- `DeviceHealthState` tracks latency, reconnects, success/failure counts, timeout counts, paper state and offline duration.

## Local API Additions

| Endpoint | Purpose |
| --- | --- |
| `GET /compatibility` | Supported vendor/protocol/capability matrix |
| `GET /devices/discover` | Live USB/spooler/COM/PnP discovery |
| `GET /devices` | Inventory plus health summary |
| `POST /escpos/render` | ESC/POS payload renderer and text fallback |
| `POST /pos/report` | X/Z report queue helper |
| `GET /service/status` | Windows Service/watchdog readiness |
| `GET /updater/status` | Signed update/staged rollout/rollback status |

## Print Reliability Score

Current architecture score: **88 / 100**

Scoring basis:

- Queue retry and dead-letter behavior: strong
- Duplicate print protection: strong through tenant/request dedupe key
- ESC/POS safety: good with ASCII-safe Turkish fallback
- Offline printing: strong through encrypted local queue
- Raw TCP thermal support: ready
- USB raw driver support: needs vendor/device certification
- Paper-out hardware feedback: prepared, requires printer-specific status protocol

Run field validation:

```bash
npm run hardware:test-print-reliability
```

Useful environment variables:

```bash
BRIDGE_URL=http://127.0.0.1:4891
TENANT_ID=restaurant-001
PRINTER_NAME="EPSON TM-T20"
PRINT_PROTOCOL=auto
PRINT_JOBS=1000
PRINT_CONCURRENCY=8
```

## Fiscal Readiness Score

Current fiscal readiness: **74 / 100**

Ready:

- SDK abstraction boundary
- DLL/COM/TCP/native mode classification
- fiscal transaction queue
- X/Z report helper endpoint
- retryable confirmation flow contract
- vendor-specific adapter slots

Needs hardware/vendor work:

- certified SDK package per vendor
- signed DLL loading policy
- real payment confirmation parser
- slip verification parser
- fiscal device status polling
- vendor test receipts and certification logs

## Device Observability

Telemetry accepts device inventory, offline counts, reconnect attempts, average latency and firmware metadata through `/api/desktop-bridge/telemetry`.

Dashboard-ready signals:

- device inventory
- printer health
- fiscal POS health
- print latency
- queue backlog
- reconnect metrics
- offline devices
- firmware versions

## Windows Service And Auto Update

Service readiness is exposed at `/service/status`.

Updater readiness is exposed at `/updater/status` and models:

- signed updates
- staged rollout
- rollback
- SHA-256 integrity verification
- publisher signature verification
- silent recovery

## Restaurant Deployment Checklist

- [ ] Confirm bridge starts on Windows boot.
- [ ] Confirm `GET http://127.0.0.1:4891/compatibility`.
- [ ] Confirm `GET http://127.0.0.1:4891/devices/discover`.
- [ ] Map kitchen, bar and cashier printers.
- [ ] Run `POST /escpos/render` with Turkish text.
- [ ] Run 1000-job print reliability test.
- [ ] Confirm duplicate probe does not double-print.
- [ ] Disconnect/reconnect printer during load and verify queue recovery.
- [ ] Validate cash drawer pulse on cashier printer.
- [ ] Validate fiscal POS test transaction.
- [ ] Validate X and Z report helper flow.
- [ ] Confirm telemetry arrives in system-admin observability.
- [ ] Record firmware versions for all critical devices.
- [ ] Keep rollback installer and previous bridge build onsite.
