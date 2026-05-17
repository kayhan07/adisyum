import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { invalidateTenantCache } from '@/lib/db/cache';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import type { TenantContext } from '@/lib/tenant';
import { OrderRepository, PaymentRepository, StockRepository } from '@/lib/db/repositories';
import { recordOperationalEvent } from '@/lib/operations/live-ops';

const orderLineSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(180),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
  notes: z.string().max(1000).nullable().optional(),
});

export const createOrderSchema = z.object({
  orderNo: z.string().trim().min(1).max(80),
  tableId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  taxTotal: z.number().nonnegative().optional(),
  total: z.number().nonnegative(),
  items: z.array(orderLineSchema).min(1),
});

export class OrderService {
  async createOrder(tenant: TenantContext, input: z.input<typeof createOrderSchema>) {
    const parsed = createOrderSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const order = await new OrderRepository(tx).create(tenant, parsed);
      if (parsed.tableId) {
        await tx.posTable.update({
          where: { id: parsed.tableId, tenantId: tenant.tenantId },
          data: { status: 'occupied' },
        });
      }
      await writeAuditLog({
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        action: 'order_create',
        entity: 'order',
        entityId: order.id,
        metadata: { orderNo: order.orderNo, total: String(order.total) },
        db: tx,
      });
      await invalidateTenantCache(tenant.tenantId, ['orders', 'tables', 'reports']);
      await publishTenantEvent(tenant.tenantId, 'orders', { type: 'order.created', orderId: order.id });
      return order;
    });
  }

  async cancelOrder(tenant: TenantContext, orderId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await new OrderRepository(tx).updateStatus(tenant, orderId, 'cancelled');
      await writeAuditLog({ tenantId: tenant.tenantId, userId: tenant.userId, action: 'order_cancel', entity: 'order', entityId: order.id, db: tx });
      await invalidateTenantCache(tenant.tenantId, ['orders', 'reports']);
      await publishTenantEvent(tenant.tenantId, 'orders', { type: 'order.cancelled', orderId: order.id });
      return order;
    });
  }
}

export class PaymentService {
  async takePayment(tenant: TenantContext, input: { orderId: string; amount: number; method: string; closeOrder?: boolean }) {
    return prisma.$transaction(async (tx) => {
      const payment = await new PaymentRepository(tx).create(tenant, {
        orderId: input.orderId,
        amount: input.amount,
        method: input.method,
        status: 'paid',
      });
      if (input.closeOrder) {
        await new OrderRepository(tx).updateStatus(tenant, input.orderId, 'paid');
      }
      await writeAuditLog({ tenantId: tenant.tenantId, userId: tenant.userId, action: 'payment_create', entity: 'payment', entityId: payment.id, db: tx });
      await invalidateTenantCache(tenant.tenantId, ['orders', 'payments', 'reports']);
      await publishTenantEvent(tenant.tenantId, 'payments', { type: 'payment.created', paymentId: payment.id, orderId: input.orderId });
      await recordOperationalEvent({
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        userId: tenant.userId,
        type: 'payment.completed',
        message: `Odeme tamamlandi: ${input.amount}`,
        entity: 'payment',
        entityId: payment.id,
        source: 'payment.service',
        metadata: { orderId: input.orderId, amount: input.amount, method: input.method, closeOrder: Boolean(input.closeOrder) },
      });
      return payment;
    });
  }

  async refundPayment(tenant: TenantContext, paymentId: string, metadata: Prisma.InputJsonValue = {}) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId, tenantId: tenant.tenantId },
        data: { status: 'refunded', metadata },
      });
      await writeAuditLog({ tenantId: tenant.tenantId, userId: tenant.userId, action: 'payment_refund', entity: 'payment', entityId: payment.id, db: tx });
      await invalidateTenantCache(tenant.tenantId, ['payments', 'reports']);
      await publishTenantEvent(tenant.tenantId, 'payments', { type: 'payment.refunded', paymentId: payment.id });
      return payment;
    });
  }
}

export class StockService {
  async adjustStock(tenant: TenantContext, input: { stockItemId: string; warehouseId?: string | null; quantity: number; type: string; reason?: string | null }) {
    return prisma.$transaction(async (tx) => {
      const result = await new StockRepository(tx).adjust(tenant, input);
      await writeAuditLog({ tenantId: tenant.tenantId, userId: tenant.userId, action: 'stock_edit', entity: 'stock_item', entityId: input.stockItemId, metadata: input, db: tx });
      await invalidateTenantCache(tenant.tenantId, ['stock', 'reports']);
      await publishTenantEvent(tenant.tenantId, 'stock', { type: 'stock.adjusted', stockItemId: input.stockItemId });
      return result;
    });
  }
}

export class ReportService {
  async dailySales(tenant: TenantContext, date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [orders, payments] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId: tenant.tenantId, createdAt: { gte: start, lt: end } },
        select: { id: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.payment.findMany({
        where: { tenantId: tenant.tenantId, createdAt: { gte: start, lt: end }, status: 'paid' },
        select: { id: true, method: true, amount: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    return { date: start.toISOString().slice(0, 10), orders, payments };
  }
}
