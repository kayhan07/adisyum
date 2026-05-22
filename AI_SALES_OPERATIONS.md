# AI Sales Operations

No rewrite is introduced in Phase 11.

## Canonical AI sales scope

AI sales operations measure sales intent, hesitation, reservation conversion, objections, sentiment, call success, and recommendation quality.

## Action boundary

AI sales operations may recommend actions but must not make unreviewed commitments.

AI may detect low conversion branches, weak sales flows, excessive objections, abnormal cancellation patterns, low reservation closure rates, hesitation-heavy conversations, and speech latency impact.

## Runtime safety

Every call lifecycle transition must be tenant-scoped and auditable.

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Voice recovery must be bounded and must not mutate business data.

Voice usage metering must be idempotent and tenant-scoped.
