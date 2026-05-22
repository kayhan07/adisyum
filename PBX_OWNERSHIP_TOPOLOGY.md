# PBX Ownership Topology

No rewrite is introduced in Phase 11.

## Canonical PBX boundary

PBX ownership is centralized in `lib/communication/voice-governance.ts`. Verimor, SIP bridge, trunk, extension, DID, tenant, and branch scopes must resolve through this boundary.

## Required ownership

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Runtime ownership belongs to PBX governance. Auth ownership belongs to runtime session governance. Tenant and branch scope belongs to tenant runtime context. Observability belongs to communication observability.

## Safety rules

Every call lifecycle transition must be tenant-scoped and auditable.

Voice recovery must be bounded and must not mutate business data.

Voice usage metering must be idempotent and tenant-scoped.

AI sales operations may recommend actions but must not make unreviewed commitments.
