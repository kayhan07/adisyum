# Runtime Snapshot Forensics

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Canonical Runtime Tables

`RuntimeState` owns persisted runtime snapshots:

- `tenantId`
- `key`
- `payload`
- unique `[tenantId, key]`
- index `[tenantId]`

`SyncQueue` owns server-side replay work:

- `tenantId`
- `deviceId`
- `eventType`
- `payload`
- `status`
- indexes `[tenantId]`, `[tenantId, status]`, `[tenantId, createdAt]`

`OfflineEvent` owns idempotent offline event replay:

- `tenantId`
- `deviceId`
- `eventId`
- `eventType`
- `payload`
- `status`
- unique `[tenantId, eventId]`

## Snapshot Rules

- Runtime snapshots are tenant-scoped.
- Snapshot keys must not be global across tenants.
- Replay events must be idempotent by tenant.
- Runtime payload shape validation belongs to runtime engines, not UI.
- Database persistence must not become a second reconciliation authority.

## Current Debt

- `RuntimeState.payload` is JSON and intentionally flexible. The runtime engine must enforce payload versioning before accepting writes.
- There is no physical branch column on `RuntimeState`; branch/table identity must be encoded in `key` or payload until a planned migration adds branch-aware runtime snapshots.
- Oversized payload risk remains a production data audit concern.

## Gate

`npm run recomposition:phase4-validate` verifies tenant/key uniqueness for runtime snapshots, tenant replay indexes, and offline event idempotency.

