# Tenant Provisioning Transaction Report

Date: 2026-05-17

## Root cause

The provisioning transaction created `Tenant.mainBranchId = branchId` before the referenced `Branch` row existed. Because `tenants(tenant_id, main_branch_id)` has a foreign key to `branches(tenant_id, branch_id)`, tenant creation could fail immediately with:

`tenants_tenant_id_main_branch_id_fkey`

## Corrected order

Provisioning now runs in one Prisma transaction using this order:

1. Create tenant with `mainBranchId = null`
2. Create default branch
3. Verify the branch exists
4. Update tenant with the verified branch id
5. Create subscription
6. Create roles
7. Create admin user
8. Create role assignment
9. Create runtime defaults and audit log

Any failure rolls back the whole graph.

## Diagnostics added

Provisioning now logs:

- `tenant-created`
- `branch-created`
- `tenant-main-branch-updated`
- `subscription-created`
- `roles-created`
- `admin-user-created`

These logs intentionally avoid password material.
