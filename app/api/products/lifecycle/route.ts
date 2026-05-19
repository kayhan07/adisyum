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

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = (await request.json().catch(() => null)) as { productId?: string; action?: string; force?: boolean } | null;
    const action = readAction(body?.action);
    if (!body?.productId || !action) {
      return NextResponse.json({ ok: false, error: 'productId and valid lifecycle action are required.' }, { status: 400 });
    }

    const product = await prisma.product.findFirst({ where: { tenantId: tenant.tenantId, id: body.productId } });
    if (!product) return NextResponse.json({ ok: false, error: 'Product not found.' }, { status: 404 });

    const graph = await buildDependencyGraph(tenant.tenantId, product.id);
    const decision = analyzeProductLifecycleAction(product, action, graph);
    if (!decision.allowed && !body.force) {
      return NextResponse.json({ ok: false, decision }, { status: 409 });
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

      const updated = await tx.product.update({
        where: { id: product.id },
        data: lifecyclePatch(action, product.revision),
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
          after: JSON.parse(JSON.stringify(audit.after)) as Prisma.InputJsonValue,
          metadata: JSON.parse(JSON.stringify(audit.metadata)) as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    await publishTenantEvent(tenant.tenantId, 'products', {
      type: 'product.lifecycle.changed',
      productId: next.id,
      posKey: next.posKey,
      action,
      lifecycleStatus: next.lifecycleStatus,
      publishStatus: next.publishStatus,
      revision: next.revision,
      catalogInvalidationRequired: true,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, product: next, decision });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
