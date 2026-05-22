# Voice Session Recovery

No rewrite is introduced in Phase 11.

## Recovery ownership

Dropped calls, websocket reconnect storms, PBX reconnect loops, stale voice sessions, orphan transcription sessions, and failed AI response streams are governed by bounded recovery rules in `lib/communication/voice-governance.ts`.

Voice recovery must be bounded and must not mutate business data.

## Guardrails

Recovery may close stale streams, throttle reconnects, invalidate orphan transcription streams, and recommend human handoff. Recovery must never rotate PBX credentials automatically, delete call audit trails, attach transcripts to another tenant, or create duplicate billable calls.

Every call lifecycle transition must be tenant-scoped and auditable.

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

AI sales operations may recommend actions but must not make unreviewed commitments.

Voice usage metering must be idempotent and tenant-scoped.
