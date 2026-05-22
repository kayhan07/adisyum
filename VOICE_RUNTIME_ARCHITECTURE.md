# Voice Runtime Architecture

No rewrite is introduced in Phase 11.

## Purpose

Phase 11 adds deterministic realtime communication ownership for Adisyum/OtelVoice while preserving runtime topology, tenant isolation, AI operations, and monetization governance.

## Canonical owner

`lib/communication/voice-governance.ts` is the canonical voice runtime governance boundary. It owns call lifecycle contracts, PBX ownership, voice sessions, realtime audio diagnostics, recovery rules, tenant communication scope, and voice usage metering contracts.

## Hard rules

Every call lifecycle transition must be tenant-scoped and auditable.

PBX ownership must define runtime, reconnect, auth, retry, and observability owners.

Voice recovery must be bounded and must not mutate business data.

AI sales operations may recommend actions but must not make unreviewed commitments.

Voice usage metering must be idempotent and tenant-scoped.

## Scope

This phase does not add destructive database migrations or replace PBX providers. It establishes canonical communication ownership before physical persistence or provider-specific workers are expanded.
