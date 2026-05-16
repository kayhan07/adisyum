# POS State Architecture Consolidation Report

Date: 2026-05-17

## Why the previous flow regressed

The active order flow had two competing authorities:

1. DB-backed `/api/pos/table-orders`
2. Browser/runtime snapshots persisted through `runtime-state`, `BroadcastChannel`, and `table-payment-state`

The DB mutation path was already correct, but the UI still hydrated and persisted order lines through the legacy runtime snapshot path. That allowed a stale browser/runtime snapshot to replace a fresher DB response, which explains the first-click instability, flicker, and disappearing lines after earlier fixes.

## Consolidated model

Active POS order lines now follow one rule:

`POST mutation -> DB transaction -> API response -> in-memory authoritative order cache -> UI render`

`GET /api/pos/table-orders` is the only hydration source for active order lines.

The shared client cache in `lib/client/authoritative-table-orders.ts` is intentionally ephemeral. It is not a second source of truth; it is only a render cache for the latest DB response in the current browser runtime.

## What was removed from order authority

- Runtime snapshot persistence for `ordersByTable`
- `BroadcastChannel` participation for active order lines
- Runtime-state merge/version logic for `aurelia-orders-by-table`
- Seeding of active order rows back into runtime storage from `floor-workspace`
- Runtime table-state API persistence of `ordersByTable`

Payment-request flags, live totals, and table metadata remain in the helper state layer for now because they are UI-operational metadata, not canonical order lines.

## Client/server boundary repair

`getDefaultModulesForPackageType()` previously lived in `lib/package-access.ts`, which is a client module. Server provisioning code imported it and crashed during tenant/subscription creation.

The package/module business rules now live in `lib/package-access-core.ts`, which has no `use client` directive and no UI/browser dependency. Client UI metadata remains in `lib/package-access.ts`.

## Realtime posture

The DB/API layer already emits tenant-scoped `order.updated` events through `publishTenantEvent()`. The active browser flow now has a clean place to consume tenant order events: on receipt, clients should call `refreshAuthoritativeOrdersByTable()` and never merge remote snapshots into local order lines.

The repo currently has publisher plumbing plus KDS websocket wiring, but no general browser subscriber for tenant order events. That is the next bounded realtime task; this pass deliberately removes the broken pseudo-realtime path instead of pretending local runtime snapshots are a substitute for tenant-wide realtime delivery.

## Tenant safety

- Active orders continue to be loaded and mutated through tenant-scoped API routes.
- The authoritative query path filters by `tenantId`.
- Runtime-state no longer carries active order rows between tabs or tenants.
- The client cache exists only in memory and is reset by page lifecycle/session isolation.

## Validation performed in this pass

- `npx tsc --noEmit`
- Build validation to be run after the remaining integration cleanup

## Follow-up recommendation

Add one explicit tenant-order websocket subscriber backed by the production realtime transport, with this only behavior:

`order.updated event -> refreshAuthoritativeOrdersByTable()`

No snapshot payloads, no browser rebroadcasts, no optimistic reconciliation branch.
