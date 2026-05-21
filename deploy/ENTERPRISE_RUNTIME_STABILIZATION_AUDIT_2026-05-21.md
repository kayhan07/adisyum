# Enterprise Runtime Stabilization Audit - 2026-05-21

## Canonical Platform URLs

- Website: `https://adisyum.com`
- Application: `https://adisyum.com/app`
- System admin: `https://adisyum.com/system-admin`

These URLs are production contracts. Stabilization must preserve them.

## Executive Finding

Adisyum is not failing because one isolated module is broken. The current risk is overlapping runtime authority:

- Product data can come from server `Product` rows, client `adisyon-sale-products`, and seeded defaults.
- Active table/order state can be rendered from React state, authoritative DB fetches, local runtime snapshots, table live totals, and optimistic lines.
- Deployment authority is split across Next standalone, PM2, Nginx, Cloudflare, build manifests, and local deploy scripts.

The stabilization target is not a rewrite. The target is a controlled reduction to one owner per responsibility.

## Current Ownership Map

| Responsibility | Current owner(s) | Target owner | Risk |
| --- | --- | --- | --- |
| Product master data | `prisma.product`, `lib/sale-product-catalog.ts`, seeded defaults | Product Domain backed by DB | Client storage can drift from tenant product records. |
| POS catalog runtime | `lib/server/runtime-pos-catalog.ts`, `lib/canonical-pos-catalog.ts`, `buildPosCatalogFromStored` | POS Runtime Domain, server compiled immutable catalog | Client-built catalog and server catalog may disagree. |
| Active order mutation | `app/api/pos/table-orders/route.ts` | POS Runtime Domain API | Correct owner, but route still accepts legacy shapes during migration. |
| Active order render state | `components/order-composer.tsx`, `lib/client/authoritative-table-orders.ts` | Table State Engine read model | React state owns reconciliation decisions inside UI. |
| Table totals/payment requested/meta | `lib/table-payment-state.ts`, `lib/client/runtime-state.ts` | Table State Engine | Totals/meta are persisted separately from authoritative orders. |
| Optimistic mutation queue | inline in `components/order-composer.tsx` | POS Runtime Domain client adapter | No durable queue owner yet. |
| Runtime local persistence | `lib/client/runtime-state.ts`, `/api/runtime/state/[scope]` | Runtime Snapshot Service | Generic key-value snapshot is used for business state ownership. |
| Device/printer bridge | `lib/integration-store.ts`, printer APIs, local agent fetchers | Device Runtime Domain | UI imports device concerns directly. |
| Auth/session/tenant | `lib/requireTenant.ts`, `lib/session.ts`, middleware | Auth Domain | Correct boundary, must not carry business logic. |
| Deployment topology | `ecosystem.config.cjs`, `deploy/nginx/adisyum.conf`, `deploy/scripts/reconstruct-vps-runtime.sh` | Deployment Domain | Mostly stabilized, but production must verify live build id after every deploy. |

## Duplicated Authority Map

### 1. Product Catalog

Files:

- `lib/server/runtime-pos-catalog.ts`
- `lib/canonical-pos-catalog.ts`
- `lib/sale-product-catalog.ts`
- `components/order-composer.tsx`
- `components/product-operations-center.tsx`

Problem:

Server catalog is compiled from DB products, while client catalog can still be built from `adisyon-sale-products` runtime storage and defaults. This means POS can render a product that the mutation route later rejects.

Decision:

Product Domain owns editable product records. POS Runtime owns compiled immutable catalog snapshots. Client local sale-product storage is a migration/degraded-mode input only, not runtime authority.

Required stabilization:

1. Mark `buildPosCatalogFromStored` as legacy/degraded input.
2. POS screen must prefer `/api/runtime/pos-catalog`.
3. Product operations may edit product domain, but cannot publish directly to POS runtime without server catalog compile.

### 2. Active Table Orders

Files:

- `app/api/pos/table-orders/route.ts`
- `components/order-composer.tsx`
- `lib/client/authoritative-table-orders.ts`
- `lib/table-payment-state.ts`
- `lib/pos-order-reconciliation.ts`

Problem:

The database mutation route is authoritative, but UI state, optimistic lines, runtime snapshots, live totals, and interval/focus refreshes can all affect visible active table state.

Decision:

The Table State Engine must own the rendered read model. It can accept:

- optimistic local mutation
- authoritative mutation response
- authoritative refresh
- websocket event

But merge decisions must live in one module, not inline in the UI.

Required stabilization:

1. Move `reconcileAuthoritativeOrders` logic out of `components/order-composer.tsx`.
2. Keep `lib/pos-order-reconciliation.ts` as the only merge reducer.
3. Treat `table-payment-state` totals/meta as derived or ancillary state, never order-line authority.
4. Remove any path that clears active orders without a confirmed authoritative mutation.

### 3. Runtime Snapshot Store

Files:

- `lib/client/runtime-state.ts`
- `app/api/runtime/state/[scope]/route.ts`
- `lib/table-payment-state.ts`

Problem:

`runtime-state` is a generic tenant key-value sync layer, but it currently contains table state coordination logic (`aurelia-table-state-sync-meta`, table keys, stale snapshot guards). That makes generic runtime storage aware of POS table behavior.

Decision:

Runtime Snapshot Service can persist generic client state, but POS table conflict resolution belongs to Table State Engine.

Required stabilization:

1. Move table-specific stale snapshot rules out of `runtime-state.ts`.
2. Keep `runtime-state.ts` as storage transport: read/write/subscribe/persist.
3. Add a Table State adapter that owns table snapshot versioning.

### 4. Optimistic Mutations

Files:

- `components/order-composer.tsx`
- `lib/pos-order-reconciliation.ts`
- `app/api/pos/table-orders/route.ts`

Problem:

Optimistic lines are created inline in the UI and identified by `optimistic-${mutationId}`. Reconciliation knows how to preserve them, but the queue itself has no canonical owner.

Decision:

Optimistic mutation queue belongs to POS Runtime Domain client adapter. UI should dispatch an intent and render a read model.

Required stabilization:

1. Create a small `lib/pos-runtime/order-mutations.ts` module.
2. Move mutation id creation, optimistic line creation, fetch dispatch, and rollback/commit decisions into that module.
3. UI remains an event source and renderer only.

### 5. Deployment Runtime

Files:

- `ecosystem.config.cjs`
- `deploy/nginx/adisyum.conf`
- `deploy/scripts/reconstruct-vps-runtime.sh`
- `scripts/audit-next-routes.mjs`
- `scripts/audit-production-runtime.mjs`
- `scripts/verify-deploy-runtime.mjs`

Current state:

- `adisyum-root-app` should run `.next/standalone/server.js` on `PORT=3000`, `HOSTNAME=0.0.0.0`.
- `adisyum-website` should serve website pages on `3010`.
- Nginx should route `/api`, `/app`, `/system-admin`, and operational app paths to `3000`; `/` should route to `3010`.

Risk:

Production can still serve stale code if SSH/deploy is interrupted. A commit is not a deploy.

Decision:

Deployment Domain is authoritative only after live runtime proof changes.

Required stabilization:

1. Every deploy must verify `/api/runtime-build-id`.
2. Deploy must fail if live git commit does not match expected commit.
3. Deploy must fail if `/api/pos/table-orders` is 404.
4. Nginx loaded config must be captured with `nginx -T` after reload.

## Dangerous State Mutations

These are the highest-risk current mutation surfaces:

- `components/order-composer.tsx` directly mutates `ordersByTable` for optimistic insert, rollback, merge, table move, table merge, and table clear.
- `lib/table-payment-state.ts` writes live totals and table sync metadata independently of DB order persistence.
- `lib/client/runtime-state.ts` rejects stale table snapshots inside a generic runtime store.
- `lib/sale-product-catalog.ts` preserves client-stored sale products and can rebuild POS catalog from client state.
- `app/api/runtime/state/[scope]/route.ts` filters sale products during generic runtime snapshot normalization, mixing product domain rules into runtime state transport.

## Target Bounded Contexts

### Product Domain

Owns:

- products
- product categories
- modifiers
- recipes
- pricing
- lifecycle

Must not own:

- active orders
- table state
- optimistic queues
- runtime reconciliation

### POS Runtime Domain

Owns:

- immutable POS catalog snapshots
- order mutation contracts
- product snapshots embedded into order items
- optimistic mutation queue
- mutation tracing

Must not directly mutate:

- Product entities
- category definitions
- device runtime state

### Table State Engine

Owns:

- active table read model
- reconciliation reducer
- table snapshot versioning
- active table protection

Must not own:

- product lifecycle
- printer/fiscal bridge
- authentication

### Device Runtime

Owns:

- printer bridge
- fiscal bridge
- local agents
- telemetry
- reconnect
- device queue

Must not own:

- table order mutation logic
- product catalog compilation

### Auth Domain

Owns:

- session propagation
- tenant validation
- role validation
- runtime permissions

Must not own:

- product decisions
- POS mutation business rules

### Deployment Domain

Owns:

- build id
- PM2 ownership
- Nginx upstream
- standalone integrity
- production diagnostics
- route manifest validation

## Controlled Refactor Plan

### Stage 1 - Freeze Ownership Rules

1. Add ownership notes to modules that currently cross boundaries.
2. Declare DB `/api/pos/table-orders` as the only active order mutation authority.
3. Declare `/api/runtime/pos-catalog` as the preferred POS catalog source.
4. Declare `lib/pos-order-reconciliation.ts` as the only reconciliation reducer.

### Stage 2 - Extract Without Changing Behavior

1. Move order mutation payload building from `order-composer.tsx` into `lib/pos-runtime/order-mutations.ts`.
2. Move table reconciliation wrapper from `order-composer.tsx` into `lib/runtime/table-state-engine.ts`.
3. Keep function signatures compatible so UI behavior does not change.

### Stage 3 - Remove Duplicate Authority

1. Stop persisting order lines through generic runtime snapshots.
2. Keep only meta/totals in `table-payment-state`, or derive totals from authoritative orders.
3. Make client sale-product storage a fallback only when server catalog fetch fails and diagnostics clearly reports degraded mode.

### Stage 4 - Observability

1. Add mutation timeline: optimistic dispatched, API accepted, DB committed, read model reconciled.
2. Add catalog source diagnostics: server catalog, fallback catalog, revision, checksum.
3. Add table state inspector showing current owner and last authoritative source.
4. Add deploy verification that compares expected commit to live `/api/runtime-build-id`.

### Stage 5 - Cleanup

1. Remove dead compatibility paths after production logs prove no traffic uses them.
2. Keep temporary payload normalization only until all clients send canonical mutation payload.
3. Remove debug console logs after incident closure.

## Immediate Next Engineering Tasks

1. Deploy commit `054f9a8` so live POS payload normalization is active.
2. Validate browser POST shows `[adisyon-flow] table-orders payload`.
3. If `malformed_order_item` persists, inspect server log `[pos-table-orders] malformed_order_item` for missing fields.
4. Extract `addProductToAuthoritativeOrder` and optimistic line creation into `lib/pos-runtime/order-mutations.ts`.
5. Make `runtime-state.ts` table-agnostic by moving table snapshot merge rules to the Table State Engine.

## Stabilization Change Log

- 2026-05-21: Added `lib/runtime/table-state-engine.ts` as the first Table State Engine boundary. `components/order-composer.tsx` no longer calls the low-level reconciliation reducer directly; it delegates to `reconcileTableState`, which owns the active table reconciliation log shape and reducer invocation.
- 2026-05-21: Added `lib/pos-runtime/order-mutations.ts` as the first POS Runtime mutation boundary. Mutation id creation, pending mutation shape, optimistic line creation, payload dispatch, rollback filtering, and mutation result normalization moved out of `components/order-composer.tsx`.

## Non-Goals

- No URL changes.
- No branding changes.
- No tenant structure changes.
- No auth concept rewrite.
- No desktop/fiscal/printer strategy rewrite.
- No greenfield replacement.

## Success Criteria

- Product click dispatches one mutation intent.
- API mutation route is the only writer of persisted active order items.
- Table State Engine is the only client-side merge/reconciliation owner.
- Product Domain compiles runtime catalog but does not own table/order state.
- Device Runtime does not import UI/POS order mutation concerns.
- Production deploy is not accepted until live build id matches the pushed commit.
