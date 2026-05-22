# Database Ownership Map

Status: audit map for controlled data recomposition. Do not use this as permission to migrate data without a migration plan.

## Global Ownership Rule

Tenant data is owned by `Tenant.tenantId`. Branch-scoped data must also carry `branchId` where operationally relevant. System-admin flows may observe or manage multiple tenants, but normal runtime flows must always resolve tenant context from authenticated session or explicit tenant-safe server context.

## Core Tenant Models

| Model | Owner | Scope | Notes |
| --- | --- | --- | --- |
| `Tenant` | system/admin provisioning | tenant | Root tenant entity. `tenantId` is the stable business key. |
| `Branch` | tenant | tenant + branch | Unique by `[tenantId, branchId]`. |
| `PackagePlan` | system-admin | global | SaaS plan catalog. |
| `Subscription` | tenant/system-admin | tenant | Tenant subscription identity and expiry. |
| `User` | tenant | tenant + optional branch | Unique username/email per tenant. |
| `Role`, `Permission`, `UserRole`, `UserPermission` | tenant/system-admin | tenant | Runtime permissions must not contain business mutation logic. |
| `Session` | auth domain | tenant + user + branch | Session propagation source for runtime APIs. |
| `AuditLog` | observability/auth | tenant + optional branch | Immutable audit trail. |

## Product Domain Ownership

The product domain owns:
- products
- categories
- modifiers
- recipes
- pricing
- lifecycle state

It must not own:
- active table runtime
- order mutation state
- optimistic queues
- websocket reconciliation
- local runtime snapshots

Audit targets:
- product/category models and stores must have tenant ownership.
- product IDs used in active orders must be copied into immutable order item snapshots.
- archived/deleted products must not mutate historical order lines.
- category visibility and allowed product types must be enforced before runtime catalog compilation.

## POS Runtime Ownership

The POS runtime owns active operational state derived from domain data:
- immutable runtime catalog snapshots
- order mutations
- active table state
- optimistic mutation queue
- authoritative reconciliation

Table order mutation route:

```text
app/api/pos/table-orders/route.ts
```

Required persistence principles:
- every order/table mutation must resolve tenant from session.
- branch identity must come from session/runtime scope, not arbitrary client payload.
- order item product details must include immutable product snapshot fields.
- empty authoritative payloads cannot wipe active optimistic state without revision/timestamp checks.

## Device And Printer Ownership

Device ownership is tenant + branch scoped.

Known server surfaces:
- `app/api/devices/registry/route.ts`
- `app/api/desktop-bridge/telemetry/route.ts`
- `app/api/printers/*`

Rules:
- device registration must be keyed by tenant and device id.
- printer inventory must be bound to tenant/branch/device identity.
- bridge telemetry must reject cross-tenant payloads.
- fiscal/printer bridge authorization belongs to device runtime, not UI.

## Runtime Snapshot Ownership

Runtime snapshots are not product-domain records. They belong to runtime engines:
- table state engine
- runtime sync engine
- runtime persistence engine
- runtime event bus
- offline queue preparation

Known local/client stores still requiring audit:
- `lib/client/runtime-state.ts`
- `lib/offline-sync-store.ts`
- tenant runtime stores under `lib/*-store.ts` that call `readRuntimeItem` or `writeRuntimeItem`

Rule:
- local persistence may cache runtime state, but server persistence remains authoritative after successful mutation.
- no hidden localStorage key may become an independent source of truth for active table orders.

## Data Cleanup Backlog

Perform only after backup and dry-run:
1. inventory all models that do not include `tenantId` but should be tenant scoped.
2. inventory nullable `branchId` fields that affect operational routing.
3. identify demo tenant defaults used by production runtime.
4. identify JSON `metadata` fields carrying business-critical state that should be typed.
5. identify abandoned migrations or compatibility columns.
6. add tenant isolation test fixtures for product, order, device, printer, and catalog flows.

## Migration Safety Rules

- Never delete tenant data in the same migration that changes ownership.
- Add columns nullable first, backfill, validate, then enforce constraints.
- Backfills must be tenant-scoped and resumable.
- Every destructive cleanup needs rollback instructions.
- Run tenant isolation validation before and after migration.

