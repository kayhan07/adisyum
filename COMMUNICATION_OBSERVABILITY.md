# Communication Observability

No rewrite is introduced in Phase 11.

## Dashboard scope

Communication observability tracks active calls, AI call health, PBX health, SIP reconnects, call latency, transcription latency, AI conversion metrics, reservation conversion, and failed call recovery.

## Operational rules

Every call lifecycle transition must be tenant-scoped and auditable.

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Voice recovery must be bounded and must not mutate business data.

AI sales operations may recommend actions but must not make unreviewed commitments.

Voice usage metering must be idempotent and tenant-scoped.

## Metering

Voice minutes, transcription minutes, AI response tokens, realtime websocket throughput, concurrent calls, and PBX bridge usage require tenant-scoped idempotency keys before billing or quota enforcement.
