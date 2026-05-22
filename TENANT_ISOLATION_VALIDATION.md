# Tenant Isolation Validation

Status: required validation plan for enterprise recomposition.

## Isolation Principle

Every business mutation must resolve tenant identity from authenticated session or system-admin scoped server authority. Client-provided tenant ids may be accepted only when validated against the session scope or explicit admin permission.

## Required Tenant Context

Runtime context must include:
- `tenantId`
- `branchId` when branch-scoped
- `userId`
- `role`
- `subscriptionId`
- `packageType`
- permissions

Canonical owners:
- `lib/runtime/runtime-session-engine.ts`: session propagation and role validation.
- `lib/runtime/tenant-runtime-context.ts`: tenant and branch runtime scope.
- server routes: `requireTenant(request)` or equivalent session validation.

## Validation Matrix

| Flow | Must prove |
| --- | --- |
| Login | session cookie domain `.adisyum.com`, tenant scoped user, branch resolved. |
| POS table mutation | tenant from session, not arbitrary client payload. |
| Product/catalog read | only tenant-visible products/categories. |
| Runtime catalog compilation | tenant/branch visibility rules applied. |
| Device registration | tenant + device id uniqueness. |
| Printer bridge telemetry | cross-tenant bridge payload rejected. |
| System admin | cross-tenant access requires super admin/system context. |
| Offline queue | queued operations are tenant scoped and replay only into same tenant. |
| Runtime persistence | local snapshots cannot cross tenant scope. |

## Smoke Test Scenarios

### Scenario 1: Tenant A Cannot Read Tenant B Products

1. Login as tenant A.
2. Request product/catalog API.
3. Assert no tenant B product ids, categories, or runtime snapshots appear.

### Scenario 2: Tenant A Cannot Mutate Tenant B Table

1. Login as tenant A.
2. POST `/api/pos/table-orders` with a payload that includes tenant B identifiers.
3. Assert route uses session tenant A or rejects payload.
4. Assert tenant B orders remain unchanged.

### Scenario 3: Branch Scope Is Preserved

1. Login to tenant A branch X.
2. Register/update a device or table order.
3. Assert `branchId` matches session/runtime scope.
4. Assert branch Y state does not change unless explicitly allowed.

### Scenario 4: Device Cannot Cross Tenant

1. Register bridge/device under tenant A.
2. Send telemetry with tenant B in body.
3. Assert rejection or normalization to session tenant.
4. Assert no tenant B device row is created.

### Scenario 5: Offline Replay Is Tenant Bound

1. Queue offline order for tenant A.
2. Switch session to tenant B.
3. Attempt replay.
4. Assert replay rejects or remains isolated to tenant A.

## Database Assertions

For tenant-scoped models:
- compound unique keys should include `tenantId`.
- branch-scoped records should include `[tenantId, branchId]` where operationally required.
- foreign keys should reference tenant-safe compound keys where practical.
- soft delete fields should not bypass tenant filters.

## Runtime Assertions

For browser/runtime state:
- runtime storage keys must include tenant scope or be cleared on tenant switch.
- `clearRuntimeScope('tenant')` must run on logout or tenant switch.
- no UI component may store authoritative cross-tenant state outside runtime owners.

## Deployment Gate

Before tenant/data cleanup deploy:

```bash
npm run build
npx tsc --noEmit
npm run routes:audit
npm run runtime:audit-production
```

After deploy:

```bash
curl https://adisyum.com/api/runtime-build-id
curl -i -X POST https://adisyum.com/api/pos/table-orders
```

Expected unauthenticated POS route:

```text
401 missing_session
```

Any `404` means infrastructure drift, not tenant isolation success.

