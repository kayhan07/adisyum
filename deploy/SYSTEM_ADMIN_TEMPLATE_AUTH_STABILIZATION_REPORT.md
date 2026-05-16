# System Admin Template/Auth Stabilization Report

Date: 2026-05-17

## Root cause

System-admin authorization previously treated `role === "super_admin"` as the only hard requirement. That was too loose for system scope and too opaque during mixed-session failures. A POS tenant session could reach the system-admin UI path, then fail later inside API guards with `super_admin yetkisi gerekir`.

## Auth hardening applied

- System-admin API authorization now requires both:
  - `tenantId === "system"`
  - `role === "super_admin"`
- Middleware now treats `/api/system-admin/*` as system-admin protected scope, not only `/system-admin/*` pages.
- Rejected system-admin API requests now log tenant, role, user, branch, and path context.
- The system-admin page revalidates `/api/auth/me` after login and only unlocks the control center when the returned session is actually the system tenant super admin.

## Template operations added

The existing template architecture already had:

- product templates
- recipe templates
- recipe template items
- stock templates
- category templates
- template packs
- template pack items
- import analytics

This pass added the management layer:

- system-admin catalog loader for all template entities
- create/update product template service
- safe product delete/deprecate behavior
- create/update category template service
- create/update stock template service
- create/update recipe template service with ingredient replacement
- create/update pack service with visual product assignments
- `/api/system-admin/templates` write/delete operations
- system-admin UI forms for product, category, stock, recipe, and pack authoring

## Safety rules

- System templates remain owned by `tenantId = "system"`.
- Tenant runtime data is still created only through deep-clone import flows.
- Imported product templates are not hard-deleted once tenants depend on them; they are deprecated instead.
- Pack assignments are rebuilt transactionally when edited.

## Remaining product work

The current management surface is operational, but the following should be added in a later focused pass:

- richer edit affordances for stock/category/recipe rows
- template image assets and marketplace cards
- explicit version-history timeline and rollback UI
- pack deletion/deprecation controls
- import failure analytics panel

## Validation

- `npx tsc --noEmit`
- production build pending in this pass
