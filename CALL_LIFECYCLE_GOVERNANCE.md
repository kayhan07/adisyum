# Call Lifecycle Governance

No rewrite is introduced in Phase 11.

## Lifecycle states

The governed call states are incoming, outgoing, routing, AI takeover, human takeover, transferring, reconnecting, retrying, completed, and failed.

Every call lifecycle transition must be tenant-scoped and auditable.

## Ownership

Voice runtime owns incoming, outgoing, reconnecting, retrying, and human takeover execution. PBX governance owns routing and transfer execution. AI sales operations owns AI takeover. Communication observability owns terminal call health.

## Safety rules

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Voice recovery must be bounded and must not mutate business data.

AI sales operations may recommend actions but must not make unreviewed commitments.

Voice usage metering must be idempotent and tenant-scoped.
