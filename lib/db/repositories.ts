import { OrderStatus, PaymentStatus, Prisma, type PrismaClient } from '@prisma/client';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { isSellableProductType } from '@/lib/product-domain';
import { prisma } from '@/lib/db/prisma';
import type { TenantContext } from '@/lib/tenant';

type DbClient = PrismaClient | Prisma.TransactionClient;
type PageOptions = { take?: number; skip?: number; cursor?: string };

function take(options?: PageOptions, fallback = 100) {
  return Math.min(Math.max(options?.take ?? fallback, 1), 500);
}

function scoped<T extends object>(tenant: TenantContext, where?: T) {
  return { ...(where ?? {}), tenantId: tenant.tenantId } as T & { tenantId: string };
}

export class TableRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.posTable.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: take(options, 200),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }

  updateStatus(tenant: TenantContext, id: string, status: string, metadata?: Prisma.InputJsonValue) {
    return this.db.posTable.update({
      where: { id, tenantId: tenant.tenantId },
      data: { status, ...(metadata === undefined ? {} : { metadata }) },
    });
  }
}

export class ProductRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.product.findMany({
      where: scoped(tenant, { active: true, productType: { in: ['sale_product', 'combo_product'] } }),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        price: true,
        vatRate: true,
        unitType: true,
        productType: true,
        categoryId: true,
        updatedAt: true,
      },
    });
  }

  findById(tenant: TenantContext, id: string) {
    return this.db.product.findFirst({ where: scoped(tenant, { id, active: true }) })
      .then((product) => product && isSellableProductType(product.productType) ? product : null);
  }
}

export class CategoryRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.productCategory.findMany({
      where: scoped(tenant),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class OrderRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions & { status?: OrderStatus } = {}) {
    return this.db.order.findMany({
      where: scoped(tenant, options.status ? { status: options.status } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }

  create(
    tenant: TenantContext,
    input: {
      orderNo: string;
      tableId?: string | null;
      customerId?: string | null;
      subtotal: number;
      discount?: number;
      taxTotal?: number;
      total: number;
      items: Array<{ productId?: string | null; name: string; quantity: number; unitPrice: number; total: number; notes?: string | null }>;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return this.db.order.create({
      data: {
        tenantId: tenant.tenantId,
        orderNo: input.orderNo,
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        subtotal: input.subtotal,
        discount: input.discount ?? 0,
        taxTotal: input.taxTotal ?? 0,
        total: input.total,
        metadata: input.metadata ?? {},
      },
    }).then(async (order) => {
      if (input.items.length > 0) {
        await this.db.orderItem.createMany({
          data: input.items.map((item) => ({
            tenantId: tenant.tenantId,
            orderId: order.id,
            productId: item.productId ?? null,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            notes: item.notes ?? null,
          })),
        });
      }
      return order;
    });
  }

  updateStatus(tenant: TenantContext, id: string, status: OrderStatus) {
    return this.db.order.update({ where: { id, tenantId: tenant.tenantId }, data: { status } });
  }
}

export class PaymentRepository {
  constructor(private readonly db: DbClient = prisma) {}

  create(tenant: TenantContext, input: { orderId?: string | null; method: string; amount: number; status?: PaymentStatus; metadata?: Prisma.InputJsonValue }) {
    return this.db.payment.create({
      data: {
        tenantId: tenant.tenantId,
        orderId: input.orderId ?? null,
        method: input.method,
        amount: input.amount,
        status: input.status ?? 'paid',
        metadata: input.metadata ?? {},
      },
    });
  }

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.payment.findMany({
      where: scoped(tenant),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class CustomerRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.customer.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class StockRepository {
  constructor(private readonly db: DbClient = prisma) {}

  listItems(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.stockItem.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }

  async adjust(tenant: TenantContext, input: { stockItemId: string; warehouseId?: string | null; quantity: number; type: string; reason?: string | null; metadata?: Prisma.InputJsonValue }) {
    const item = await this.db.stockItem.update({
      where: { id: input.stockItemId, tenantId: tenant.tenantId },
      data: { quantity: { increment: input.quantity } },
    });
    const movement = await this.db.stockMovement.create({
      data: {
        tenantId: tenant.tenantId,
        stockItemId: input.stockItemId,
        warehouseId: input.warehouseId ?? null,
        quantity: input.quantity,
        type: input.type,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      },
    });
    return { item, movement };
  }
}

export class WarehouseRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.warehouse.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class RecipeRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.recipe.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class PrinterRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.printer.findMany({
      where: scoped(tenant),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class ExpenseRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.expense.findMany({
      where: scoped(tenant),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class ShiftRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions & { status?: string } = {}) {
    return this.db.shift.findMany({
      where: scoped(tenant, options.status ? { status: options.status } : {}),
      orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class ReportRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.report.findMany({
      where: scoped(tenant),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
    });
  }
}

export class SettingsRepository {
  constructor(private readonly db: DbClient = prisma) {}

  get(tenant: TenantContext, key: string) {
    return this.db.runtimeState.findUnique({
      where: runtimeStateTenantKey(tenant.tenantId, `settings:${key}`),
    });
  }

  set(tenant: TenantContext, key: string, payload: Prisma.InputJsonValue) {
    return this.db.runtimeState.upsert({
      where: runtimeStateTenantKey(tenant.tenantId, `settings:${key}`),
      update: { payload },
      create: { tenantId: tenant.tenantId, key: `settings:${key}`, payload },
    });
  }
}

export class UserRepository {
  constructor(private readonly db: DbClient = prisma) {}

  list(tenant: TenantContext, options: PageOptions = {}) {
    return this.db.user.findMany({
      where: scoped(tenant, { active: true }),
      orderBy: [{ updatedAt: 'desc' }, { username: 'asc' }],
      take: take(options),
      skip: options.cursor ? 1 : options.skip ?? 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        branchId: true,
        permissions: true,
        active: true,
        updatedAt: true,
      },
    });
  }
}
