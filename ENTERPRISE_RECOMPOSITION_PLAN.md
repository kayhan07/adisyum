# Enterprise Recomposition Plan

Status: canonical stabilization plan, not a feature roadmap.

## Objective

Adisyum must keep the working SaaS, POS, ERP, tenant, device, and runtime business logic while removing historical runtime drift. This recomposition does not rewrite the product. It establishes one canonical ownership model for infrastructure, API access, runtime engines, tenant data, and deployment verification.

## Canonical Platform Identity

| Surface | Canonical owner | Notes |
| --- | --- | --- |
| `https://adisyum.com` | `adisyum-website`, port `3010` | Marketing and public website only. |
| `https://adisyum.com/app` | `adisyum-root-app`, port `3000` | Main SaaS/POS/ERP application runtime. |
| `https://adisyum.com/system-admin` | `adisyum-root-app`, port `3000` | System admin inside the same app runtime. |
| `https://adisyum.com/api/*` | `adisyum-root-app`, port `3000` | Only API namespace owner. |
| `https://adisyum.com/adisyonsistemi` | Redirect | Must permanently redirect to `/app`; no runtime ownership. |

## Non-Negotiable Rules

- No greenfield rewrite.
- No POS or ERP redesign during recomposition.
- No duplicate runtime owner for `/app`, `/system-admin`, `/api`, or `/adisyonsistemi`.
- No API URL may be built from `window.location.pathname`, route aliases, or legacy path prefixes.
- No database cleanup may delete or rewrite tenant business data without a reversible migration and tenant-scoped verification.
- Every phase must pass the validation gate before the next phase starts.

## Phase Strategy

### Phase 1: Infrastructure Consolidation

Goal: make production topology deterministic.

Actions:
- Enforce `adisyum-root-app` as the only owner of port `3000`.
- Enforce `adisyum-website` as the only owner of port `3010`.
- Keep `adisyum-worker` as the only worker process.
- Remove stale PM2 apps and orphan Node processes from deploy flow.
- Enforce Nginx `/api`, `/app`, and `/system-admin` to port `3000`.
- Enforce Nginx `/` to port `3010`.
- Enforce `/adisyonsistemi` as `308 /app`.
- Verify live runtime with `/api/runtime-build-id`.

Exit criteria:
- `pm2 jlist` contains exactly `adisyum-root-app`, `adisyum-website`, `adisyum-worker`.
- `curl -i -X POST https://adisyum.com/api/pos/table-orders` returns `401 missing_session` without login, never `404`.
- `curl -I https://adisyum.com/adisyonsistemi` returns redirect to `/app`.
- Runtime build id reports the deployed commit.

### Phase 2: Runtime Ownership Consolidation

Goal: preserve extracted runtime engines and remove duplicate authority.

Canonical runtime owners:
- `lib/runtime/table-state-engine.ts`: table state reconciliation.
- `lib/pos-runtime/order-mutations.ts`: POS mutation creation, optimistic line creation, mutation dispatch.
- `lib/pos-runtime/runtime-sync-engine.ts`: authoritative sync and stale payload protection.
- `lib/pos-runtime/runtime-persistence-engine.ts`: persistence snapshots and cross-tab preparation.
- `lib/pos-runtime/runtime-event-bus.ts`: runtime lifecycle events.
- `lib/runtime/runtime-session-engine.ts`: authenticated runtime context.
- `lib/runtime/tenant-runtime-context.ts`: tenant and branch runtime scope.
- `lib/device-runtime/device-session-registry.ts`: device and bridge identity.

Exit criteria:
- UI renders runtime state and emits intent only.
- No UI component owns reconciliation, mutation id generation, or runtime persistence writes.
- Runtime diagnostics identify mutation, sync, persistence, and session ownership.

### Phase 3: API Ownership Consolidation

Goal: one API builder and no legacy URL leakage.

Canonical owner:
- `lib/runtime/runtime-api.ts`

Rules:
- Product insertion must use `POS_TABLE_ORDERS_API`.
- API URLs must be root-relative `/api/...`.
- `/app/api/...` and `/adisyonsistemi/api/...` are invalid.
- Fetches must carry `credentials: "include"` unless explicitly unauthenticated.

Exit criteria:
- POS table order calls use `runtimeFetch(POS_TABLE_ORDERS_API)`.
- Network tab shows `https://adisyum.com/api/pos/table-orders`.
- Browser and curl both hit the same route handler.

### Phase 4: Tenant/Data Integrity Cleanup

Goal: map ownership before migrations.

Actions:
- Audit every table with `tenantId`, `branchId`, `deviceId`, product identity, order identity, and runtime snapshot fields.
- Identify demo defaults and local-only stores that can influence production tenant data.
- Create reversible migrations only after ownership map is approved.
- Add tenant isolation smoke tests before mutation cleanup.

Exit criteria:
- No cross-tenant queries without explicit system-admin scope.
- Product, category, order, device, and printer records have clear tenant and branch rules.
- Historical order item snapshots remain immutable.

### Phase 5: Legacy Removal

Goal: remove historical runtime entry points after redirect proves stable.

Actions:
- Keep `/adisyonsistemi` redirect during the transition window.
- Remove old docs/scripts that instruct operators to use `/adisyonsistemi` as a runtime.
- Remove demo-only login assumptions from production path only after `/app` login/session flow is verified.
- Remove stale nginx split-domain references.

Exit criteria:
- No active runtime ownership remains for `/adisyonsistemi`.
- No PM2, Nginx, or client route builds API calls under the legacy path.

### Phase 6: Performance Stabilization

Goal: reduce loops, duplicate listeners, and unnecessary runtime events.

Actions:
- Audit effects that emit runtime events and write persistence.
- Audit websocket/focus/interval sync for duplicate subscription ownership.
- Suppress redundant persistence writes only at the runtime persistence owner.
- Keep UI as a render-only layer.

Exit criteria:
- No render loops or white-screen stalls under POS.
- Hydration, sync, event, persistence, and reconciliation counters remain bounded.

### Phase 7: Enterprise Hardening

Goal: make future feature work safe.

Actions:
- Extend deploy verification for PM2, Nginx, route manifests, live build id, and public API behavior.
- Add tenant isolation validation to CI/deploy gates.
- Maintain these architecture maps as source-of-truth documents.

Exit criteria:
- Deploy fails on runtime drift.
- Route audit fails on legacy ownership drift.
- Runtime audit fails on invalid standalone/PM2/Nginx topology.

## Mandatory Validation Gate

Run after every phase:

```bash
npm run build
npx tsc --noEmit
npm run routes:audit
npm run runtime:audit-production
DEPLOY_VERIFY_LIVE=1 npm run deploy:verify-runtime
```

On the VPS, also verify:

```bash
pm2 list
ss -lntp | grep -E ':3000|:3010'
sudo nginx -t
curl -i -X POST https://adisyum.com/api/pos/table-orders
curl -I https://adisyum.com/adisyonsistemi
curl https://adisyum.com/api/runtime-build-id
```

