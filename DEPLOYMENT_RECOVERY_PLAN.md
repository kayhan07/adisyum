# Deployment Recovery Plan

No rewrite is introduced in Phase 7.

## Centralized telemetry ownership

Deployment telemetry is exposed through `/api/runtime-build-id` and summarized by `lib/observability/enterprise-telemetry.ts`.

## Required proof

Every deploy must become verifiable.

Every deploy must support rollback safety.

A deploy is invalid unless:

- `/api/runtime-build-id` responds from production.
- The active git commit matches the expected deployment commit.
- PM2 exposes the canonical runtime ownership.
- nginx routes `/api`, `/app`, and `/system-admin` to `127.0.0.1:3000`.
- nginx routes marketing `/` to `127.0.0.1:3010`.
- `/adisyonsistemi` redirects to `/app`.
- `/api/pos/table-orders` does not return 404.

## Recovery sequence

1. Stop stale PM2 ownership.
2. Remove stale standalone/build artifacts.
3. Rebuild from the intended commit.
4. Start only canonical PM2 processes.
5. Validate PM2 ownership.
6. Validate nginx ownership.
7. Validate `/api/runtime-build-id`.
8. Validate `/api/pos/table-orders`.

## Drift response

Runtime-build-id mismatch means production is not running the intended artifact. Do not continue POS or frontend debugging until deployment authority is restored.

Rollback is required when the live runtime cannot prove the intended commit, PM2 ownership, nginx ownership, and POS API route ownership after a deployment attempt.

Every runtime failure must become observable.

Every runtime crash must become recoverable.
