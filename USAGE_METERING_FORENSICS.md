# Usage Metering Forensics

No rewrite is introduced in Phase 10.

## Metrics

Canonical usage metrics include POS operations, realtime sync, websocket activity, AI operations, voice/PBX usage, API usage, worker jobs, telemetry volume, storage usage, and printing operations.

## Metric contract

Every usage metric must have owner, billing strategy, aggregation, retention, and observability.

## Forensics

Usage events must include tenant id, source event id, metric, period, aggregation owner, and idempotency key.

Every billing event must be tenant-scoped and idempotent.

Credit deduction must be deterministic and negative-balance protected.
