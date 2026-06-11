import { prisma } from '@/lib/db/prisma';
import { Prisma, type PrismaClient } from '@prisma/client';
import { toPrismaJson } from '@/lib/db/prisma-json';
import type { TenantContext } from '@/lib/tenant';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];
import { isSellableProductType, resolvePosFacingProductDomainType } from '@/lib/product-domain';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

type TenantScopedWhere = {
  tenantId: string;
};

export function tenantWhere<T extends object>(tenant: TenantContext, where?: T): T & TenantScopedWhere {
  return {
    ...(where ?? {}),
    tenantId: tenant.tenantId,
  } as T & TenantScopedWhere;
}

function isUnlimitedSubscription(metadata: Prisma.JsonValue | null | undefined) {
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.unlimitedLicense === true);
}

export async function assertTenantCanAccess(tenantId: string, options: { readOnly?: boolean } = {}) {
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId },
    select: { tenantId: true, status: true, deletedAt: true },
  });

  if (!tenant || tenant.deletedAt || tenant.status === 'suspended' || tenant.status === 'blocked') {
    throw new Error('Tenant aktif değil veya bulunamadı.');
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      deletedAt: null,
    },
    orderBy: { endsAt: 'desc' },
    select: { id: true, status: true, endsAt: true, metadata: true },
  });

  if (!subscription) throw new Error('Aktif abonelik bulunamadı.');
  const unlimited = isUnlimitedSubscription(subscription.metadata);
  const activeSubscription = ['active', 'trial', 'demo'].includes(subscription.status) && (unlimited || subscription.endsAt >= new Date());
  const expiredReadAllowed = options.readOnly === true
    && (tenant.status === 'expired' || subscription.endsAt < new Date() || ['expired', 'canceled'].includes(subscription.status));

  if (!activeSubscription && !expiredReadAllowed) throw new Error('Aktif abonelik bulunamadı.');
  return tenant;
}

export async function assertTenantIsActive(tenantId: string) {
  return assertTenantCanAccess(tenantId, { readOnly: false });
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

  const categoryIds = [...new Set(products.map((product: { categoryId: string | null }) => product.categoryId).filter((id: string | null): id is string => Boolean(id)))];
  const categories = categoryIds.length > 0
    ? await prisma.productCategory.findMany({ where: { tenantId: tenant.tenantId, id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryById = new Map<string, string>(
    categories.map((category: { id: string; name: string }) => [category.id, category.name] as [string, string]),
  );

  const filtered = products
    .map((product: { id: string; posKey: string | null; name: string; categoryId: string | null; productType: string; price: { toString(): string }; legacyKey: string | null }) => {
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
    .filter((product: { productType: string }) => isSellableProductType(product.productType));

  if (products.length > 0 && filtered.length === 0) {
    console.error('[pos-catalog] tenant product catalog empty after productType filtering', {
      tenantId: tenant.tenantId,
      scanned: products.length,
      sample: products.slice(0, 20).map((product: { id: string; name: string; productType: string; categoryId: string | null }) => ({
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
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        data: input.items.map((item: { productId?: string | null; name: string; quantity: number; unitPrice: number; total: number; notes?: string }) => ({
          tenantId: tenant.tenantId,
          orderId: order.id,
          productId: item.productId,
          name: item.name,
          quantity: Number(item.quantity),
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
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        metadata: toPrismaJson(template.metadata ?? {}),
      },
    });

    if (items.length > 0) {
      await tx.recipeItem.createMany({
        data: items.map((item) => ({
          tenantId: tenant.tenantId,
          recipeId: recipe.id,
          name: item.name,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
      });
    }

    return recipe;
  });
}
