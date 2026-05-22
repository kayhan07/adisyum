# Transcription And AI Pipeline

No rewrite is introduced in Phase 11.

## Pipeline ownership

Speech sessions, transcription sessions, AI response sessions, realtime audio streams, speech interruption, latency, and fallback governance are owned by the voice governance boundary.

## Contract

Every transcription and AI response stream must match the active tenant, call id, and call revision. Orphan transcription sessions are rejected after a bounded idle window.

Every call lifecycle transition must be tenant-scoped and auditable.

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Voice recovery must be bounded and must not mutate business data.

AI sales operations may recommend actions but must not make unreviewed commitments.

Voice usage metering must be idempotent and tenant-scoped.
