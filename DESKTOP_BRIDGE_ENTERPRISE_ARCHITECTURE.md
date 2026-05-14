# ADISYUM Desktop Bridge Enterprise Architecture

## Architecture Summary

ADISYUM Desktop Bridge is the restaurant-side connector between Cloud SaaS and local restaurant devices.

```text
ADISYUM Cloud SaaS
  | HTTPS / WebSocket / telemetry
Adisyum Desktop Bridge
  | local API http://127.0.0.1:4891 and legacy http://127.0.0.1:3001
Restaurant Devices
  | printers, cash drawer, barcode reader, scale, customer display, fiscal POS
```

The current implementation upgrades `tools/adisyum-pos-agent` from a small printer helper into a tenant-aware local operations bridge. It keeps the existing `3001` API for compatibility and adds the enterprise local API port `4891`.

## Core Capabilities

- Windows startup through `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Local HTTP API for browser-to-desktop communication
- Tenant-scoped login with subscriber number, username and password
- Encrypted local state at `%LocalAppData%\Adisyum\DesktopBridge\bridge-state.bin`
- Printer discovery and queued printing with retry, dedupe, ack and dead states
- Offline sync queue prepared for orders, payments and device events
- Device registry for barcode, cash drawer, scale, customer display and fiscal printer modes
- Fiscal POS bridge contract for DLL, COM, TCP, native SDK and fiscal printer integrations
- Health snapshot with bridge score, resources, printer state and queue state
- Cloud telemetry endpoint at `/api/desktop-bridge/telemetry`

## Local API Contract

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Bridge health, score, resources, queues, printer and device state |
| `POST /login` | Stores tenant-scoped encrypted session |
| `GET /printers` | Lists Windows printers |
| `POST /print` | Queues a tenant-scoped print job |
| `GET /queues` | Returns print and sync queue metrics |
| `POST /sync/enqueue` | Queues offline sync work |
| `GET /devices` | Returns supported local device capabilities |
| `GET /devices/discover` | Discovers USB/spooler/COM/PnP devices |
| `GET /compatibility` | Returns supported vendor/protocol matrix |
| `POST /escpos/render` | Builds ESC/POS payloads with QR, barcode, cut and drawer commands |
| `GET /pos/status` | Returns fiscal POS readiness |
| `POST /pos/transaction` | Queues fiscal transaction command |
| `POST /pos/report` | Queues X/Z report command |
| `POST /drawer/open` | Queues cash drawer pulse command |
| `GET /service/status` | Returns Windows Service/watchdog readiness |
| `GET /updater/status` | Returns signed update and rollback readiness |

## Offline Capabilities

The bridge persists session, print queue, sync queue, printer routes and printer health locally. If internet is unavailable, restaurant operations can still queue:

- orders
- payments
- print jobs
- fiscal POS commands
- device commands

Queued work remains tenant-scoped and is retried with backoff. Dead jobs stay visible through `/queues` and `/health` for recovery and system-admin telemetry.

## Printer Architecture

Printer flow:

```text
Cloud/browser order event
  -> local /print
  -> tenant scoped queue
  -> dedupe check
  -> priority sort
  -> Windows printer spooler
  -> ack or retry
  -> dead queue after maxAttempts
```

Supported routing model:

- `printerName` direct routing
- `printerRole` routing such as `kitchen`, `bar`, `cashier`
- `category` routing for kitchen/bar category rules
- future failover through `PrinterRoutes` backup mapping

Production drivers:

- ESC/POS printers through raw/base64 payloads
- Windows network printers through spooler names
- USB thermal printers through Windows printer names
- kitchen, bar and cashier printers through role/category routes

## Fiscal POS Integration Readiness

The bridge exposes a stable fiscal transaction boundary before vendor SDKs are wired:

- DLL integrations
- COM port integrations
- TCP integrations
- native SDK integrations
- fiscal printer bridge
- receipt submission
- payment verification
- X/Z reports
- slip print
- transaction status polling

Vendor-specific adapters should plug behind `/pos/transaction` without changing cloud/browser contracts.

## Windows Deployment Flow

1. Publish x64 and x86 bridge binaries.
2. Sign binaries and installer.
3. Install to `Program Files\Adisyum\DesktopBridge`.
4. Register startup entry.
5. Create desktop shortcut for one-click POS launch.
6. Start bridge in background service/tray mode.
7. Verify `GET http://127.0.0.1:4891/health`.
8. Login with subscriber number, username and password.
9. Run printer and fiscal POS test commands.
10. Confirm telemetry reaches `/api/desktop-bridge/telemetry`.

## Monitoring And Telemetry

The system-admin panel can ingest bridge telemetry through `/api/desktop-bridge/telemetry`.

Tracked signals:

- bridge health score
- cloud/local websocket state
- printer online/total/failed/dead counts
- offline sync pending/failed/dead counts
- device capability snapshot
- device inventory, latency, reconnects and firmware metadata
- memory and CPU metrics
- tenant-scoped errors

## Security Model

- Local state is encrypted with AES using user/machine-derived key material.
- Credentials are stored as hashes, not plaintext.
- Tenant ID is resolved from the active bridge session unless explicitly supplied.
- Local API exposes only localhost bindings.
- Cloud telemetry requires an authenticated ADISYUM session.
- Update packages must be signed before production rollout.
- Future IPC should whitelist commands and reject arbitrary shell execution.

## Auto Update Plan

Recommended updater design:

- release channels: `stable`, `pilot`, `beta`
- staged rollout by tenant group
- signed manifest and signed binary verification
- silent download, restart on idle
- rollback to previous known-good build
- bridge health check after update

## Scalability Score

Current score: **82 / 100**

Strengths:

- stateless cloud endpoint
- tenant-scoped local queues
- local recovery without cloud dependency
- compatibility with centralized telemetry

Remaining work:

- vendor-specific fiscal adapters
- signed auto-update pipeline
- tray UI and native service wrapper
- raw ESC/POS byte-level printing instead of text spooler fallback for all devices

## Production Readiness

Current readiness: **MVP Enterprise Core Ready**

Ready:

- local API
- Windows startup
- encrypted local state
- print retry/dead queue
- offline sync queue contract
- tenant session boundary
- device/POS API contracts
- system-admin telemetry endpoint

Needs vendor/hardware validation:

- fiscal POS SDK certification
- USB raw printing per printer model
- cash drawer pulse per printer model
- scale/customer display serial protocols
- signed installer and updater

## Restaurant Deployment Checklist

- [ ] Windows user has permission to access printers.
- [ ] Bridge starts after reboot.
- [ ] `http://127.0.0.1:4891/health` returns `ok: true`.
- [ ] Restaurant login succeeds with subscriber number.
- [ ] Kitchen, bar and cashier printer names are mapped.
- [ ] Test receipt prints from ADISYUM web POS.
- [ ] Offline order is queued and later synced.
- [ ] Cash drawer opens from local command.
- [ ] Fiscal POS test transaction is accepted.
- [ ] System-admin dashboard receives bridge telemetry.
- [ ] Rollback installer is available onsite.
