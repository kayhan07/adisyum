# Observability Retention Architecture

## Hot And Cold Data

- Hot data:
  - `PresenceSession`
  - `DeviceHeartbeat`
  - recent `OperationalEvent`
- Cold data:
  - `OperationalMetricBucket`
  - `TelemetryArchiveRun`

Realtime dashboards read hot data. Historical analysis reads hourly and daily buckets so dashboard latency does not grow with raw event volume.

## Retention Policy

- Presence sessions: 90 days
- Device heartbeat rows: 7 days
- Non-critical operational events: 30 days
- Critical operational events: 365 days

The retention worker records every cleanup pass in `TelemetryArchiveRun`.

## Aggregation

The `observability-aggregation` BullMQ lane now runs:

- hourly aggregation
  - event counts by type
  - presence counts and latency
  - device counts and latency
- daily aggregation
  - event counts by severity

Workers persist summaries into `OperationalMetricBucket` using deterministic upserts, so retries are idempotent.

## Flood Control

- Repeated non-critical operational events with the same tenant/type/source/message/entity inside 60 seconds are sampled down to one row.
- Live snapshots are cached for 2.5 seconds to reduce duplicate SSE pressure.
- SSE continues to publish current snapshots, while raw heartbeat writes remain compact upserts rather than append-only spam.

## Scaling Notes

- Composite indexes support tenant/time and metric/time access paths.
- Raw data remains bounded through retention.
- Historical queries use pre-aggregated buckets instead of raw scans.
- The aggregation lane is isolated from onboarding and other worker traffic.

## AI Readiness

The bucket model is suitable for future:

- tenant risk scoring
- anomaly detection
- printer failure prediction
- operational forecasting
- usage intelligence
