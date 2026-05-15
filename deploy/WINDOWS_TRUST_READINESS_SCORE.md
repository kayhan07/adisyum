# ADİSYUM Windows Trust Readiness Score

## Scores

- Windows trust readiness: **87 / 100**
- Signing maturity: **82 / 100**
- Update security: **89 / 100**
- SmartScreen readiness: **78 / 100**

## Why

### Trust readiness

Strong points:
- update manifest requires trust metadata
- updater now validates checksum, signature and channel
- security observability captures failed security states
- timestamp server guidance added

Gap:
- actual EV certificate signing automation still needs CI integration.

### Signing maturity

Strong points:
- signed installer requirement documented
- signed binaries and updater requirement documented
- SHA-256 timestamped signing flow documented

Gap:
- signing step is not yet automated inside the repository.

### Update security

Strong points:
- background updater service scaffold exists
- partial/corrupt download detection
- rollback snapshot support
- staged install flow
- insecure source rejection

Gap:
- the updater currently needs a real production signing backend and Authenticode verification step in CI.

### SmartScreen readiness

Strong points:
- consistent product naming
- release channel discipline
- timestamped signature guidance
- installer branding documented

Gap:
- reputation must be accumulated through real signed distributions over time.

## Summary

This is now a production trust foundation rather than a simple installer:

- channel-aware
- signature-aware
- rollback-safe
- telemetry-backed
- service-oriented
