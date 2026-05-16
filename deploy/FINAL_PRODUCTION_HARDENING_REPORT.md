# Adisyum Final Production Hardening Report

Generated: 2026-05-16

## Executive Summary

This audit focused on production-critical risks for Adisyum SaaS Restaurant POS/ERP: tenant isolation, multi-device consistency, financial/order integrity, realtime reliability, database hardening, and operational resilience.

The platform has improved from local-only POS behavior to a DB-backed runtime snapshot model, but the current POS order authority is still not fully enterprise-grade. The most important remaining architectural gap is that open table/adisyon state is stored as a tenant runtime snapshot rather than normalized `Order` / `OrderItem` rows with a server-side active-order API for every mutation.

## Fixes Applied In This Pass

| Severity | Area | Issue | Fix |
| --- | --- | --- | --- |
| Critical | Tenant isolation | `/api/desktop-bridge/telemetry` accepted `body.tenantId || session.tenantId`, allowing an authenticated tenant client to submit telemetry against another tenant. | Session tenant is now authoritative. Mismatched body tenant is rejected with 403 and warning telemetry. |
| Critical | Tenant isolation | `/api/pilot-field/ingest` accepted `body.tenantId || session.tenantId`, allowing tenant-mismatched diagnostics. | Session tenant is now authoritative. Mismatched body tenant is rejected with 403 and warning telemetry. |
| High | Multi-device POS | POS runtime sync previously bootstrapped DB runtime once and then only emitted local events. | `refreshRuntimeScope('tenant')` and floor/order polling now rehydrate from server runtime snapshot. |
| High | Runtime reconciliation | Identical runtime snapshots and item values could be rebroadcast repeatedly. | Equality guards were added around runtime item writes and snapshot refresh/persist. |

## Tenant Isolation Audit

### Findings

1. **Most Prisma models are tenant-scoped.**
   - Orders, order items, payments, products, stock, recipes, runtime states, users, roles, sessions, media, offline events, and sync queues all include `tenantId`.
   - Compound unique constraints exist for sensitive identity areas such as users, roles, permissions, sessions, branches, runtime state, and offline events.

2. **Client-provided tenant IDs are still a high-risk pattern.**
   - Login must accept a tenant identifier by design.
   - Super-admin routes may legitimately target tenant IDs.
   - Normal tenant routes must not accept arbitrary body tenant IDs. Two telemetry routes were fixed in this pass.

3. **Runtime state is tenant-keyed in DB but still client-shaped.**
   - `runtime_states` uses `@@unique([tenantId, key])`.
   - The payload is JSON and currently includes POS table/order snapshots. This prevents cross-tenant leakage, but it is weaker than normalized order authority.

4. **Local runtime stores are scoped by the authenticated tenant snapshot, not by browser storage namespace.**
   - This is acceptable only if runtime-state API remains tenant-session authoritative.
   - Browser local state must never be trusted by server APIs without session tenant validation.

### Production Rule

Every API route that mutates or reads tenant data must derive tenant authority from `requireTenant(request)` or the validated session. Frontend payload tenant IDs may be used only as diagnostics metadata or super-admin target IDs after explicit authorization checks.

## Multi-Device Consistency Audit

### Root Cause

The POS historically used local/runtime snapshots as source of truth. Device A could write a table/adisyon snapshot, while Device B would keep its own local snapshot because there was no active tenant-wide order subscriber and repeated polling did not fetch the server snapshot after bootstrap.

### Current State After Fixes

- Device B now periodically refreshes tenant runtime state from the server snapshot.
- Identical runtime values no longer rebroadcast.
- This should prevent the immediate "same table opens from scratch" failure in most connected scenarios.

### Remaining Risk

The canonical enterprise-grade target is:

`Order` + `OrderItem` rows as source of truth, with a server API:

- `GET /api/pos/active-orders`
- `POST /api/pos/orders/upsert-line`
- `PATCH /api/pos/orders/[id]/items/[itemId]`
- `POST /api/pos/orders/[id]/payments`

Each mutation must run in a DB transaction and publish a tenant/branch-scoped realtime invalidation event. Runtime JSON snapshots should become cache/UX acceleration only.

## Financial & Order Integrity Audit

### Findings

1. `OrderService.createOrder` and `PaymentService.takePayment` use DB transactions.
2. POS table product insertion still primarily updates runtime snapshot state, not normalized DB `OrderItem` rows.
3. Payment, split payment, stock deduction, and recipe consumption must be moved behind authoritative server transactions before high-volume production rollout.
4. Rounding should be centralized server-side; frontend totals should be treated as preview only.

### Required Hardening

- Server recalculates subtotal, VAT, discounts, and totals.
- Server rejects stale order versions using optimistic concurrency (`version` or `updatedAt` check).
- Payments are idempotent with a client mutation ID.
- Stock/recipe deduction occurs in the same transaction as order close or kitchen-send, depending on business rule.

## State Management Audit

### Findings

- Runtime snapshots, local component state, offline queue, and DB runtime state overlap.
- Equality guards reduce loops, but there is still no single canonical domain store for POS order state.
- Floor and order screens now rehydrate from DB-backed runtime state, but they can still diverge under network partitions.

### Recommendation

Introduce a small POS order client store whose only persisted source is server active-order API responses. Local optimistic updates should be tagged with mutation IDs and reconciled against server versions.

## Websocket & Realtime Audit

### Findings

- `publishTenantEvent()` exists and is tenant scoped.
- KDS has Echo/Pusher client logic.
- POS order/table screens do not have a tenant order event subscriber.
- Redis pub/sub publish is not enough unless clients subscribe and reconcile.

### Required Hardening

- Subscribe POS clients to `tenant:{tenantId}:orders` and `tenant:{tenantId}:tables`.
- Branch scope events where needed: include `branchId` and ignore non-active branches.
- Re-fetch authoritative active orders on event, never blindly apply payload over fresher local mutations.

## Database Hardening Audit

### Findings

- Tenant indexes are broadly present.
- `Order` is missing an index optimized for open table lookups: recommended `@@index([tenantId, tableId, status])`.
- `OrderItem` is missing a composite uniqueness/idempotency key for client mutations.

### Recommended Schema Hardening

- Add `version Int @default(1)` to `Order`.
- Add `clientMutationId String?` to `OrderItem` or a separate mutation ledger.
- Add `@@index([tenantId, tableId, status])` to `Order`.
- Add DB relations from `Order` to `OrderItem` if migration window permits.

## Production Resilience Audit

### Current Positive Controls

- Canonical reconstruction script exists.
- PM2 architecture is constrained to root app + website.
- NGINX monolith path routing is stabilized.
- Build validates `.next/BUILD_ID`.
- Runtime diagnostics and POS flow logs exist.

### Required Next Controls

- Add `/api/health/ready` with DB, runtime-state, and Redis checks.
- Add synthetic POS mutation smoke test for staging.
- Add tenant mismatch alerts from API warning logs.
- Add realtime subscriber health to tenant observability.

## Real Restaurant Simulation Risks

For a 50-table, 5-waiter, 2-cashier environment:

- Runtime JSON snapshots can become large and conflict-prone.
- Polling at 2.5 seconds is acceptable as a short-term fallback, but not true realtime.
- Concurrent product adds to the same table need server idempotency and version checks.
- Payment/close operations must be impossible to duplicate.

## Production Recommendations

1. Promote POS orders from runtime snapshot to normalized DB order authority.
2. Add tenant/branch-scoped POS realtime subscribers.
3. Add idempotency keys to order and payment mutations.
4. Centralize all financial calculations server-side.
5. Add active-order optimistic concurrency.
6. Convert stock and recipe consumption to transactional server operations.
7. Keep runtime snapshots only as cache/offline fallback.
8. Add end-to-end multi-device Playwright tests against a staging database.

## Current Validation

The changes in this hardening pass must pass:

- `npx tsc --noEmit`
- `npm run build`
- Production route smoke checks

Live VPS deploy could not be performed from the local workstation if SSH port 22 is unreachable. In that case deploy must be run directly on the VPS with:

```bash
cd /root/adisyum
git pull --ff-only
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```

