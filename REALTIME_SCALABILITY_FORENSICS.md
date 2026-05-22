# Realtime Scalability Forensics

No rewrite is introduced in Phase 8.

## Realtime owners

The runtime sync engine owns authoritative sync, websocket lifecycle coordination, stale payload rejection, and in-flight reconciliation suppression.

The runtime event bus owns event fanout, bounded listener count, duplicate event suppression, and lifecycle diagnostics.

Tenant realtime events must remain tenant-prefixed and must not broadcast cross-tenant state.

## Scale protections

Every realtime subscription must scale deterministically.

One runtime scope may have only one in-flight reconciliation cycle.

Duplicate websocket payloads must be rejected or suppressed before they reach UI rendering.

Optimistic mutations must remain protected during reconnect storms.

## Forensic counters

Track active subscriptions, reconnect count, stale payload rejection count, in-flight suppression count, listener count, event emission count, and duplicate suppression count.

## Failure rule

If realtime scale introduces websocket instability or reconciliation instability, stop and isolate the ownership conflict before changing UI behavior.
