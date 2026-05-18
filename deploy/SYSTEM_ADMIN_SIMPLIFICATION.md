# System Admin Simplification

## New Mental Model

- Dashboard = overview
- Workspace = active operation
- Detail = investigation

## Changes In This Pass

- `Tenantlar` is renamed to `Abonelikler`.
- The subscription portfolio page no longer exposes onboarding forms or provisioning investigation surfaces.
- New subscription creation and provisioning recovery move to `/system-admin/onboarding`.
- Onboarding now has focused tabs for creation, jobs, failures, retry, rollback, template import, and health.

## UX Principle

Do not mix overview, workflow, and investigation on the same screen.

## Next Cleanup

1. Physically remove the disabled legacy subscriber workflow block from the old page component.
2. Continue reducing overview tables in favor of card summaries.
3. Move remaining provisioning exports and template-import tooling into dedicated onboarding sub-surfaces.
