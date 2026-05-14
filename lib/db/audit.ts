import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

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
  ip?: string | null;
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
      ip: input.ip ?? null,
      metadata: input.metadata === undefined || input.metadata === null
        ? {}
        : JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue,
    },
  });
}
