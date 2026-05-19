import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@/lib/tenant';
import { isSellableProductType, resolvePosFacingProductDomainType } from '@/lib/product-domain';

type TenantScopedWhere = {
  tenantId: string;
};

export function tenantWhere<T extends object>(tenant: TenantContext, where?: T): T & TenantScopedWhere {
  return {
    ...(where ?? {}),
    tenantId: tenant.tenantId,
  } as T & TenantScopedWhere;
}

export async function assertTenantIsActive(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId },
    select: { tenantId: true, status: true },
  });

  if (!tenant || !['active', 'trial', 'demo'].includes(tenant.status)) {
    throw new Error('Tenant aktif değil veya bulunamadı.');
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: { in: ['active', 'trial', 'demo'] },
      endsAt: { gte: new Date() },
    },
    select: { id: true },
  });

  if (!subscription) throw new Error('Aktif abonelik bulunamadı.');
  return tenant;
}

export async function listTenantProducts(tenant: TenantContext, options: { take?: number; skip?: number } = {}) {
  const products = await prisma.product.findMany({
    where: tenantWhere(tenant, { active: true }),
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 100,
    skip: options.skip ?? 0,
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      posKey: true,
      externalId: true,
      legacyKey: true,
      revision: true,
      price: true,
      vatRate: true,
      unitType: true,
      productType: true,
      categoryId: true,
      updatedAt: true,
    },
  });

  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { tenantId: tenant.tenantId, id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const filtered = products
    .map((product) => {
      const productType = resolvePosFacingProductDomainType({
        id: product.id,
        posKey: product.posKey,
        name: product.name,
        category: categoryById.get(product.categoryId ?? '') ?? null,
        productType: product.productType,
        price: product.price.toString(),
      });
      return {
        ...product,
        productType,
        posKey: product.posKey ?? undefined,
        legacyKey: product.legacyKey ?? product.name,
      };
    })
    .filter((product) => isSellableProductType(product.productType));

  if (products.length > 0 && filtered.length === 0) {
    console.error('[pos-catalog] tenant product catalog empty after productType filtering', {
      tenantId: tenant.tenantId,
      scanned: products.length,
      sample: products.slice(0, 20).map((product) => ({
        id: product.id,
        name: product.name,
        productType: product.productType,
      })),
    });
  }

  return filtered;
}

export async function listTenantTables(tenant: TenantContext, options: { take?: number; skip?: number } = {}) {
  return prisma.posTable.findMany({
    where: tenantWhere(tenant),
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    take: options.take ?? 200,
    skip: options.skip ?? 0,
  });
}

export async function createTenantOrder(
  tenant: TenantContext,
  input: {
    orderNo: string;
    tableId?: string | null;
    customerId?: string | null;
    items: Array<{ productId?: string | null; name: string; quantity: number; unitPrice: number; total: number; notes?: string }>;
    subtotal: number;
    discount?: number;
    taxTotal?: number;
    total: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        tenantId: tenant.tenantId,
        orderNo: input.orderNo,
        tableId: input.tableId,
        customerId: input.customerId,
        subtotal: input.subtotal,
        discount: input.discount ?? 0,
        taxTotal: input.taxTotal ?? 0,
        total: input.total,
      },
    });

    if (input.items.length > 0) {
      await tx.orderItem.createMany({
        data: input.items.map((item) => ({
          tenantId: tenant.tenantId,
          orderId: order.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          notes: item.notes,
        })),
      });
    }

    return order;
  });
}

export async function cloneRecipeTemplateToTenant(tenant: TenantContext, templateId: string) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.recipeTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error('Reçete şablonu bulunamadı.');

    const items = await tx.recipeTemplateItem.findMany({ where: { templateId } });
    const recipe = await tx.recipe.create({
      data: {
        tenantId: tenant.tenantId,
        sourceTemplateId: template.id,
        name: template.name,
        yieldQuantity: template.yieldQuantity,
        unit: template.unit,
        metadata: template.metadata === null
          ? {}
          : JSON.parse(JSON.stringify(template.metadata)) as Prisma.InputJsonValue,
      },
    });

    if (items.length > 0) {
      await tx.recipeItem.createMany({
        data: items.map((item) => ({
          tenantId: tenant.tenantId,
          recipeId: recipe.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
      });
    }

    return recipe;
  });
}
