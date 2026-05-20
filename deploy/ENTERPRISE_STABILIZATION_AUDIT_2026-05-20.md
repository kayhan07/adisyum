# Enterprise Stabilization Audit - 2026-05-20

## Scope

This audit inspected the current overlapping runtime architecture around POS orders, runtime catalog, product domain governance, offline sync, websocket/event publishing, table runtime state, device/printer runtime, and production POS UI.

## Architecture Map

### POS Order Runtime

- UI owner: `components/order-composer.tsx`
- Server mutation authority: `app/api/pos/table-orders/route.ts`
- In-memory client authority cache: `lib/client/authoritative-table-orders.ts`
- Table/floor bridge wrapper: `lib/table-payment-state.ts`
- Floor consumer/mutator: `components/floor-workspace.tsx`
- Offline queue: `lib/offline-sync-store.ts`
- Server offline ingest: `app/api/offline-sync/route.ts`, `app/api/offline-sync/orders/route.ts`
- Event publish: `lib/realtime/tenant-events.ts`

### Product / Runtime Catalog

- Canonical compiler: `lib/canonical-pos-catalog.ts`
- Tenant DB compiler: `lib/server/runtime-pos-catalog.ts`
- Runtime catalog API: `app/api/runtime/pos-catalog/route.ts`
- Legacy/local catalog builder: `lib/sale-product-catalog.ts`
- Product domain resolver: `lib/product-domain.ts`
- Product graph validator: `lib/product-domain-graph.ts`
- Lifecycle governance: `lib/product-lifecycle-governance.ts`, `app/api/products/lifecycle/route.ts`

### Runtime State / Cache

- Runtime snapshot transport: `lib/client/runtime-state.ts`
- Runtime DB API: `app/api/runtime/state/[scope]/route.ts`
- Table runtime metadata: `lib/table-payment-state.ts`
- Catalog runtime cache: `runtime_states` rows keyed by `runtime:pos-catalog:*`
- Browser cache surfaces: runtime-state memory, BroadcastChannel, IndexedDB offline queue, React component state

### Websocket / Realtime

- Generic tenant publisher: `lib/realtime/tenant-events.ts`
- KDS Echo client only: `lib/realtime/kds-echo.ts`
- POS order screen currently uses guarded polling/focus reconciliation, not an order websocket subscriber.

### Device / Printer

- POS settings UI: `components/settings/pos-settings-client.tsx`
- POS device backend proxy: `app/api/settings/pos/devices/route.ts`
- Local printer agent bridge: `app/api/printers/local-agent/route.ts`, `app/api/printers/local-agent/print/route.ts`
- Desktop bridge/client: `lib/local-agent.ts`, `tools/adisyum-pos-agent`

## Stabilization Changes Applied

1. Extracted POS reconciliation into one canonical owner:
   - `lib/pos-order-reconciliation.ts`

2. Added deterministic reconciliation tests:
   - `scripts/verify-pos-order-reconciliation.ts`
   - `npm run pos:reconciliation-test`

3. Kept the POS UI on the canonical reconciliation engine:
   - `components/order-composer.tsx`

4. Preserved immutable order mutation metadata in server order item payloads:
   - `clientMutationId`
   - `orderRevision`
   - `updatedAtMs`

5. Added reconciliation trace runner:
   - `npm run pos:trace-reconciliation`

## P0 Findings

### P0-1: POS order state had multiple write owners

Files:
- `components/order-composer.tsx`
- `components/floor-workspace.tsx`
- `lib/client/authoritative-table-orders.ts`
- `lib/table-payment-state.ts`

Risk:
The order composer, floor workspace, and table-payment wrapper can all replace authoritative order state. This is the core pattern behind "appears then disappears" failures.

Action taken:
The order composer now uses `mergeAuthoritativeOrders` instead of direct replacement. This protects active/optimistic orders from stale empty payloads.

Remaining work:
Move floor workspace onto the same reconciliation engine before it writes `replaceAuthoritativeOrdersByTable`.

### P0-2: Offline sync does not replay authoritative order mutations

Files:
- `lib/offline-sync-store.ts`
- `app/api/offline-sync/route.ts`
- `app/api/offline-sync/orders/route.ts`

Risk:
Offline order snapshots are accepted into server queues/events, but they are not replayed through `/api/pos/table-orders` semantics. "Accepted" does not equal "order persisted."

Required fix:
Add server-side offline mutation replay with mutation IDs, table IDs, product snapshots, and catalog revisions. Replay must call the same domain checks as online insertion.

### P0-3: POS order websocket is publish-only

Files:
- `app/api/pos/table-orders/route.ts`
- `lib/realtime/tenant-events.ts`
- `components/order-composer.tsx`

Risk:
Order mutations publish tenant events, but POS order screen does not subscribe to ordered events with sequence acknowledgement. Current safety is polling/focus reconciliation.

Required fix:
Add an order event subscriber with monotonic `orderRevision` and ignore stale events.

### P0-4: Local fallback catalog can still mask DB runtime catalog failures

Files:
- `components/order-composer.tsx`
- `lib/sale-product-catalog.ts`

Risk:
`getDefaultPosCatalog()` and stored sale products can render usable product cards if runtime catalog hydration fails. That improves demo UX but can hide production catalog/cache failures.

Required fix:
Production POS must enter explicit catalog safe mode when `/api/runtime/pos-catalog` fails or returns empty, instead of silently using local seeded products.

## P1 Findings

### P1-1: Category/domain text normalization contains legacy mojibake handling

Files:
- `lib/product-domain.ts`
- `lib/product-domain-graph.ts`
- `lib/sale-product-catalog.ts`

Risk:
Domain/category inference relies on Turkish text normalization plus mojibake strings. This is brittle and can misclassify categories.

Required fix:
Persist governed category IDs and `allowedProductTypes`; stop inferring runtime domain from display strings except as migration repair.

### P1-2: Runtime catalog cache invalidation is partial

Files:
- `lib/server/runtime-pos-catalog.ts`
- `app/api/runtime/pos-catalog/route.ts`
- `app/api/products/lifecycle/route.ts`

Risk:
Lifecycle invalidates runtime catalog cache, but product creation/update/category mutation paths need a single invalidation service contract.

Required fix:
All product/category mutations must call one catalog invalidation service and emit a versioned catalog event.

### P1-3: Device/printer runtime is split across backend proxy and local agent probing

Files:
- `components/settings/pos-settings-client.tsx`
- `app/api/settings/pos/devices/route.ts`
- `app/api/printers/local-agent/route.ts`

Risk:
Device settings use a POS backend proxy while printer discovery probes several localhost ports. There is no single registered device authority.

Required fix:
Introduce a device registry heartbeat model that records agent ID, bridge version, reachable printers, last heartbeat, and route capabilities.

### P1-4: Runtime-state snapshot merge is table-meta only

Files:
- `lib/client/runtime-state.ts`
- `lib/table-payment-state.ts`

Risk:
Runtime snapshot merge protects table metadata keys, but order lines are now outside runtime-state in authoritative order cache. This split is acceptable only if order state never re-enters runtime snapshots.

Required fix:
Make `Order`/`OrderItem` DB plus `lib/pos-order-reconciliation.ts` the only order authority. Keep table runtime metadata separate.

## File-by-File Audit Summary

- `components/order-composer.tsx`: POS insertion and rendering UI. Previously owned reconciliation inline; now delegates to canonical reconciliation engine. Still too large and should be split.
- `lib/pos-order-reconciliation.ts`: New canonical merge-safe order reconciliation engine.
- `app/api/pos/table-orders/route.ts`: Server order mutation authority. Strong catalog/product validation exists. Added mutation/revision payload fields.
- `lib/client/authoritative-table-orders.ts`: Lightweight in-memory order cache. It still does blind replace and should only be called with already-reconciled data.
- `lib/table-payment-state.ts`: Bridges table metadata/totals and authoritative orders. Still has overlapping runtime-state concerns.
- `components/floor-workspace.tsx`: Reads and writes authoritative order cache. Needs adoption of canonical reconciliation.
- `lib/offline-sync-store.ts`: IndexedDB queue. Good queue mechanics, but order replay is not authoritative.
- `app/api/offline-sync/route.ts`: Accepts offline events only. Needs replay processor.
- `lib/client/runtime-state.ts`: Has stale table snapshot guards. Good for metadata, not sufficient for order lines.
- `lib/canonical-pos-catalog.ts`: Correct canonical compile shape, but branch overlays are placeholders.
- `lib/server/runtime-pos-catalog.ts`: DB-backed runtime compiler. Stronger than local fallback. Needs centralized invalidation coverage.
- `lib/sale-product-catalog.ts`: Legacy/local catalog and seeded products. Production fallback risk.
- `lib/product-domain.ts`: Domain inference and productType filtering. Heuristic legacy layer.
- `lib/product-domain-graph.ts`: Stronger category/product graph, but still string/category inferred.
- `app/api/products/lifecycle/route.ts`: Lifecycle side effects include catalog invalidation and events. Dependency graph incomplete for websocket/device sessions.
- `lib/realtime/tenant-events.ts`: Publish abstraction only; no subscriber/ack ordering for POS orders.
- `lib/realtime/kds-echo.ts`: KDS websocket client only; not POS order reconciliation.
- `components/settings/pos-settings-client.tsx`: Device/mapping/test/log admin UI. Uses local product fallback for mapping.
- `app/api/printers/local-agent/route.ts`: Local printer probing. Needs registered agent ownership.

## Target Ownership Model

### Orders

Canonical owner:
- `Order` / `OrderItem` DB rows
- `/api/pos/table-orders`
- `lib/pos-order-reconciliation.ts` for client merge

Not owners:
- runtime-state tenant snapshot
- local demo catalog
- floor workspace direct replacement

### Products / Catalog

Canonical owner:
- `Product`, `ProductCategory`
- `lib/server/runtime-pos-catalog.ts`
- `lib/canonical-pos-catalog.ts`

Not owners:
- `DEFAULT_SALE_PRODUCT_BASE` in production
- local stored sale products in production POS

### Devices / Printers

Canonical owner needed:
- tenant device registry with heartbeat and printer capabilities

Current owners:
- POS backend proxy
- local agent probe
- integration runtime store

## Validation Run

Local validation for this stabilization pass:
- `npx tsc --noEmit`
- `npm run build`
- `npm run pos:reconciliation-test`

Production deploy status:
SSH to `root@adisyum.com:22` timed out from this workstation. Deploy must be run on the VPS:

```bash
cd /root/adisyum
git pull --ff-only origin main
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```

## Next Required Stabilization Steps

1. Move `components/floor-workspace.tsx` to `mergeAuthoritativeOrders`.
2. Disable seeded/local catalog fallback in production POS.
3. Implement offline order replay into `/api/pos/table-orders` semantics.
4. Add POS order websocket subscriber with monotonic order revision.
5. Replace category string inference with persisted category domain contracts.
6. Add device registry heartbeat and printer capability snapshots.
7. Add incident creation for `preserve-local-nonempty` decisions after repeated stale empty payloads.
