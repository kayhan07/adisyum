# Persistence And Hydration Rules

Phase 2 preserves the existing runtime persistence behavior while clarifying ownership.

## Owners

`lib/pos-runtime/runtime-persistence-engine.ts` owns POS-level persistence helpers:

- `restoreRuntimeJson`
- `persistRuntimeJson`
- `persistRecentAccountIds`
- `persistTableLiveTotals`
- `persistTablePaymentRequested`
- `queueRuntimeReplay`

`lib/client/runtime-state.ts` owns low-level tenant/system-admin runtime-state transport:

- runtime snapshots
- broadcast channel transport
- server persistence through `/api/runtime/state/:scope`
- stale table snapshot rejection
- local write grace window

## Hydration Rules

Authoritative order hydration belongs to `runtime-sync-engine`.

Session hydration belongs to `runtime-session-engine`.

Tenant/branch scope resolution belongs to `tenant-runtime-context`.

Device ownership hydration belongs to `device-session-registry`.

## Persistence Rules

No POS component may directly write browser `localStorage` or `sessionStorage`.

No render path may write runtime persistence.

Persistence writes must suppress redundant payloads before emitting lifecycle events.

Cross-tab snapshots must not overwrite a recent local mutation while the local write grace window is active.

## Current Transitional Debt

Several domain stores still use `lib/client/runtime-state.ts` directly for tenant-local state. This is accepted in Phase 2 as general tenant store infrastructure, but POS table/adisyon runtime ownership must flow through the POS runtime engines.

Future cleanup should gradually move domain-specific stores behind domain-owned persistence facades without changing tenant data.
