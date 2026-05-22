# Deployment Drift Forensics

No rewrite is introduced in Phase 7.

## Drift definition

Deployment drift exists when the repository, PM2 process, standalone runtime, nginx upstream, browser bundle, or live runtime-build-id disagree about what is serving production.

## Mandatory checks

Every deploy must become verifiable.

Check:

- `/api/runtime-build-id`
- active git commit
- `PM2_RESTART_COUNT`
- PM2 process identity
- nginx loaded config
- `/api/pos/table-orders`
- route manifests
- standalone output
- browser API namespace behavior

## Canonical ownership

`adisyum-root-app` on port `3000` owns API and application runtime.

`adisyum-website` on port `3010` owns only the marketing website.

nginx owns routing boundaries but does not own application behavior.

## Escalation

If runtime-build-id does not match the expected commit, the deploy is invalid.

If `/api/pos/table-orders` returns 404, do not debug POS state first. Prove runtime and proxy ownership first.

Every runtime failure must become observable.

Every runtime crash must become recoverable.
