# Client Runtime Recovery

No rewrite is introduced in Phase 7.

## Centralized telemetry ownership

Client runtime telemetry is represented by deterministic diagnostics owners, not by UI-owned recovery code.

## Recovery owners

The runtime event bus owns lifecycle event diagnostics and duplicate suppression.

The runtime persistence engine owns snapshot writes, stale snapshot rejection, redundant write suppression, cross-tab safety, and replay preparation.

The runtime sync engine owns authoritative sync, stale payload rejection, websocket lifecycle coordination, and hydration reentry protection.

The order mutations runtime owns mutation ids, optimistic line creation, commit, rollback, and unresolved queue detection.

## Recovery scenarios

Stale snapshot invalidation must happen through the persistence engine.

Corrupted persistence cleanup must happen through the persistence engine.

Runtime desync recovery must happen through the sync engine.

Optimistic queue cleanup must happen through the mutation runtime.

Hydration recovery must happen through the sync engine.

## Hard rules

Every runtime failure must become observable.

Every runtime crash must become recoverable.

UI must never become a recovery owner. UI renders the recovered runtime state.

Telemetry must detect render storms, hydration storms, websocket reconnect storms, stale snapshot floods, persistence floods, runtime memory growth, and event bus flooding.
