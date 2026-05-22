# AI Operations Architecture

No rewrite is introduced in Phase 9.

## Purpose

Phase 9 adds AI-assisted operational intelligence without changing canonical runtime topology, tenant isolation, deployment governance, or deterministic runtime ownership.

## Centralized AI governance

`lib/ai-operations/governance.ts` is the canonical AI operations boundary. It observes existing telemetry, anomaly detection, scale-readiness contracts, and self-healing events.

AI must remain bounded, observable, auditable, and deterministic.

AI operations may recommend action. It may not become a second runtime owner.

## Observed domains

- runtime health
- deployment health
- tenant health
- database health
- websocket health
- reconciliation health
- persistence health
- queue health
- memory health

## Automation boundary

Safe auto-recovery is limited to runtime cleanup and bounded orchestration.

AI MUST NEVER mutate production business data.

AI MUST NEVER deploy automatically.
