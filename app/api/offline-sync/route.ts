import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

type OfflineQueueOperation = {
  id?: string;
  operationType?: string;
  payload?: unknown;
  deviceId?: string | null;
};

function normalizeOperation(operation: OfflineQueueOperation, index: number, tenantId: string) {
  const eventId = typeof operation.id === 'string' && operation.id.trim().length > 0
    ? operation.id.trim()
    : `${tenantId}-offline-${Date.now()}-${index}`;

  return {
    eventId,
    eventType: typeof operation.operationType === 'string' && operation.operationType.trim().length > 0
      ? operation.operationType.trim()
      : 'offline_operation',
    payload: JSON.parse(JSON.stringify(operation.payload ?? operation)) as JsonRecord,
    deviceId: typeof operation.deviceId === 'string' && operation.deviceId.trim().length > 0
      ? operation.deviceId.trim()
      : null,
  };
}

export async function POST(request: Request) {
  let tenantId = '';
  let userId = '';

  try {
    const tenant = await requireTenant(request);
    tenantId = tenant.tenantId;
    userId = tenant.userId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const operations = Array.isArray(body?.operations)
    ? body.operations as OfflineQueueOperation[]
    : Array.isArray(body?.orders)
      ? body.orders as OfflineQueueOperation[]
      : [];

  const normalized = operations.map((operation, index) => normalizeOperation(operation, index, tenantId));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (normalized.length > 0) {
      await tx.offlineEvent.createMany({
        data: normalized.map((operation) => ({
          tenantId,
          deviceId: operation.deviceId,
          eventId: operation.eventId,
          eventType: operation.eventType,
          payload: operation.payload,
          status: 'pending',
        })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog({
      tenantId,
      userId,
      action: 'offline_sync',
      entity: 'offline_event',
      metadata: {
        accepted: normalized.length,
        eventTypes: normalized.map((operation) => operation.eventType),
      },
      db: tx,
    });
  });

  const total = await prisma.offlineEvent.count({ where: { tenantId } });

  return NextResponse.json({
    success: true,
    accepted: normalized.length,
    acceptedIds: normalized.map((operation) => operation.eventId),
    total,
  });
}