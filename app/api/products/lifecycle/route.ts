import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import {
  analyzeProductLifecycleAction,
  buildLifecycleAuditEvent,
  createProductRevisionSnapshot,
  type ProductLifecycleAction,
} from '@/lib/product-lifecycle-governance';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { invalidateRuntimePosCatalog } from '@/lib/server/runtime-pos-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readAction(value: unknown): ProductLifecycleAction | null {
  if (value === 'publish' || value === 'archive' || value === 'deprecate' || value === 'delete' || value === 'rollback' || value === 'activate') {
    return value;
  }
  return null;
}

async function buildDependencyGraph(tenantId: string, productId: string) {
  const [activeOrderCount, recipeReferenceCount, offlineQueueCount, cachedRuntimeReferenceCount] = await Promise.all([
    prisma.orderItem.count({
      where: {
        tenantId,
        productId,
        orderId: {
          in: (await prisma.order.findMany({
            where: { tenantId, status: { in: ['open', 'preparing', 'ready', 'served'] } },
            select: { id: true },
            take: 5000,
          })).map((order) => order.id),
        },
      },
    }),
    prisma.recipe.count({ where: { tenantId, productId } }),
    prisma.offlineEvent.count({
      where: {
        tenantId,
        status: 'pending',
        payload: { path: ['productId'], equals: productId },
      },
    }).catch(() => 0),
    prisma.runtimeState.count({
      where: {
        tenantId,
        key: { startsWith: 'runtime:pos-catalog' },
      },
    }).catch(() => 0),
  ]);

  return {
    activeOrderCount,
    openTicketCount: 0,
    pendingKitchenCount: 0,
    offlineQueueCount,
    websocketSessionCount: 0,
    modifierDependencyCount: 0,
    comboDependencyCount: 0,
    recipeReferenceCount,
    branchReferenceCount: 0,
    cachedRuntimeReferenceCount,
    marketplaceReferenceCount: 0,
  };
}

function lifecyclePatch(action: ProductLifecycleAction, revision: number) {
  const now = new Date();
  if (action === 'publish') return { lifecycleStatus: 'published', publishStatus: 'published', active: true, publishedAt: now, revision: revision + 1 };
  if (action === 'archive') return { lifecycleStatus: 'archived', active: false, archivedAt: now, revision: revision + 1 };
  if (action === 'deprecate') return { lifecycleStatus: 'deprecated', deprecatedAt: now, revision: revision + 1 };
  if (action === 'delete') return { lifecycleStatus: 'deleted', active: false, deletedAt: now, revision: revision + 1 };
  if (action === 'rollback') return { publishStatus: 'rolled_back', revision: revision + 1 };
  if (action === 'activate') return { lifecycleStatus: 'active', publishStatus: 'staged', active: true, revision: revision + 1 };
  return {};
}

function snapshotPatch(snapshot: Prisma.JsonValue | null | undefined, revision: number) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const source = snapshot as Record<string, unknown>;
  return {
    name: typeof source.name === 'string' ? source.name : undefined,
    price: source.price === null || source.price === undefined ? undefined : new Prisma.Decimal(String(source.price)),
    vatRate: typeof source.vatRate === 'number' ? source.vatRate : undefined,
    categoryId: typeof source.categoryId === 'string' ? source.categoryId : undefined,
    lifecycleStatus: typeof source.lifecycleStatus === 'string' ? source.lifecycleStatus : undefined,
    publishStatus: 'rolled_back',
    revision: revision + 1,
    metadata: source.metadata && typeof source.metadata === 'object'
      ? JSON.parse(JSON.stringify(source.metadata)) as Prisma.InputJsonValue
      : undefined,
  };
}

async function applyLifecycleAction(
  tenant: Awaited<ReturnType<typeof requireTenant>>,
  productId: string,
  action: ProductLifecycleAction,
  force = false,
) {
  const product = await prisma.product.findFirst({ where: { tenantId: tenant.tenantId, id: productId } });
  if (!product) return { ok: false as const, status: 404, error: 'Product not found.', productId };

  const graph = await buildDependencyGraph(tenant.tenantId, product.id);
  const decision = analyzeProductLifecycleAction(product, action, graph);
  if (!decision.allowed && !force) {
    return { ok: false as const, status: 409, productId, decision };
  }

  const snapshot = createProductRevisionSnapshot(product);
  const next = await prisma.$transaction(async (tx) => {
    await tx.productRevision.upsert({
      where: {
        tenantId_productId_revision: {
          tenantId: tenant.tenantId,
          productId: product.id,
          revision: snapshot.revision,
        },
      },
      update: { snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue },
      create: {
        tenantId: tenant.tenantId,
        productId: product.id,
        productPosKey: product.posKey,
        revision: snapshot.revision,
        lifecycleStatus: snapshot.lifecycleStatus,
        publishStatus: snapshot.publishStatus,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        createdBy: tenant.userId,
      },
    });

    let rollbackPatch: ReturnType<typeof snapshotPatch> = null;
    if (action === 'rollback') {
      const previous = await tx.productRevision.findFirst({
        where: { tenantId: tenant.tenantId, productId: product.id, revision: { lt: product.revision } },
        orderBy: { revision: 'desc' },
      });
      rollbackPatch = snapshotPatch(previous?.snapshot, product.revision);
      if (!rollbackPatch) {
        throw new Error('rollback_snapshot_missing');
      }
    }

    const updated = await tx.product.update({
      where: { id: product.id },
      data: rollbackPatch ?? lifecyclePatch(action, product.revision),
    });

    const audit = buildLifecycleAuditEvent(product, decision, tenant.userId);
    await tx.auditLog.create({
      data: {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        userId: tenant.userId,
        actorId: tenant.userId,
        action: audit.action,
        entity: audit.entity,
        entityId: audit.entityId,
        source: 'product-lifecycle',
        before: JSON.parse(JSON.stringify(audit.before)) as Prisma.InputJsonValue,
        after: JSON.parse(JSON.stringify({ ...audit.after, rollbackPatch: Boolean(rollbackPatch) })) as Prisma.InputJsonValue,
        metadata: JSON.parse(JSON.stringify(audit.metadata)) as Prisma.InputJsonValue,
      },
    });

    await tx.operationalEvent.create({
      data: {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        userId: tenant.userId,
        type: 'product.lifecycle',
        severity: decision.severity === 'blocked' ? 'critical' : decision.severity === 'warning' ? 'warning' : 'info',
        message: `${product.name} için ${action} lifecycle işlemi uygulandı.`,
        entity: 'product',
        entityId: product.id,
        source: 'product-lifecycle',
        metadata: JSON.parse(JSON.stringify({
          action,
          posKey: product.posKey,
          decision,
          catalogInvalidationRequired: true,
          marketplacePropagation: ['qr', 'kiosk', 'waiter_tablet', 'mobile_pos', 'yemeksepeti', 'trendyol', 'getir'],
        })) as Prisma.InputJsonValue,
      },
    });

    return updated;
  });

  const invalidatedRuntimeCatalogs = await invalidateRuntimePosCatalog(tenant.tenantId, `product_lifecycle_${action}`, tenant.branchId ?? undefined);
  await publishTenantEvent(tenant.tenantId, 'products', {
    type: 'product.lifecycle.changed',
    productId: next.id,
    posKey: next.posKey,
    action,
    lifecycleStatus: next.lifecycleStatus,
    publishStatus: next.publishStatus,
    revision: next.revision,
    catalogInvalidationRequired: true,
    runtimeCacheCleared: true,
    invalidatedRuntimeCatalogs,
  }).catch(() => undefined);

  return { ok: true as const, product: next, decision };
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = (await request.json().catch(() => null)) as { productId?: string; productIds?: string[]; action?: string; force?: boolean } | null;
    const action = readAction(body?.action);
    const productIds = Array.isArray(body?.productIds) && body.productIds.length > 0
      ? [...new Set(body.productIds)]
      : body?.productId ? [body.productId] : [];
    if (productIds.length === 0 || !action) {
      return NextResponse.json({ ok: false, error: 'productId/productIds and valid lifecycle action are required.' }, { status: 400 });
    }

    const results = [];
    for (const productId of productIds) {
      results.push(await applyLifecycleAction(tenant, productId, action, Boolean(body?.force)));
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0 && productIds.length === 1) {
      return NextResponse.json(failed[0], { status: failed[0].status ?? 409 });
    }
    return NextResponse.json({ ok: failed.length === 0, action, results, failedCount: failed.length });
  } catch (error) {
    if (error instanceof Error && error.message === 'rollback_snapshot_missing') {
      return NextResponse.json({ ok: false, error: 'Rollback snapshot bulunamadı.', code: 'rollback_snapshot_missing' }, { status: 409 });
    }
    return tenantAuthErrorResponse(error);
  }
}
