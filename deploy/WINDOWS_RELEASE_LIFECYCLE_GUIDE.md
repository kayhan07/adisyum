# ADİSYUM Enterprise Release Lifecycle Guide

## Release flow

1. Build runtime and installer.
2. Stamp SemVer and build number.
3. Generate signed update manifest.
4. Publish to release channel.
5. Roll out to pilot tenants first.
6. Observe telemetry and update latency.
7. Promote to beta.
8. Promote to stable.
9. Roll back by tenant if health degrades.

## Channel ladder

`internal` -> `pilot` -> `beta` -> `stable`

`hotfix` may be pushed directly to a selected tenant set and then re-promoted.

## Rollout safety gates

- printer health
- websocket health
- local API health
- tray uptime
- update integrity
- install success rate
- rollback success rate

## Observability signals

Track:

- current versions by tenant
- failed updates
- update latency
- rollback events
- outdated runtime count
- channel distribution

## Recommended ops policy

- use `pilot` for restaurants that consent to early release
- never promote to `stable` until telemetry remains healthy for the configured window
- retain the last known good installer and manifest for rollback
