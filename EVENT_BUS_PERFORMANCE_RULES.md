# Event Bus Performance Rules

No rewrite is introduced in Phase 6.

## Rules

- Every runtime event must be bounded.
- Duplicate events must be suppressed.
- Event listeners must be removable.
- Event payloads must have a soft byte limit.
- Render phase must remain pure.

## Current Limits

- `MAX_RUNTIME_LISTENERS`
- `MAX_RUNTIME_EVENT_PAYLOAD_BYTES`
- duplicate event suppression within short time windows
- listener count exposed by `getRuntimeEventBusDiagnostics`

## Ownership

Only runtime-owned modules may emit runtime lifecycle events:

- runtime event bus
- runtime persistence engine
- runtime session engine
- device session registry

UI diagnostics may log, but must not become runtime event authority.

