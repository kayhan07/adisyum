import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { logError } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId = '';
  let userId = '';
  try {
    const tenant = await requireTenant(request);
    tenantId = tenant.tenantId;
    userId = tenant.userId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const orders: unknown[] = Array.isArray(body?.orders) ? body.orders : [];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (orders.length > 0) {
        await tx.syncQueue.createMany({
          data: orders.map((order: unknown, index: number) => ({
            tenantId,
            eventType: 'offline_order',
            payload: JSON.parse(JSON.stringify(order)) as JsonRecord,
            deviceId: typeof body?.deviceId === 'string' ? body.deviceId : null,
            status: 'pending',
            createdAt: new Date(Date.now() + index),
          })),
        });
      }
      await writeAuditLog({
        tenantId,
        userId,
        action: 'offline_sync',
        entity: 'sync_queue',
        metadata: { eventType: 'offline_order', synced: orders.length },
        db: tx,
      });
    });

    const total = await prisma.syncQueue.count({ where: { tenantId, eventType: 'offline_order' } });
    recordRequestMetric({
      tenantId,
      route: '/api/offline-sync/orders',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'POST',
    });

    return NextResponse.json({
      success: true,
      synced: orders.length,
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Offline order sync failed';
    recordTenantError({ tenantId, message, scope: 'api.offline-sync.orders', route: '/api/offline-sync/orders' });
    recordRequestMetric({
      tenantId,
      route: '/api/offline-sync/orders',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'POST',
    });
    logError({ service: 'api.offline-sync.orders', message, tenantId, route: '/api/offline-sync/orders' });
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
