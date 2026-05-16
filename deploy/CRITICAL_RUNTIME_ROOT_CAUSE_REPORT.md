# Critical Runtime Root Cause Report

Generated: 2026-05-16

## Scope

This report covers the regression where POS product insertion started working briefly, then failed again after multi-device hydration/polling was enabled.

The investigation focused only on:

- `addProductToOrder`
- optimistic order state
- runtime-state persistence
- BroadcastChannel/runtime replay
- polling hydration
- order composer reconciliation
- floor workspace hydration

## Confirmed Root Cause

The first click failure was caused by a race between local optimistic state and stale server/runtime hydration.

### Execution Timeline

1. User opens a table.
2. First product click runs `addProductToOrder`.
3. `ordersByTable` is updated optimistically in React state.
4. `setStoredOrdersByTable()` writes the new order snapshot to tenant runtime state.
5. Runtime persistence is async and not guaranteed to finish before the next polling hydration.
6. `syncTableStateFromServer()` calls `refreshRuntimeScope('tenant')`.
7. The server can return the previous runtime snapshot before the optimistic order has been fully persisted.
8. `refreshRuntimeScope()` previously accepted this stale snapshot after a short local-write grace window.
9. `order-composer` then merged the stale stored snapshot over current state.
10. The newly inserted line disappeared or the UI entered a flicker/reconciliation loop.

## Why The Second Click Often Worked

The second click usually occurred after one of these had already completed:

- the first async runtime persist finished,
- the table runtime state had warmed up,
- the local order snapshot had been written at least once,
- the active order guard was already in place.

That made the second mutation less likely to be overwritten by an older server snapshot.

## Exact Overwrite Source

The overwrite source was:

`refreshRuntimeScope('tenant')`

followed by:

`subscribeToPaymentRequestedChanges(syncPaymentRequested)` in `components/order-composer.tsx`

which reads `getStoredOrdersByTable()` and merges it into `ordersByTable`.

When the server snapshot was stale, this path could reduce the active table line count from `1` back to `0`.

## Replay / Flicker Source

The flicker came from multiple runtime events in a short window:

- local optimistic React update,
- runtime item write,
- BroadcastChannel emit,
- polling hydration,
- external reconciliation,
- effect-driven persistence.

Equality guards reduced duplicate emits, but stale server snapshots still needed version-aware rejection.

## Multi-Device Sync Failure Source

Before the previous multi-device fix, clients only bootstrapped the server runtime snapshot once. Remote devices could remain on stale local snapshots.

After polling was enabled, remote clients began refreshing, but local devices became vulnerable to stale snapshot overwrites during pending mutations.

## Permanent Fix Applied

### Mutation Metadata

`lib/table-payment-state.ts` now writes a table-state sync metadata record:

- `version`
- `updatedAtMs`
- `clientId`
- `mutationId`
- `source`
- `tableId`
- `activeOrderTables`

This metadata is stored in runtime state under:

`aurelia-table-state-sync-meta`

### Stale Snapshot Rejection

`lib/client/runtime-state.ts` now compares local and incoming table-state metadata.

If local table state is newer than the incoming snapshot:

- stale table/adisyon keys are rejected,
- local table keys are preserved,
- non-table tenant runtime keys may still update.

Preserved keys:

- `aurelia-table-payment-requested`
- `aurelia-table-live-totals`
- `aurelia-orders-by-table`
- `aurelia-table-meta`
- `aurelia-table-state-sync-meta`

### Pending Mutation Protection

Runtime refresh now skips during:

- dirty local state,
- in-flight persist,
- pending flush,
- local mutation grace window.

`order-composer` also keeps an active local mutation guard window and logs before/after line counts for any external reconciliation.

## Diagnostics Added

Runtime logs now expose:

- stale table snapshot rejection,
- local metadata,
- incoming metadata,
- preserved table keys,
- active mutation guard age,
- current/stored line counts,
- external sync before/after line counts.

Relevant log labels:

- `[runtime-state] stale table snapshot rejected`
- `[runtime-state] refresh skipped during local mutation`
- `[runtime-state] broadcast snapshot ignored during local mutation`
- `[adisyon-flow] external-sync-skipped-after-local-mutation`
- `[adisyon-flow] external-sync-applied`
- `[adisyon-flow] table-runtime-sync`
- `[adisyon-flow] table-runtime-write`

## Remaining Architectural Weakness

This fix stabilizes the current DB-backed runtime snapshot architecture. However, true enterprise-grade POS order authority still requires normalized server APIs over `Order` and `OrderItem` rows.

The permanent target remains:

- every product add writes an `OrderItem` in a DB transaction,
- every table open creates or reuses an active `Order`,
- clients reconcile by order version,
- realtime events invalidate and re-fetch authoritative DB orders,
- runtime snapshots are used only as cache/offline acceleration.

## Validation Expectations

Manual validation should confirm:

1. First product click inserts and stays visible.
2. Polling active does not remove optimistic items.
3. Rapid clicks increment/add lines without flicker loops.
4. Device B hydrates the open table after server runtime refresh.
5. Device B adding products does not erase Device A's newer local state.
6. Refresh preserves active table products.

