# Provisioning Resilience Report

Date: 2026-05-17

## What changed

Tenant creation is now wrapped by persisted provisioning jobs instead of being only a one-shot form submission.

## Job states

- pending
- provisioning
- completed
- failed
- rollback_pending
- rolled_back

The canonical step vocabulary also records the provisioning milestones already emitted by the transaction:

- tenant-created
- branch-created
- tenant-main-branch-updated
- subscription-created
- roles-created
- admin-user-created

## Idempotency

- Jobs use a stable `jobKey`.
- Retrying a completed tenant graph returns the already-valid tenant graph instead of creating duplicates.
- Template imports were already protected by unique constraints:
  - `template_imports(tenant_id, product_template_id)`
  - `template_pack_imports(tenant_id, template_pack_id)`
- Pack imports continue to use `upsert`, so retries do not duplicate pack rows.

## Recovery

System-admin can now:

- list recent provisioning jobs
- retry failed jobs
- rollback jobs

Rollback deletes tenant-owned onboarding artifacts in dependency order:

- template pack imports
- template imports
- runtime state
- user-role mappings
- users
- roles
- subscriptions
- branches
- tenant

## Diagnostics

Each job stores:

- status
- current step
- attempt count
- failure reason
- per-step diagnostics with duration
- started/completed/failed/rollback timestamps

## Safety notes

- Tenant graph creation remains one Prisma transaction.
- Rollback is a separate explicit transaction.
- No password material is stored in diagnostics.
