# System-Admin SaaS Control Center Architecture

## Locked Runtime Architecture

- Public website: `adisyum.com` -> `apps/website` -> port `3010`
- Business runtime: `adisyum.com/app` and `adisyum.com/system-admin` -> root Next.js app -> port `3000`
- Valid PM2 apps: `adisyum-root-app`, `adisyum-website`
- Removed assumptions: `app.adisyum.com`, `admin.adisyum.com`, port `3020`, split root runtimes, standalone output

## System-Admin Boundary

System-admin is reserved for the platform operations tenant:

- Tenant: `system`
- Role: `super_admin`
- Session source: server-side authenticated session
- API guard: `requireSystemAdmin()`

Normal tenant users must never access system-admin APIs. System-admin actions must never trust tenant IDs supplied by client state without server authorization.

## Implemented SaaS Foundation

The first production-grade foundation is now DB-backed tenant provisioning.

New system-admin API:

- `GET /api/system-admin/tenants`
  - Requires active `super_admin` session.
  - Lists real tenants from Prisma, excluding `system`.
  - Returns operational summary: total tenants, active tenants, expired tenants, branches, active users, daily orders, live revenue.

- `POST /api/system-admin/tenants`
  - Requires active `super_admin` session.
  - Provisions a tenant in a single database transaction.
  - Creates tenant, main branch, role set, tenant admin user, user-role mapping, subscription, runtime defaults, and audit log.

Provisioned records:

- `Tenant`
- `Branch`
- `Role`
- `User`
- `UserRole`
- `Subscription`
- `RuntimeState`
- `AuditLog`

Canonical initial roles:

- `tenant_admin`
- `cashier`
- `waiter`
- `kitchen`
- `accountant`

Default tenant settings include:

- Licensed modules
- POS defaults
- Printer defaults
- Onboarding checkpoints
- Branch/user/printer limits by package

## Tenant Lifecycle Model

The current provisioning API supports:

- Tenant/company creation
- Package assignment
- Trial or active subscription creation
- Main branch creation
- Admin credential creation with `passwordHash`
- Initial balance and kontor metadata
- Role and permission seed foundation
- POS runtime defaults

Next lifecycle operations should be implemented as dedicated DB-backed API mutations:

- Suspend tenant
- Reactivate tenant
- Cancel tenant
- Extend subscription
- Reset tenant admin password
- Update branch limits
- Update module package
- Adjust kontor/balance
- Impersonation with explicit audit trail

## Operational Dashboard Direction

System-admin dashboard now reads SaaS tenant summary from the database when available.

The next production modules should persist and expose:

- Online POS/device count
- Active tables
- Websocket connection count
- Failed API count
- Runtime error count
- Printer health
- DB/Redis/PM2/nginx health
- Tenant sync health

## Security Rules

- System-admin APIs must require `super_admin`.
- Tenant provisioning must only run inside server-side API routes.
- Generated tenant admin passwords must only be returned once after creation.
- Passwords must always be stored as `passwordHash`.
- Tenant IDs, branch IDs, roles, permissions, subscription records, and runtime defaults must be created transactionally.
- All system-admin operational mutations must write audit logs.

## Remaining Production Work

The current implementation is the SaaS control center foundation, not the full final operations platform.

Remaining high-priority modules:

- Tenant suspension/reactivation/cancellation APIs
- Subscription renewal and billing ledger
- Reseller ownership and commission persistence
- Live tenant monitoring from websocket/device telemetry
- Centralized observability ingestion and search UI
- Runtime health probes for PM2/nginx/DB/Redis
- Granular permission editor
- Safe tenant impersonation with audit boundary
- Usage quotas and module enforcement
- Billing events for branch/device/SMS/AI/voice usage

## Validation Expectations

Before production release:

- `npx tsc --noEmit`
- `npm run build`
- Super-admin login
- `GET /api/system-admin/tenants` returns DB-backed tenant list
- `POST /api/system-admin/tenants` creates tenant transactionally
- New tenant admin can log into POS tenant
- Audit log records provisioning action
- No normal tenant user can access system-admin APIs
