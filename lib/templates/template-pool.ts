import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import type { TenantContext } from '@/lib/tenant';

const SYSTEM_TENANT_ID = 'system';

type CanonicalTemplate = {
  key: string;
  name: string;
  restaurantType: string;
  categoryKey: string;
  categoryName: string;
  price: number;
  unitType?: string;
  vatRate?: number;
  printerGroupName: string;
  preparationGroup: string;
  ingredients: Array<{
    key: string;
    name: string;
    quantity: number;
    stockUnit: string;
    recipeUnit: string;
    purchaseUnit: string;
    minLevel?: number;
  }>;
};

const CANONICAL_TEMPLATES: CanonicalTemplate[] = [
  {
    key: 'adana-kebap',
    name: 'Adana Kebap',
    restaurantType: 'Kebap',
    categoryKey: 'ana-yemek',
    categoryName: 'Ana Yemek',
    price: 420,
    printerGroupName: 'Mutfak',
    preparationGroup: 'Izgara',
    ingredients: [
      { key: 'kuzu-kiyma', name: 'Kuzu Kıyma', quantity: 180, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 5 },
      { key: 'pul-biber', name: 'Pul Biber', quantity: 4, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 0.5 },
    ],
  },
  {
    key: 'lahmacun',
    name: 'Lahmacun',
    restaurantType: 'Kebap',
    categoryKey: 'hamur-isi',
    categoryName: 'Hamur İşi',
    price: 110,
    printerGroupName: 'Mutfak',
    preparationGroup: 'Fırın',
    ingredients: [
      { key: 'un', name: 'Un', quantity: 90, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 10 },
      { key: 'dana-kiyma', name: 'Dana Kıyma', quantity: 60, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 5 },
    ],
  },
  {
    key: 'caffe-latte',
    name: 'Caffe Latte',
    restaurantType: 'Cafe',
    categoryKey: 'kahve',
    categoryName: 'Kahve',
    price: 145,
    printerGroupName: 'Bar',
    preparationGroup: 'Kahve',
    ingredients: [
      { key: 'espresso', name: 'Espresso', quantity: 18, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 1 },
      { key: 'sut', name: 'Süt', quantity: 220, stockUnit: 'lt', recipeUnit: 'ml', purchaseUnit: 'lt', minLevel: 10 },
      { key: 'seker', name: 'Şeker', quantity: 5, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 1 },
    ],
  },
  {
    key: 'tiramisu',
    name: 'Tiramisu',
    restaurantType: 'Cafe',
    categoryKey: 'tatli',
    categoryName: 'Tatlı',
    price: 190,
    printerGroupName: 'Mutfak',
    preparationGroup: 'Tatlı',
    ingredients: [
      { key: 'mascarpone', name: 'Mascarpone', quantity: 80, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 1 },
      { key: 'kedi-dili', name: 'Kedi Dili', quantity: 40, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 1 },
    ],
  },
  {
    key: 'balik-izgara',
    name: 'Balık Izgara',
    restaurantType: 'Balık',
    categoryKey: 'ana-yemek',
    categoryName: 'Ana Yemek',
    price: 540,
    printerGroupName: 'Mutfak',
    preparationGroup: 'Izgara',
    ingredients: [
      { key: 'levrek', name: 'Levrek', quantity: 1, stockUnit: 'adet', recipeUnit: 'adet', purchaseUnit: 'adet', minLevel: 10 },
      { key: 'zeytinyagi', name: 'Zeytinyağı', quantity: 12, stockUnit: 'lt', recipeUnit: 'ml', purchaseUnit: 'lt', minLevel: 2 },
    ],
  },
  {
    key: 'raki-mezeleri',
    name: 'Rakı Mezeleri',
    restaurantType: 'Meyhane',
    categoryKey: 'meze',
    categoryName: 'Meze',
    price: 260,
    printerGroupName: 'Mutfak',
    preparationGroup: 'Soğuk Mutfak',
    ingredients: [
      { key: 'yogurt', name: 'Yoğurt', quantity: 120, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 3 },
      { key: 'patlican', name: 'Patlıcan', quantity: 100, stockUnit: 'kg', recipeUnit: 'gr', purchaseUnit: 'kg', minLevel: 4 },
    ],
  },
];

function json<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export async function ensureSystemTemplatePool() {
  return prisma.$transaction(async (tx) => {
    for (const template of CANONICAL_TEMPLATES) {
      const category = await tx.categoryTemplate.upsert({
        where: { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: template.categoryKey } },
        update: { name: template.categoryName },
        create: {
          tenantId: SYSTEM_TENANT_ID,
          key: template.categoryKey,
          name: template.categoryName,
        },
      });

      const productTemplate = await tx.productTemplate.upsert({
        where: { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: template.key } },
        update: {
          name: template.name,
          restaurantType: template.restaurantType,
          categoryTemplateId: category.id,
          defaultPrice: template.price,
          vatRate: template.vatRate ?? 10,
          unitType: template.unitType ?? 'adet',
          printerGroupName: template.printerGroupName,
          preparationGroup: template.preparationGroup,
        },
        create: {
          tenantId: SYSTEM_TENANT_ID,
          key: template.key,
          name: template.name,
          restaurantType: template.restaurantType,
          categoryTemplateId: category.id,
          defaultPrice: template.price,
          vatRate: template.vatRate ?? 10,
          unitType: template.unitType ?? 'adet',
          printerGroupName: template.printerGroupName,
          preparationGroup: template.preparationGroup,
        },
      });

      const recipe = await tx.recipeTemplate.upsert({
        where: { id: productTemplate.id },
        update: {
          tenantId: SYSTEM_TENANT_ID,
          productTemplateId: productTemplate.id,
          name: template.name,
          category: template.categoryName,
          metadata: json({ templateKey: template.key }),
        },
        create: {
          id: productTemplate.id,
          tenantId: SYSTEM_TENANT_ID,
          productTemplateId: productTemplate.id,
          name: template.name,
          category: template.categoryName,
          metadata: json({ templateKey: template.key }),
        },
      });

      await tx.recipeTemplateItem.deleteMany({ where: { templateId: recipe.id } });

      for (const ingredient of template.ingredients) {
        const stockTemplate = await tx.stockTemplate.upsert({
          where: { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: ingredient.key } },
          update: {
            name: ingredient.name,
            stockUnit: ingredient.stockUnit,
            recipeUnit: ingredient.recipeUnit,
            purchaseUnit: ingredient.purchaseUnit,
            minLevel: ingredient.minLevel ?? 0,
          },
          create: {
            tenantId: SYSTEM_TENANT_ID,
            key: ingredient.key,
            name: ingredient.name,
            stockUnit: ingredient.stockUnit,
            recipeUnit: ingredient.recipeUnit,
            purchaseUnit: ingredient.purchaseUnit,
            minLevel: ingredient.minLevel ?? 0,
          },
        });

        await tx.recipeTemplateItem.create({
          data: {
            templateId: recipe.id,
            stockTemplateId: stockTemplate.id,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.recipeUnit,
          },
        });
      }
    }
  });
}

export async function listProductTemplates(filters: { restaurantType?: string; query?: string } = {}) {
  await ensureSystemTemplatePool();
  return prisma.productTemplate.findMany({
    where: {
      tenantId: SYSTEM_TENANT_ID,
      active: true,
      ...(filters.restaurantType ? { restaurantType: filters.restaurantType } : {}),
      ...(filters.query ? { name: { contains: filters.query, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ restaurantType: 'asc' }, { name: 'asc' }],
  });
}

export async function importProductTemplatesToTenant(tenant: TenantContext, templateIds: string[]) {
  const uniqueTemplateIds = [...new Set(templateIds)];
  if (uniqueTemplateIds.length === 0) return [];

  return prisma.$transaction(async (tx) => {
    const templates = await tx.productTemplate.findMany({
      where: { id: { in: uniqueTemplateIds }, tenantId: SYSTEM_TENANT_ID, active: true },
    });
    if (templates.length !== uniqueTemplateIds.length) throw new Error('Bir veya daha fazla şablon bulunamadı.');

    const results = [];
    for (const template of templates) {
      const previousImport = await tx.templateImport.findUnique({
        where: { tenantId_productTemplateId: { tenantId: tenant.tenantId, productTemplateId: template.id } },
      });
      if (previousImport) {
        results.push({ templateId: template.id, status: 'already_imported', productId: previousImport.productId, recipeId: previousImport.recipeId });
        continue;
      }

      const categoryTemplate = template.categoryTemplateId
        ? await tx.categoryTemplate.findUnique({ where: { id: template.categoryTemplateId } })
        : null;
      const category = categoryTemplate
        ? await tx.productCategory.findFirst({
          where: { tenantId: tenant.tenantId, name: { equals: categoryTemplate.name, mode: 'insensitive' } },
        }) ?? await tx.productCategory.create({
          data: {
            tenantId: tenant.tenantId,
            sourceTemplateId: categoryTemplate.id,
            name: categoryTemplate.name,
          },
        })
        : null;

      const printerGroup = template.printerGroupName
        ? await tx.printerGroup.findFirst({
          where: { tenantId: tenant.tenantId, name: { equals: template.printerGroupName, mode: 'insensitive' } },
        }) ?? await tx.printerGroup.create({
          data: {
            tenantId: tenant.tenantId,
            name: template.printerGroupName,
            metadata: json({ source: 'template-import' }),
          },
        })
        : null;

      const product = await tx.product.create({
        data: {
          tenantId: tenant.tenantId,
          sourceTemplateId: template.id,
          categoryId: category?.id ?? null,
          name: template.name,
          price: template.defaultPrice,
          vatRate: template.vatRate,
          unitType: template.unitType,
          metadata: json({
            source: 'template-import',
            sourceTemplateId: template.id,
            printerGroupId: printerGroup?.id ?? null,
            printerGroupName: template.printerGroupName,
            preparationGroup: template.preparationGroup,
            prices: {
              sales: Number(template.defaultPrice),
              takeaway: Number(template.defaultPrice),
              delivery: Number(template.defaultPrice),
              campaign: null,
              happyHour: null,
            },
          }),
        },
      });

      const recipeTemplate = await tx.recipeTemplate.findFirst({
        where: { tenantId: SYSTEM_TENANT_ID, productTemplateId: template.id },
      });
      let recipeId: string | null = null;
      if (recipeTemplate) {
        const recipe = await tx.recipe.create({
          data: {
            tenantId: tenant.tenantId,
            productId: product.id,
            sourceTemplateId: recipeTemplate.id,
            name: recipeTemplate.name,
            yieldQuantity: recipeTemplate.yieldQuantity,
            unit: recipeTemplate.unit,
            metadata: json({ source: 'template-import', sourceTemplateId: recipeTemplate.id }),
          },
        });
        recipeId = recipe.id;

        const items = await tx.recipeTemplateItem.findMany({ where: { templateId: recipeTemplate.id } });
        for (const item of items) {
          const stockTemplate = item.stockTemplateId
            ? await tx.stockTemplate.findUnique({ where: { id: item.stockTemplateId } })
            : null;
          const stockName = stockTemplate?.name ?? item.name;
          const existingStock = await tx.stockItem.findFirst({
            where: { tenantId: tenant.tenantId, name: { equals: stockName, mode: 'insensitive' } },
          });
          const stockItem = existingStock ?? await tx.stockItem.create({
            data: {
              tenantId: tenant.tenantId,
              sourceTemplateId: stockTemplate?.id ?? null,
              name: stockName,
              unit: stockTemplate?.stockUnit ?? item.unit,
              minLevel: stockTemplate?.minLevel ?? 0,
              metadata: json({
                source: 'template-import',
                recipeUnit: stockTemplate?.recipeUnit ?? item.unit,
                purchaseUnit: stockTemplate?.purchaseUnit ?? stockTemplate?.stockUnit ?? item.unit,
                category: category?.name ?? null,
              }),
            },
          });

          await tx.recipeItem.create({
            data: {
              tenantId: tenant.tenantId,
              recipeId: recipe.id,
              stockItemId: stockItem.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
            },
          });
        }
      }

      await tx.templateImport.create({
        data: {
          tenantId: tenant.tenantId,
          productTemplateId: template.id,
          productId: product.id,
          recipeId,
          importedBy: tenant.userId,
          metadata: json({ importedFromVersion: template.version }),
        },
      });

      await writeAuditLog({
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        action: 'system_admin_action',
        entity: 'template_import',
        entityId: template.id,
        metadata: json({ productId: product.id, recipeId }),
        db: tx,
      });

      results.push({ templateId: template.id, status: 'imported', productId: product.id, recipeId });
    }
    return results;
  });
}

export async function getTemplateImportStats() {
  const grouped = await prisma.templateImport.groupBy({
    by: ['productTemplateId'],
    _count: { id: true },
  });
  const templates = await prisma.productTemplate.findMany({
    where: { id: { in: grouped.map((item) => item.productTemplateId) } },
    select: { id: true, name: true, restaurantType: true, version: true },
  });
  return grouped.map((item) => ({
    template: templates.find((template) => template.id === item.productTemplateId) ?? null,
    importCount: item._count.id,
  }));
}

export function searchMatches(value: string, query: string) {
  return normalize(value).includes(normalize(query));
}
