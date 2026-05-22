# Runtime Ownership Graph

This document is the Phase 2 runtime ownership map for the controlled enterprise recomposition. It preserves the existing POS and ERP behavior while defining one owner per runtime responsibility.

## Canonical Flow

User intent flows through the runtime boundaries in this order:

1. UI emits intent from `components/order-composer.tsx`.
2. `lib/pos-runtime/order-mutations.ts` creates mutation identity, optimistic lines, payloads, commits, rollbacks, and API mutation dispatch.
3. `lib/pos-runtime/runtime-sync-engine.ts` accepts authoritative payloads, owns focus/interval sync, protects pending optimistic mutations, and delegates table merging.
4. `lib/runtime/table-state-engine.ts` owns table reconciliation by wrapping `mergeAuthoritativeOrders`.
5. `lib/pos-runtime/runtime-persistence-engine.ts` owns POS runtime persistence helpers and redundant write suppression.
6. `lib/pos-runtime/runtime-event-bus.ts` owns lifecycle event emission, subscriptions, duplicate suppression, and diagnostics fanout.
7. UI renders state and may call runtime-owned functions only from effects or user handlers.

## Boundary Ownership

| Boundary | Owner | Allowed responsibilities | Forbidden responsibilities |
| --- | --- | --- | --- |
| API URL ownership | `lib/runtime/runtime-api.ts` | Canonical root-relative API paths, credential propagation | Pathname-derived URLs, `/app/api`, `/adisyonsistemi/api` |
| Order mutation lifecycle | `lib/pos-runtime/order-mutations.ts` | `mutationId`, optimistic line creation, dispatch, commit, rollback | UI-created mutation IDs, duplicate payload builders |
| Runtime synchronization | `lib/pos-runtime/runtime-sync-engine.ts` | authoritative fetch, focus sync, interval sync, stale/optimistic protection | UI-owned polling, direct persistence writes |
| Table reconciliation | `lib/runtime/table-state-engine.ts` | merge decisions and reconciliation log | event emission, persistence, API calls |
| Persistence | `lib/pos-runtime/runtime-persistence-engine.ts` and low-level `lib/client/runtime-state.ts` | snapshot read/write, redundant suppression, cross-tab/runtime-state transport | render-phase writes, UI-local POS persistence ownership |
| Event lifecycle | `lib/pos-runtime/runtime-event-bus.ts` | runtime event fanout, duplicate suppression, diagnostics | component-owned event bus state |
| Session/tenant/device context | `lib/runtime/runtime-session-engine.ts`, `lib/runtime/tenant-runtime-context.ts`, `lib/device-runtime/device-session-registry.ts` | authenticated runtime context, tenant/branch scope, device ownership | UI-created tenant/device authority |

## Transitional Adapters

`lib/client/authoritative-table-orders.ts` remains as a compatibility adapter for existing table/floor consumers. It must not own API URLs or perform its own table-orders fetch. It delegates authoritative fetch to `fetchAuthoritativeTablePayload` in `runtime-sync-engine`.

`lib/client/runtime-state.ts` remains the low-level tenant/system-admin runtime-state transport. Phase 2 treats it as infrastructure under the persistence boundary, not as POS reconciliation authority.

## Validation

`npm run recomposition:phase2-validate` enforces the static ownership rules above. It fails when POS API ownership, event emission, mutation ID generation, or authoritative sync ownership drifts outside canonical boundaries.
