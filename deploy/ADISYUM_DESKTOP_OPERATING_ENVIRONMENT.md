# Adisyum Desktop Operating Environment

## Canonical topology

```text
Adisyum Cloud
  https://adisyum.com
        |
Adisyum Desktop
  Electron POS shell
        |
Adisyum Desktop Bridge
  tools/adisyum-pos-agent
  http://127.0.0.1:4891
        |
Restaurant devices
  ESC/POS printers, kitchen/bar printers, cash drawer, COM devices, fiscal POS
```

## What now exists

- `apps/desktop`: Electron desktop shell with kiosk support and first-run setup wizard.
- `tools/adisyum-pos-agent`: existing Windows bridge retained as the local device runtime.
- `deploy/windows`: install/uninstall scripts for startup and Windows service registration.
- `components/desktop-support-center.tsx`: support/download surface exposed in `/app` and `/adisyonsistemi`.
- `/api/desktop-bridge/telemetry`: tenant-safe bridge telemetry ingestion already wired into observability.

## First-run flow

1. Configure cloud and bridge URLs.
2. Choose branch.
3. Discover printers and test-print.
4. Check fiscal POS readiness.
5. Verify bridge health.
6. Open the POS shell.

## Local bridge responsibilities

- printer discovery
- ESC/POS payload handling
- print queue, retry, dedupe and dead-letter state
- offline sync queue
- local device inventory
- cash drawer commands
- fiscal POS command boundary
- bridge telemetry

## Offline model

Browser queue and bridge queue are intentionally layered:

- browser queue protects user interaction continuity
- bridge queue protects local hardware execution
- cloud remains authoritative after reconnect

## Windows deployment model

1. Build `tools/adisyum-pos-agent` release binaries.
2. Build `apps/desktop` installer with `npm run desktop:dist`.
3. Sign binaries and NSIS package.
4. Install to `Program Files\Adisyum`.
5. Run `deploy/windows/install-desktop-services.ps1`.
6. Verify `GET http://127.0.0.1:4891/health`.
7. Complete first-run wizard.

## Security controls

- localhost-only bridge binding
- bridge state encrypted by existing bridge implementation
- cloud telemetry validates authenticated tenant session
- installer signing required before stable release
- bridge API extension point reserved for signed local request enforcement

## Remaining hardware validation

- vendor-specific fiscal POS adapters
- cash drawer pulse compatibility per printer model
- raw USB printing validation by thermal printer family
- COM protocol validation for scales/customer displays
- signed updater manifest and rollback drills

## Validation checklist

- [ ] Desktop app launches and opens first-run wizard.
- [ ] Bridge health endpoint responds.
- [ ] Printer discovery works.
- [ ] ESC/POS test print succeeds.
- [ ] Offline queue accepts work while WAN is unavailable.
- [ ] Reconnect drains queue without duplication.
- [ ] Fiscal readiness endpoint returns vendor status.
- [ ] Bridge telemetry reaches system-admin.
- [ ] Windows reboot restores desktop bridge automatically.
