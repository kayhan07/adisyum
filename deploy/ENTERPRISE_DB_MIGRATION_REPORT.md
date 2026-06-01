# Adisyum Enterprise Multi-Tenant DB Migration Report

Date: 2026-05-13

## Implemented

- PostgreSQL + Prisma 7 architecture added.
- Prisma schema and deployable migration added.
- Prisma client singleton added with PostgreSQL driver adapter.
- Tenant-scoped repository helpers added.
- Audit logging helper added.
- Redis-safe tenant cache key helpers added.
- Zod validation helpers added.
- Seed script added.
- localStorage JSON import script added.
- DB tenant isolation smoke test added.

## Migrated Tables

Global/system:

- tenants
- subscriptions
- recipe_templates
- recipe_template_items
- audit_logs

Tenant scoped:

- users
- roles
- permissions
- tables
- table_groups
- products
- product_categories
- product_variants
- orders
- order_items
- payments
- customers
- suppliers
- stock_items
- stock_movements
- warehouses
- cash_registers
- cash_transactions
- printers
- printer_groups
- recipes
- recipe_items
- expenses
- shifts
- reports
- sync_queue
- offline_events
- runtime_states

## Tenant Isolation

Every tenant-scoped table has:

- required tenant_id
- INDEX(tenant_id)
- composite indexes where needed, including tenant_id + created_at and tenant_id + status

Service/repository helpers must always receive TenantContext from requireTenant().

## Recipe Template Model

- recipe_templates and recipe_template_items are global.
- recipes and recipe_items are tenant-scoped.
- cloneRecipeTemplateToTenant() copies template data into tenant-owned recipes without mutating the global template.

## Offline Sync

Added:

- sync_queue
- offline_events

Conflict handling should use updated_at ordering and idempotent tenant_id + event_id uniqueness.

## Cache

Redis keys must use:

- tenant:{tenantId}:products
- tenant:{tenantId}:tables
- tenant:{tenantId}:reports:{reportId}
- tenant:{tenantId}:orders:{status}

No shared cache key should be used for tenant data.

## Production Commands

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run tenant:db-smoke
```

Import localStorage export JSON:

```bash
TENANT_ID=TNT-PRODUCTION-CODE npm run tenant:import-localstorage -- ./snapshot.json
```

## Required Environment

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/adisyum?schema=public"
ADISYUM_JWT_SECRET="at-least-32-characters"
ADISYUM_SUPER_ADMIN_PASSWORD="strong-password"
REDIS_URL="redis://127.0.0.1:6379"
```

## Validation

Passed:

- npx prisma validate
- npx prisma generate
- npx tsc --noEmit
- node --check prisma/seed.mjs
- node --check deploy/scripts/import-localstorage-json.mjs
- node --check deploy/scripts/tenant-db-isolation-smoke.mjs

## Scores

- Tenant isolation score: 8/10
- Production readiness score: 7/10
- Scalability score: 7/10

## Remaining Work

- Route-by-route replacement of localStorage stores with Prisma repositories.
- Server-side password hashing and credential verification for tenant users.
- Redis client integration for tenant-scoped cache storage.
- Websocket auth handshake with signed tenant session validation.
- Row Level Security policies in PostgreSQL if direct SQL access is introduced.
- Full E2E tests for reports, exports, websocket events, and payment void flows.
