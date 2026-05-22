# WebSocket Recovery Forensics

No rewrite is introduced in Phase 7.

## Ownership

Runtime websocket recovery belongs to the runtime sync engine and self-healing engine. UI components must not process websocket recovery decisions.

## Signals

The platform must track:

- websocket reconnect count
- duplicate subscription count
- stale websocket payload rejection
- overlapping hydration suppression
- authoritative sync pressure
- optimistic mutation protection events

## Recovery rules

Every runtime failure must become observable.

Every websocket reconnect must be bounded.

Reconnect storms must be surfaced through enterprise telemetry and self-healing statistics before changing runtime ownership.

Stale websocket payloads must never overwrite active optimistic mutations.

## Escalation

If websocket reconnect attempts repeatedly fail, the self-healing engine escalates the tenant/runtime context. The sync engine remains the owner of payload acceptance or rejection.

Centralized telemetry ownership keeps websocket diagnostics from becoming another runtime authority.
