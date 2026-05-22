# Legacy Deployment Debt

No destructive migration is introduced in Phase 5.

## Safe to remove

- No deployment script was deleted in Phase 5. Deployment removal must happen only after production runbook references are updated.

## Migration required

- `deploy/scripts/fix-apache-nginx-production.sh`: corrective historical script. Replacement owner is `deploy/scripts/reconstruct-vps-runtime.sh`.
- `deploy/scripts/check-production.sh`: older smoke checker. Replacement owners are `routes:audit`, `runtime:audit-production`, and recomposition validators.
- Older deploy documentation references to corrective scripts should be updated in a future docs-only cleanup.

## Preserve for compatibility

- `deploy/nginx/adisyum.conf`: canonical nginx topology source.
- `deploy/scripts/reconstruct-vps-runtime.sh`: canonical production reconstruction owner.
- `ecosystem.config.cjs`: canonical PM2 ownership declaration.

## Critical - do not remove

- PM2 apps: `adisyum-root-app`, `adisyum-website`, `adisyum-worker`
- Nginx `/api`, `/app`, `/system-admin`, `/adisyonsistemi`, `/` ownership blocks
- runtime-build-id validation

## Validation

The Phase 5 validator prevents PM2 legacy app names, nginx legacy runtime ownership, and reintroduced `/adisyonsistemi` proxy ownership.

