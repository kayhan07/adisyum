# Production DB Demo Residue Audit Report

Date: 2026-06-01

Status: AUDIT AND DRY-RUN TOOLING READY. PRODUCTION APPLY NOT EXECUTED.

## Scope

This audit is intentionally conservative. It detects demo, seed, test, orphan and tenant-mismatch records without deleting customer data. The cleanup command defaults to dry-run and never hard-deletes business or financial history.

## Commands

Read-only audit:

```bash
npm run db
```

Explicit audit alias:

```bash
npm run db:demo-residue-audit
```

Dry-run cleanup plan:

```bash
npm run db:demo-residue-cleanup
```

Production apply after database backup and manual plan review:

```bash
CONFIRM_DB_DEMO_CLEANUP=YES \
I_UNDERSTAND_THIS_TOUCHES_PRODUCTION_DB=YES \
DB_DEMO_CLEANUP_OPERATOR_NOTE="approved production demo cleanup" \
npm run db:demo-residue-cleanup
```

## Scanned Tables

The audit reads the live schema and scans tenant, subscription, user, session, device, printer, table, product, recipe, stock, order, payment, current-account, cash, report, provisioning, audit-log and runtime-state tables that actually exist.

## Detection Rules

- Legacy tenant marker: `ABN-48291`
- Text markers: `demo`, `test`, `seed`, `sample`, `mock`, `fixture`, `bistro`, `aurelia`, `default`, `anonymous`, `local`, `localhost`, `fake`
- Tenant-scoped records whose `tenant_id` has no tenant
- Runtime snapshots with embedded foreign `tenantId` / `tenant_id`
- Old volatile runtime keys and oversized snapshots
- Duplicate printer names per tenant, orphan printer mappings and stale agent registries
- Orphan order lines, deleted-product POS lines, orders without tables, tables without floor groups, sessions without users
- Active tenants without an active subscription
- Latest 20 non-system tenants with clean-start counters

## Cleanup Categories

### A. Safe To Delete / Prune

- Orphan runtime states
- Runtime snapshots carrying another tenant identity
- Demo residue snapshots tied to a deleted or exact legacy demo tenant
- Expired volatile runtime snapshots tied to deleted tenants

### B. Safe To Soft Delete / Archive

- Exact legacy demo tenant
- Tenants with explicit `metadata.demoSeed`, `metadata.seed` or `metadata.fixture`
- Their sessions, users and subscriptions
- Orphan demo printers and orphan stale device registry rows

### C. Need Manual Review

- Real tenants, products or printers whose name merely contains words such as `test`, `demo`, `default` or `local`
- Active tenants with unexpected initial business records
- Runtime snapshots that are old but still belong to an active tenant

### D. Do Not Touch

- Orders and order items
- Payments
- Cash movements
- Current accounts
- Reports and financial history
- Active customer tenant data

## Backup / Rollback

Before apply, take a PostgreSQL backup. The cleanup script also writes a JSON plan:

```text
/backups/demo-residue-cleanup-YYYY-MM-DDTHH-MM-SS.json
```

Outside production, the default location is the repository `backups/` directory. The JSON includes affected tenant ids, tables, runtime-state ids, soft-delete ids, timestamp and operator note.

Rollback for soft-deleted tenant records must be performed manually after review by clearing `deleted_at`, restoring subscription status and reactivating users. Runtime-state prune is intentionally limited to records classified as safe; use the database backup if rollback is required.

## Example SQL Checks

```sql
SELECT tenant_id, name, status, metadata
FROM tenants
WHERE tenant_id = 'ABN-48291'
   OR lower(row_to_json(tenants)::text) LIKE '%demo%';

SELECT r.id, r.tenant_id, r.key, r.updated_at, pg_column_size(r.payload)
FROM runtime_states r
LEFT JOIN tenants t ON t.tenant_id = r.tenant_id
WHERE t.tenant_id IS NULL
   OR lower(r.payload::text) LIKE '%abn-48291%'
   OR lower(r.payload::text) LIKE '%demo%';

SELECT item.*
FROM order_items item
LEFT JOIN orders parent
  ON parent.id = item.order_id AND parent.tenant_id = item.tenant_id
WHERE parent.id IS NULL;

SELECT p.tenant_id, lower(p.name), count(*), array_agg(p.id)
FROM printers p
GROUP BY p.tenant_id, lower(p.name)
HAVING count(*) > 1;
```

## Example Prisma Checks

```ts
await prisma.runtimeState.findMany({
  where: { tenantId: 'ABN-48291' },
});

await prisma.tenant.findMany({
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

## Execution Result

Production DB audit was not executed from the local development workstation. No production record was modified. Run `npm run db` on the VPS with the production `.env.production`, review `artifacts/db-demo-residue-audit-latest.json`, take a DB backup, then run the cleanup command without confirmation flags for a dry-run plan.
