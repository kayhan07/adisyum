import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import type { TenantContext } from '@/lib/tenant';
import { createPosKey } from '@/lib/product-identity';

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

type CanonicalPack = {
  key: string;
  name: string;
  restaurantType: string;
  scale: 'small' | 'medium' | 'large';
  description: string;
  templateKeys: string[];
  defaults: Record<string, unknown>;
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

const STOCK_ALIASES: Record<string, string[]> = {
  sut: ['milk', 'süt'],
  espresso: ['espresso', 'kahve çekirdeği', 'coffee'],
  seker: ['şeker', 'sugar'],
  yogurt: ['yoğurt', 'yogurt'],
};

const CANONICAL_PACKS: CanonicalPack[] = [
  {
    key: 'cafe-starter-small',
    name: 'Cafe Starter Pack',
    restaurantType: 'Cafe',
    scale: 'small',
    description: 'Kahve ve tatlı odaklı küçük kafe başlangıcı.',
    templateKeys: ['caffe-latte', 'tiramisu'],
    defaults: {
      takeawayEnabled: true,
      serviceChargePercent: 0,
      printerRoutes: ['Bar', 'Mutfak'],
      tablePreset: 'cafe-12',
      modifierGroups: ['Süt seçenekleri', 'Ek shot'],
    },
  },
  {
    key: 'kebap-starter-small',
    name: 'Kebapçı Starter Pack',
    restaurantType: 'Kebap',
    scale: 'small',
    description: 'Ocak ve fırın akışına uygun kebapçı başlangıcı.',
    templateKeys: ['adana-kebap', 'lahmacun'],
    defaults: {
      takeawayEnabled: true,
      serviceChargePercent: 0,
      printerRoutes: ['Mutfak'],
      tablePreset: 'restaurant-16',
      kitchenGroups: ['Ocak', 'Fırın'],
    },
  },
  {
    key: 'meyhane-starter-small',
    name: 'Meyhane Pack',
    restaurantType: 'Meyhane',
    scale: 'small',
    description: 'Soğuk mutfak ve meze servisi odaklı başlangıç.',
    templateKeys: ['raki-mezeleri'],
    defaults: {
      takeawayEnabled: false,
      serviceChargePercent: 10,
      printerRoutes: ['Mutfak'],
      tablePreset: 'meyhane-16',
      kitchenGroups: ['Soğuk Mutfak'],
    },
  },
  {
    key: 'balik-starter-small',
    name: 'Balık Restaurant Pack',
    restaurantType: 'Balık',
    scale: 'small',
    description: 'Balık restoranı için ızgara odaklı başlangıç.',
    templateKeys: ['balik-izgara'],
    defaults: {
      takeawayEnabled: false,
      serviceChargePercent: 10,
      printerRoutes: ['Mutfak'],
      tablePreset: 'restaurant-16',
      kitchenGroups: ['Izgara'],
    },
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
    const productByKey = new Map<string, { id: string }>();
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
      productByKey.set(template.key, productTemplate);

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

    for (const pack of CANONICAL_PACKS) {
      const templatePack = await tx.templatePack.upsert({
        where: { tenantId_key_version: { tenantId: SYSTEM_TENANT_ID, key: pack.key, version: 1 } },
        update: {
          name: pack.name,
          restaurantType: pack.restaurantType,
          scale: pack.scale,
          description: pack.description,
          defaults: json(pack.defaults),
          active: true,
          deprecated: false,
        },
        create: {
          tenantId: SYSTEM_TENANT_ID,
          key: pack.key,
          name: pack.name,
          restaurantType: pack.restaurantType,
          scale: pack.scale,
          description: pack.description,
          defaults: json(pack.defaults),
        },
      });
      await tx.templatePackItem.deleteMany({ where: { packId: templatePack.id } });
      for (const [index, templateKey] of pack.templateKeys.entries()) {
        const productTemplate = productByKey.get(templateKey);
        if (!productTemplate) continue;
        await tx.templatePackItem.create({
          data: {
            packId: templatePack.id,
            productTemplateId: productTemplate.id,
            sortOrder: index,
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

export async function getSystemTemplateCatalog() {
  await ensureSystemTemplatePool();
  const [templates, recipes, stocks, categories, packs, packItems] = await Promise.all([
    prisma.productTemplate.findMany({
      where: { tenantId: SYSTEM_TENANT_ID },
      orderBy: [{ restaurantType: 'asc' }, { name: 'asc' }],
    }),
    prisma.recipeTemplate.findMany({
      where: { tenantId: SYSTEM_TENANT_ID },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    prisma.stockTemplate.findMany({
      where: { tenantId: SYSTEM_TENANT_ID },
      orderBy: { name: 'asc' },
    }),
    prisma.categoryTemplate.findMany({
      where: { tenantId: SYSTEM_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.templatePack.findMany({
      where: { tenantId: SYSTEM_TENANT_ID },
      orderBy: [{ restaurantType: 'asc' }, { scale: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    }),
    prisma.templatePackItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const recipeItems = await prisma.recipeTemplateItem.findMany({
    where: { templateId: { in: recipes.map((recipe) => recipe.id) } },
    orderBy: [{ createdAt: 'asc' }],
  });
  return { templates, recipes, recipeItems, stocks, categories, packs, packItems: packItems.filter((item) => packs.some((pack) => pack.id === item.packId)) };
}

export type ProductTemplateInput = {
  id?: string;
  key: string;
  name: string;
  restaurantType: string;
  categoryTemplateId?: string | null;
  defaultPrice?: number;
  vatRate?: number;
  unitType?: string;
  printerGroupName?: string | null;
  preparationGroup?: string | null;
  active?: boolean;
  deprecated?: boolean;
  version?: number;
};

export async function saveProductTemplate(input: ProductTemplateInput) {
  return prisma.productTemplate.upsert({
    where: input.id ? { id: input.id } : { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: input.key } },
    update: {
      key: input.key,
      name: input.name,
      restaurantType: input.restaurantType,
      categoryTemplateId: input.categoryTemplateId ?? null,
      defaultPrice: input.defaultPrice ?? 0,
      vatRate: input.vatRate ?? 10,
      unitType: input.unitType ?? 'adet',
      printerGroupName: input.printerGroupName ?? null,
      preparationGroup: input.preparationGroup ?? null,
      active: input.active ?? true,
      deprecated: input.deprecated ?? false,
      version: input.version ?? 1,
    },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      key: input.key,
      name: input.name,
      restaurantType: input.restaurantType,
      categoryTemplateId: input.categoryTemplateId ?? null,
      defaultPrice: input.defaultPrice ?? 0,
      vatRate: input.vatRate ?? 10,
      unitType: input.unitType ?? 'adet',
      printerGroupName: input.printerGroupName ?? null,
      preparationGroup: input.preparationGroup ?? null,
      active: input.active ?? true,
      deprecated: input.deprecated ?? false,
      version: input.version ?? 1,
    },
  });
}

export async function deleteProductTemplate(id: string) {
  const importedCount = await prisma.templateImport.count({ where: { productTemplateId: id } });
  if (importedCount > 0) {
    return prisma.productTemplate.update({ where: { id }, data: { active: false, deprecated: true } });
  }
  await prisma.templatePackItem.deleteMany({ where: { productTemplateId: id } });
  await prisma.recipeTemplateItem.deleteMany({ where: { templateId: id } });
  await prisma.recipeTemplate.deleteMany({ where: { productTemplateId: id } });
  return prisma.productTemplate.delete({ where: { id } });
}

export async function saveCategoryTemplate(input: { id?: string; key: string; name: string; sortOrder?: number }) {
  return prisma.categoryTemplate.upsert({
    where: input.id ? { id: input.id } : { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: input.key } },
    update: { key: input.key, name: input.name, sortOrder: input.sortOrder ?? 0 },
    create: { tenantId: SYSTEM_TENANT_ID, key: input.key, name: input.name, sortOrder: input.sortOrder ?? 0 },
  });
}

export async function saveStockTemplate(input: { id?: string; key: string; name: string; stockUnit: string; recipeUnit: string; purchaseUnit: string; minLevel?: number; aliases?: string[] }) {
  return prisma.stockTemplate.upsert({
    where: input.id ? { id: input.id } : { tenantId_key: { tenantId: SYSTEM_TENANT_ID, key: input.key } },
    update: {
      key: input.key,
      name: input.name,
      stockUnit: input.stockUnit,
      recipeUnit: input.recipeUnit,
      purchaseUnit: input.purchaseUnit,
      minLevel: input.minLevel ?? 0,
      metadata: json({ aliases: input.aliases ?? [] }),
    },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      key: input.key,
      name: input.name,
      stockUnit: input.stockUnit,
      recipeUnit: input.recipeUnit,
      purchaseUnit: input.purchaseUnit,
      minLevel: input.minLevel ?? 0,
      metadata: json({ aliases: input.aliases ?? [] }),
    },
  });
}

export async function saveRecipeTemplate(input: {
  id?: string;
  productTemplateId?: string | null;
  name: string;
  category?: string | null;
  yieldQuantity?: number;
  unit?: string;
  items?: Array<{ stockTemplateId?: string | null; name: string; quantity: number; unit: string }>;
}) {
  return prisma.$transaction(async (tx) => {
    const recipe = input.id
      ? await tx.recipeTemplate.update({
        where: { id: input.id },
        data: {
          productTemplateId: input.productTemplateId ?? null,
          name: input.name,
          category: input.category ?? null,
          yieldQuantity: input.yieldQuantity ?? 1,
          unit: input.unit ?? 'adet',
        },
      })
      : await tx.recipeTemplate.create({
        data: {
          tenantId: SYSTEM_TENANT_ID,
          productTemplateId: input.productTemplateId ?? null,
          name: input.name,
          category: input.category ?? null,
          yieldQuantity: input.yieldQuantity ?? 1,
          unit: input.unit ?? 'adet',
        },
      });
    if (input.items) {
      await tx.recipeTemplateItem.deleteMany({ where: { templateId: recipe.id } });
      if (input.items.length > 0) {
        await tx.recipeTemplateItem.createMany({
          data: input.items.map((item) => ({
            templateId: recipe.id,
            stockTemplateId: item.stockTemplateId ?? null,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
          })),
        });
      }
    }
    return recipe;
  });
}

export async function saveTemplatePack(input: {
  id?: string;
  key: string;
  name: string;
  restaurantType: string;
  scale?: string;
  version?: number;
  active?: boolean;
  deprecated?: boolean;
  description?: string | null;
  productTemplateIds?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const pack = input.id
      ? await tx.templatePack.update({
        where: { id: input.id },
        data: {
          key: input.key,
          name: input.name,
          restaurantType: input.restaurantType,
          scale: input.scale ?? 'small',
          version: input.version ?? 1,
          active: input.active ?? true,
          deprecated: input.deprecated ?? false,
          description: input.description ?? null,
        },
      })
      : await tx.templatePack.create({
        data: {
          tenantId: SYSTEM_TENANT_ID,
          key: input.key,
          name: input.name,
          restaurantType: input.restaurantType,
          scale: input.scale ?? 'small',
          version: input.version ?? 1,
          active: input.active ?? true,
          deprecated: input.deprecated ?? false,
          description: input.description ?? null,
        },
      });
    if (input.productTemplateIds) {
      await tx.templatePackItem.deleteMany({ where: { packId: pack.id } });
      if (input.productTemplateIds.length > 0) {
        await tx.templatePackItem.createMany({
          data: [...new Set(input.productTemplateIds)].map((productTemplateId, index) => ({
            packId: pack.id,
            productTemplateId,
            sortOrder: index,
          })),
        });
      }
    }
    return pack;
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

      const posKey = createPosKey(`${tenant.tenantId}:${template.key}:${template.version}`);
      const product = await tx.product.create({
        data: {
          tenantId: tenant.tenantId,
          sourceTemplateId: template.id,
          categoryId: category?.id ?? null,
          name: template.name,
          posKey,
          legacyKey: template.name,
          externalId: template.key,
          revision: 1,
          productType: 'sale_product',
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

export async function listTemplatePacks(filters: { restaurantType?: string; scale?: string } = {}) {
  await ensureSystemTemplatePool();
  return prisma.templatePack.findMany({
    where: {
      tenantId: SYSTEM_TENANT_ID,
      active: true,
      deprecated: false,
      ...(filters.restaurantType ? { restaurantType: filters.restaurantType } : {}),
      ...(filters.scale ? { scale: filters.scale } : {}),
    },
    orderBy: [{ restaurantType: 'asc' }, { scale: 'asc' }, { name: 'asc' }],
  });
}

function normalizeStockKey(value: string) {
  return normalize(value)
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c');
}

function aliasesForStockTemplate(key: string, name: string) {
  return [...new Set([key, name, ...(STOCK_ALIASES[key] ?? [])].map(normalizeStockKey))];
}

export async function previewTemplatePackImport(tenant: TenantContext, packIds: string[]) {
  const packs = await prisma.templatePack.findMany({
    where: { id: { in: [...new Set(packIds)] }, tenantId: SYSTEM_TENANT_ID, active: true, deprecated: false },
  });
  const packItems = await prisma.templatePackItem.findMany({
    where: { packId: { in: packs.map((pack) => pack.id) } },
  });
  const productTemplateIds = [...new Set(packItems.map((item) => item.productTemplateId))];
  const [existingImports, recipeTemplates, existingStocks] = await Promise.all([
    prisma.templateImport.findMany({
      where: { tenantId: tenant.tenantId, productTemplateId: { in: productTemplateIds } },
      select: { productTemplateId: true },
    }),
    prisma.recipeTemplate.findMany({
      where: { productTemplateId: { in: productTemplateIds } },
      select: { id: true, productTemplateId: true },
    }),
    prisma.stockItem.findMany({
      where: { tenantId: tenant.tenantId },
      select: { id: true, name: true },
    }),
  ]);
  const recipeItems = await prisma.recipeTemplateItem.findMany({
    where: { templateId: { in: recipeTemplates.map((recipe) => recipe.id) } },
  });
  const stockTemplates = await prisma.stockTemplate.findMany({
    where: { id: { in: recipeItems.map((item) => item.stockTemplateId).filter((id): id is string => Boolean(id)) } },
  });
  const existingImportIds = new Set(existingImports.map((item) => item.productTemplateId));
  const normalizedExistingStocks = existingStocks.map((stock) => ({ ...stock, normalized: normalizeStockKey(stock.name) }));
  const stockMatches = stockTemplates.map((template) => {
    const aliases = aliasesForStockTemplate(template.key, template.name);
    const matched = normalizedExistingStocks.find((stock) => aliases.includes(stock.normalized));
    return {
      stockTemplateId: template.id,
      templateName: template.name,
      matchedStockItemId: matched?.id ?? null,
      matchedStockName: matched?.name ?? null,
      suggestion: matched ? 'reuse' : 'create',
    };
  });

  return {
    packs,
    summary: {
      packs: packs.length,
      products: productTemplateIds.length,
      recipes: recipeTemplates.length,
      recipeItems: recipeItems.length,
      stockItemsToCreate: stockMatches.filter((item) => item.suggestion === 'create').length,
      stockMatches: stockMatches.filter((item) => item.suggestion === 'reuse').length,
      duplicateImports: productTemplateIds.filter((id) => existingImportIds.has(id)).length,
    },
    conflicts: {
      duplicateProductTemplateIds: productTemplateIds.filter((id) => existingImportIds.has(id)),
      stockMatches,
    },
  };
}

export async function importTemplatePacksToTenant(
  tenant: TenantContext,
  packIds: string[],
  configuration?: { branchName?: string; takeawayEnabled?: boolean; serviceChargePercent?: number },
) {
  const preview = await previewTemplatePackImport(tenant, packIds);
  const packItems = await prisma.templatePackItem.findMany({
    where: { packId: { in: preview.packs.map((pack) => pack.id) } },
  });
  const productTemplateIds = [...new Set(packItems.map((item) => item.productTemplateId))];
  const imported = await importProductTemplatesToTenant(tenant, productTemplateIds);
  await prisma.$transaction(preview.packs.map((pack) =>
    prisma.templatePackImport.upsert({
      where: { tenantId_templatePackId: { tenantId: tenant.tenantId, templatePackId: pack.id } },
      update: {
        packVersion: pack.version,
        importedBy: tenant.userId,
        summary: json(preview.summary),
      },
      create: {
        tenantId: tenant.tenantId,
        templatePackId: pack.id,
        packVersion: pack.version,
        importedBy: tenant.userId,
        summary: json(preview.summary),
      },
    }),
  ));
  if (configuration) {
    const currentTenant = await prisma.tenant.findUnique({
      where: { tenantId: tenant.tenantId },
      select: { settings: true, mainBranchId: true },
    });
    const currentSettings = currentTenant?.settings && typeof currentTenant.settings === 'object' && !Array.isArray(currentTenant.settings)
      ? currentTenant.settings as Record<string, unknown>
      : {};
    await prisma.$transaction([
      prisma.tenant.update({
        where: { tenantId: tenant.tenantId },
        data: {
          settings: json({
            ...currentSettings,
            onboarding: {
              ...((currentSettings.onboarding && typeof currentSettings.onboarding === 'object' && !Array.isArray(currentSettings.onboarding))
                ? currentSettings.onboarding as Record<string, unknown>
                : {}),
              packImported: true,
              importedTemplateCount: imported.filter((item) => item.status === 'imported').length,
            },
            serviceDefaults: {
              takeawayEnabled: configuration.takeawayEnabled ?? true,
              serviceChargePercent: configuration.serviceChargePercent ?? 0,
            },
          }),
        },
      }),
      ...(configuration.branchName && currentTenant?.mainBranchId
        ? [prisma.branch.update({
          where: { tenantId_branchId: { tenantId: tenant.tenantId, branchId: currentTenant.mainBranchId } },
          data: { name: configuration.branchName },
        })]
        : []),
    ]);
  }
  return { preview, imported };
}

export function searchMatches(value: string, query: string) {
  return normalize(value).includes(normalize(query));
}
