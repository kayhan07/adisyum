# Credit And Usage Ledger Topology

No rewrite is introduced in Phase 10.

## Ledgers

Canonical ledgers are credit balance, credit consumption, runtime consumption, AI consumption, and worker consumption.

## Idempotency

Every billing event must be tenant-scoped and idempotent.

Ledger events require idempotency keys based on tenant, period, source event, runtime scope, mutation id, AI operation id, or queue job id.

## Protection

Credit deduction must be deterministic and negative-balance protected.

Duplicate billing protection is mandatory for every credit and consumption ledger.

Stale replay protection must compare usage period and source event id against the ledger watermark.
