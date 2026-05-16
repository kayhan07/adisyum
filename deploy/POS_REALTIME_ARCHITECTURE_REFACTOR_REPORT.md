# POS Realtime Architecture Refactor Report

Generated: 2026-05-16

## Why The Previous Architecture Failed

The POS order flow had too many competing authorities:

- React component state
- runtime-state snapshots
- local runtime persistence
- polling hydration
- BroadcastChannel events
- optimistic mutations
- DB runtime snapshot rows

The first product click could update local state, then a stale runtime snapshot could arrive and overwrite it. Multi-device state was also unreliable because devices were not reading normalized DB orders as the canonical source.

## What Was Removed From The Product Insert Path

For product insertion, the following are no longer the authority:

- local optimistic order snapshot
- runtime snapshot merge
- polling hydration
- BroadcastChannel replay
- stale snapshot guards

The product click path now uses a server-authoritative API.

## New Product Insert Flow

```text
product grid/search click or product-card modal add
-> POST /api/pos/table-orders
-> Prisma transaction
-> upsert active table order
-> create/update order item
-> recalculate order totals server-side
-> publish tenant order event
-> return authoritative ordersByTable
-> UI renders returned DB state
```

## New Active Order Hydration

`GET /api/pos/table-orders` returns open table orders from DB-backed `Order` and `OrderItem` rows.

Floor and order screens hydrate from this endpoint on load.

## Why This Is More Stable

- The first click no longer relies on local runtime persistence.
- The UI renders only after the DB transaction succeeds.
- Duplicate active table orders are prevented by deterministic `orderNo = TABLE-{tableId}` per tenant.
- Totals are calculated server-side from persisted `OrderItem` rows.
- Runtime snapshots are no longer the product insertion authority.

## Remaining Work For True Tenant-Wide Realtime

The repo still lacks a POS browser subscriber for tenant-scoped order events. `publishTenantEvent()` exists, but POS clients do not yet subscribe to `tenant:{tenantId}:orders`.

Recommended next step:

- Add tenant/branch-scoped POS realtime subscriber.
- On event, call `GET /api/pos/table-orders`.
- Remove remaining runtime snapshot dependencies from payment, merge, move, and clear flows.

## Validation Checklist

- First product click inserts via DB.
- Rapid clicks create/update DB `OrderItem` rows.
- Refresh rehydrates open table orders from DB.
- Floor sees open DB-backed orders on load.
- Runtime snapshot polling is not part of product insertion.
