# Adisyum Domain Boundaries

## Purpose

Adisyum is a single-domain enterprise restaurant POS/ERP SaaS platform. This document restores the canonical bounded context after the accidental OtelVoice communication governance expansion.

This is not a rewrite. This is bounded context recovery.

## Allowed Domains

Adisyum may contain these domains:

- POS runtime
- table runtime
- order runtime
- kitchen and bar runtime
- stock runtime
- recipe runtime
- payment runtime
- branch runtime
- tenant SaaS runtime
- reseller SaaS runtime
- SaaS monetization and billing governance
- observability
- deployment governance
- AI operations core
- runtime governance

## Shared Governance To Preserve

These platform concerns remain part of Adisyum:

- tenant governance
- runtime session governance
- deployment authority validation
- route and runtime audits
- SaaS monetization governance
- reseller governance
- AI operations core for platform health
- operational observability
- self-healing boundaries that do not mutate business data

## Forbidden Domains

Adisyum must not own or expose these domains:

- PBX governance
- voice runtime
- SIP governance
- transcription runtime
- call lifecycle ownership
- realtime audio governance
- communication AI runtime
- communication observability
- voice recovery governance
- voice usage metering
- call session ownership

## Recovery Actions Completed

- Removed the communication runtime governance boundary from Adisyum.
- Removed voice governance exposure from system-admin observability.
- Removed Phase 11 voice validation from the canonical validation chain.
- Removed voice/PBX usage metering from SaaS monetization.
- Added `npm run adisyum:domain-audit` to prevent future domain contamination.

## Validation Rule

`npm run adisyum:domain-audit` is the canonical domain purity gate. It must fail if OtelVoice-only ownership, PBX ownership, voice governance, realtime audio governance, transcription ownership, call lifecycle ownership, voice telemetry, or communication observability re-enters the Adisyum bounded context.
