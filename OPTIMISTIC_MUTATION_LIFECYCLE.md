# Optimistic Mutation Lifecycle

The POS mutation lifecycle has one canonical owner: `lib/pos-runtime/order-mutations.ts`.

## Lifecycle

1. UI validates user intent and selected table.
2. UI calls `createOrderMutation`.
3. Runtime creates the only mutation ID.
4. UI stores `createPendingMutation` result in the pending guard ref.
5. Runtime creates the optimistic line with `createOptimisticLine`.
6. UI renders the optimistic state.
7. Runtime dispatches the mutation with `dispatchOrderMutation`.
8. Runtime commits the mutation with `commitOrderMutation` or rolls it back with `rollbackOrderMutation`.
9. Runtime sync engine protects the pending optimistic mutation from stale authoritative payloads.

## Ownership Rules

Only `order-mutations.ts` may:

- create mutation IDs
- shape table-orders payloads
- create optimistic order lines
- dispatch `POST /api/pos/table-orders`
- define commit and rollback semantics

Only `runtime-sync-engine.ts` may:

- fetch authoritative table-orders snapshots
- decide whether pending optimistic mutations block sync
- pass authoritative snapshots to table reconciliation

Only `table-state-engine.ts` may:

- run table reconciliation decisions
- produce reconciliation logs

## Compatibility Notes

`components/order-composer.tsx` currently remains the intent bridge and UI state holder. It may call runtime-owned functions from click handlers and effects, but it must not create mutation IDs, build API URLs, or perform direct API fetches itself.

## Failure Interpretation

- `401 missing_session` means route and runtime are healthy but session is absent.
- `400 malformed_order_item` means payload/schema normalization failed.
- `404` means API routing or URL construction drifted and must be treated as infrastructure/API ownership failure.
