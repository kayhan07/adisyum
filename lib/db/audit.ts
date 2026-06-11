import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

type JsonRecord = Record<string, unknown>;
type JsonValueLike = string | number | boolean | null | JsonRecord | JsonValueLike[];

export type AuditAction =
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'order_create'
  | 'product_delete'
  | 'order_cancel'
  | 'payment_create'
  | 'payment_void'
  | 'payment_refund'
  | 'stock_edit'
  | 'printer_config_change'
  | 'offline_sync'
  | 'system_admin_action';

export async function writeAuditLog(input: {
  tenantId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  actorId?: string | null;
  sessionId?: string | null;
  branchId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  mutationId?: string | null;
  orchestrationJobId?: string | null;
  queueJobId?: string | null;
  deviceId?: string | null;
  route?: string | null;
  source?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  db?: Prisma.TransactionClient;
}) {
  const db = input.db ?? prisma;
  return db.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      sessionId: input.sessionId ?? null,
      branchId: input.branchId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      correlationId: input.correlationId ?? input.requestId ?? null,
      mutationId: input.mutationId ?? null,
      orchestrationJobId: input.orchestrationJobId ?? null,
      queueJobId: input.queueJobId ?? null,
      deviceId: input.deviceId ?? null,
      route: input.route ?? null,
      source: input.source ?? 'runtime',
      before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)) as JsonValueLike,
      after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)) as JsonValueLike,
      metadata: input.metadata === undefined || input.metadata === null
        ? {}
        : JSON.parse(JSON.stringify(input.metadata)) as JsonValueLike,
    },
  });
}
