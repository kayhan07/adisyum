import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { getSessionFromRequest, forbiddenResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError, logInfo } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';
import { filterSellableProducts } from '@/lib/product-domain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM_ADMIN_TENANT_ID = '__system_admin__';
const SALE_PRODUCTS_RUNTIME_KEY = 'adisyon-sale-products';
const SNAPSHOT_META_KEY = '__adisyumRuntimeSnapshotMeta';
const SNAPSHOT_SCHEMA_VERSION = 1;
const VOLATILE_SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_RUNTIME_SNAPSHOT_BYTES = 512_000;
const VOLATILE_RUNTIME_KEYS = [
  'aurelia-table-payment-requested',
  'aurelia-table-live-totals',
  'aurelia-table-meta',
  'aurelia-table-state-sync-meta',
] as const;

type NormalizedSnapshot = {
  state: Record<string, string>;
  gcAction: 'none' | 'delete' | 'prune';
  gcReason?: string;
};

function snapshotMeta(tenantId: string, scope: string) {
  return JSON.stringify({
    snapshotVersion: Date.now(),
    snapshotTimestamp: new Date().toISOString(),
    snapshotTenantId: tenantId,
    snapshotScope: scope,
    snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotTtlMs: VOLATILE_SNAPSHOT_TTL_MS,
  });
}

function parseSnapshotMeta(raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const timestamp = typeof parsed.snapshotTimestamp === 'string' ? parsed.snapshotTimestamp : '';
    const timestampMs = Date.parse(timestamp);
    return {
      snapshotTenantId: typeof parsed.snapshotTenantId === 'string' ? parsed.snapshotTenantId : '',
      snapshotScope: typeof parsed.snapshotScope === 'string' ? parsed.snapshotScope : '',
      snapshotSchemaVersion: Number(parsed.snapshotSchemaVersion),
      snapshotTimestampMs: Number.isFinite(timestampMs) ? timestampMs : 0,
    };
  } catch {
    return null;
  }
}

function normalizeSnapshot(input: unknown, target: { tenantId: string; scope: string }) {
  if (!input || typeof input !== 'object') return { state: {}, gcAction: 'none' } satisfies NormalizedSnapshot;
  const state = Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
  );
  let gcAction: NormalizedSnapshot['gcAction'] = 'none';
  let gcReason: string | undefined;
  const meta = parseSnapshotMeta(state[SNAPSHOT_META_KEY]);
  if (!meta && Object.keys(state).length > 0) {
    gcAction = 'prune';
    gcReason = 'legacy_snapshot_metadata_backfill';
  }
  if (meta) {
    const schemaMismatch = meta.snapshotSchemaVersion !== SNAPSHOT_SCHEMA_VERSION;
    const tenantMismatch = meta.snapshotTenantId !== target.tenantId || meta.snapshotScope !== target.scope;
    if (schemaMismatch || tenantMismatch) {
      console.warn('[runtime-state] snapshot rejected by metadata guard', {
        tenantId: target.tenantId,
        scope: target.scope,
        schemaMismatch,
        tenantMismatch,
        meta,
      });
      return { state: {}, gcAction: 'delete', gcReason: schemaMismatch ? 'schema_mismatch' : 'tenant_mismatch' } satisfies NormalizedSnapshot;
    }

    if (Date.now() - meta.snapshotTimestampMs > VOLATILE_SNAPSHOT_TTL_MS) {
      for (const key of VOLATILE_RUNTIME_KEYS) {
        delete state[key];
      }
      console.warn('[runtime-state] expired volatile snapshot keys discarded', {
        tenantId: target.tenantId,
        scope: target.scope,
        expiredKeys: VOLATILE_RUNTIME_KEYS,
        meta,
      });
      gcAction = 'prune';
      gcReason = 'expired_volatile_keys';
    }
  }

  const snapshotBytes = JSON.stringify(state).length;
  if (snapshotBytes > MAX_RUNTIME_SNAPSHOT_BYTES) {
    for (const key of VOLATILE_RUNTIME_KEYS) {
      delete state[key];
    }
    delete state[SALE_PRODUCTS_RUNTIME_KEY];
    console.warn('[runtime-state] oversized runtime snapshot pruned', {
      tenantId: target.tenantId,
      scope: target.scope,
      snapshotBytes,
      maxRuntimeSnapshotBytes: MAX_RUNTIME_SNAPSHOT_BYTES,
      prunedKeys: [...VOLATILE_RUNTIME_KEYS, SALE_PRODUCTS_RUNTIME_KEY],
    });
    gcAction = 'prune';
    gcReason = 'oversized_snapshot';
  }

  const rawSaleProducts = state[SALE_PRODUCTS_RUNTIME_KEY];
  if (!rawSaleProducts) {
    state[SNAPSHOT_META_KEY] = snapshotMeta(target.tenantId, target.scope);
    return { state, gcAction, gcReason } satisfies NormalizedSnapshot;
  }

  try {
    const parsed = JSON.parse(rawSaleProducts);
    if (Array.isArray(parsed)) {
      const filtered = filterSellableProducts(parsed, 'runtime-state-sale-products');
      state[SALE_PRODUCTS_RUNTIME_KEY] = JSON.stringify(filtered);
    }
  } catch (error) {
    console.warn('[runtime-state] invalid sale product snapshot discarded', {
      tenantId: target.tenantId,
      scope: target.scope,
      error: error instanceof Error ? error.message : String(error),
    });
    delete state[SALE_PRODUCTS_RUNTIME_KEY];
    gcAction = 'prune';
    gcReason = 'invalid_sale_product_snapshot';
  }

  state[SNAPSHOT_META_KEY] = snapshotMeta(target.tenantId, target.scope);
  return { state, gcAction, gcReason } satisfies NormalizedSnapshot;
}

async function applyRuntimeSnapshotGc(target: { tenantId: string; key: string }, normalized: NormalizedSnapshot) {
  if (normalized.gcAction === 'none') return;
  if (normalized.gcAction === 'delete') {
    await prisma.runtimeState.delete({
      where: runtimeStateTenantKey(target.tenantId, target.key),
    }).catch((error) => {
      console.warn('[runtime-state] rejected snapshot delete skipped', {
        tenantId: target.tenantId,
        key: target.key,
        reason: normalized.gcReason,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  await prisma.runtimeState.update({
    where: runtimeStateTenantKey(target.tenantId, target.key),
    data: { payload: JSON.parse(JSON.stringify(normalized.state)) as Prisma.InputJsonValue },
  }).catch((error) => {
    console.warn('[runtime-state] snapshot prune persistence skipped', {
      tenantId: target.tenantId,
      key: target.key,
      reason: normalized.gcReason,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function resolveScope(request: Request, scope: string) {
  if (scope === 'tenant') {
    const tenant = await requireTenant(request);
    return {
      tenantId: tenant.tenantId,
      key: 'client-runtime:tenant',
    };
  }

  if (scope === 'system-admin') {
    const session = await getSessionFromRequest(request);
    if (!(await isSessionActive(session))) {
      throw new Error('forbidden');
    }
    if (!isSuperAdmin(session)) {
      throw new Error('forbidden');
    }

    return {
      tenantId: SYSTEM_ADMIN_TENANT_ID,
      key: 'client-runtime:system-admin',
    };
  }

  throw new Error('not-found');
}

export async function GET(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(target.tenantId, target.key),
      select: { payload: true },
    });
    const normalized = normalizeSnapshot(stored?.payload, { tenantId: target.tenantId, scope });
    await applyRuntimeSnapshotGc(target, normalized);

    const response = NextResponse.json({
      ok: true,
      state: normalized.state,
    });

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'GET',
    });
    logInfo({ service: 'api.runtime.state', message: 'Runtime snapshot loaded', tenantId, route: '/api/runtime/state/[scope]' });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state load failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'GET',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
    const incoming = normalizeSnapshot(body?.state, { tenantId: target.tenantId, scope });
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(target.tenantId, target.key),
      select: { payload: true },
    });
    const existing = normalizeSnapshot(stored?.payload, { tenantId: target.tenantId, scope });
    const normalized = normalizeSnapshot(
      {
        ...existing.state,
        ...incoming.state,
      },
      { tenantId: target.tenantId, scope },
    );
    if (normalized.gcAction === 'delete') {
      await prisma.runtimeState.delete({
        where: runtimeStateTenantKey(target.tenantId, target.key),
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, state: {} });
    }
    const state = normalized.state;

    await prisma.runtimeState.upsert({
      where: runtimeStateTenantKey(target.tenantId, target.key),
      update: { payload: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue },
      create: { tenantId: target.tenantId, key: target.key, payload: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue },
    });

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'POST',
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state save failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'POST',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    await prisma.runtimeState.delete({
      where: runtimeStateTenantKey(target.tenantId, target.key),
    }).catch((deleteError) => {
      console.warn('[runtime-state] delete skipped or failed', {
        timestamp: new Date().toISOString(),
        tenantId: target.tenantId,
        key: target.key,
        scope,
        error: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    });

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'DELETE',
    });
    return NextResponse.json({ ok: true, state: {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state delete failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'DELETE',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}
