# Deployment Scaling And Rollback

No rewrite is introduced in Phase 8.

## Deployment scale readiness

Production deploys must preserve canonical topology:

- `adisyum-root-app` owns application and API runtime on port 3000.
- `adisyum-website` owns marketing runtime on port 3010.
- `adisyum-worker` owns background jobs.

## Rollback rules

Every deploy must support rollback safety.

Rollback must preserve runtime-build-id visibility, PM2 ownership proof, nginx ownership proof, and `/api/pos/table-orders` route proof.

If runtime-build-id does not match the expected commit, deployment is invalid.

## Scale risks

Deployment bottlenecks include restart storms, stale standalone artifacts, invalid PM2 sequencing, stale nginx config, and browser/runtime drift.

## Recovery sequence

Validate build artifact, start canonical PM2 ownership, verify nginx routing, verify route manifests, verify runtime-build-id, then validate POS API route behavior.
