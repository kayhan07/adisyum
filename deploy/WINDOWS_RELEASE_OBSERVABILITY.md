# ADİSYUM Update Observability

## Dashboard widgets

- current version distribution
- channel distribution
- failed update count
- rollout success rate
- rollback count
- average update latency
- outdated tenant count
- tenant-targeted rollout list

## Suggested API fields

- `runtimeVersion`
- `installerVersion`
- `releaseChannel`
- `rolloutTrack`
- `stagedPercent`
- `lastUpdateAt`
- `updateStatus`
- `rollbackReason`
- `healthScore`

## Notes

The bridge health payload now exposes release version and channel so the Windows tray can show:

- current version
- current release channel
- printer health
- websocket health
- reconnect state
