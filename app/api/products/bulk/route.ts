import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeProductName } from '@/lib/product-name-normalization';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { invalidateRuntimePosCatalog } from '@/lib/server/runtime-pos-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DecimalLike = number | string | { toString(): string };

type BulkProductInput = {
  id?: string;
  name?: string;
  category?: string;
  productType?: string;
  salePrice?: string | number;
  price?: string | number;
  vatRate?: string | number;
  unitType?: string;
};

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function parseMoney(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseVatRate(value: unknown) {
  const parsed = Number(String(value ?? '10').replace(',', '.'));
  if (parsed === 1 || parsed === 10 || parsed === 20) return parsed;
  return 10;
}

function safePosKey(tenantId: string, name: string, index: number) {
  const digest = crypto.createHash('sha1').update(`${tenantId}:${name}:${index}`).digest('hex').slice(0, 16);
  return `imp-${digest}`;
}

function normalizeProductType(value: unknown) {
  const productType = cleanText(value, 'sale_product');
  if (productType === 'stock_item') return 'stock_item';
  if (productType === 'combo_product') return 'combo_product';
  return 'sale_product';
}

async function findOrCreateCategory(tx: Prisma.TransactionClient, tenantId: string, name: string, productType: string) {
  const categoryName = cleanText(name, productType === 'stock_item' ? 'Hammadde' : 'Mutfak');
  const existing = await tx.productCategory.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      name: { equals: categoryName, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.productCategory.create({
    data: {
      tenantId,
      name: categoryName,
      active: true,
      visibleInPos: productType !== 'stock_item',
      visibleInInventory: productType === 'stock_item',
      visibleInProduction: productType === 'stock_item',
      allowedProductTypes: [productType],
      branchVisibility: {},
    },
    select: { id: true },
  });
  return created.id;
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const products = await prisma.product.findMany({
      where: {
        tenantId: tenant.tenantId,
        deletedAt: null,
        active: true,
        productType: { in: ['sale_product', 'combo_product', 'stock_item'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        posKey: true,
        legacyKey: true,
        revision: true,
        productType: true,
        price: true,
        vatRate: true,
        unitType: true,
        categoryId: true,
        metadata: true,
      },
      take: 10000,
    });
    const categoryIds = [...new Set(products.map((product: { categoryId: string | null }) => product.categoryId).filter((id: string | null): id is string => Boolean(id)))];
    const categories = categoryIds.length > 0
      ? await prisma.productCategory.findMany({
          where: { tenantId: tenant.tenantId, id: { in: categoryIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : [];
    const categoryById = new Map(categories.map((category: { id: string; name: string }) => [category.id, category.name]));

    return NextResponse.json({
      ok: true,
      tenantId: tenant.tenantId,
      branchId: tenant.branchId,
      products: products.map((product: { id: string; name: string; posKey: string | null; legacyKey: string | null; revision: number; productType: string; price: DecimalLike; vatRate: number; unitType: string; categoryId: string | null; metadata: unknown }) => ({
        id: product.id,
        name: normalizeProductName(product.name),
        posKey: product.posKey,
        legacyKey: product.legacyKey,
        revision: product.revision,
        productType: product.productType,
        price: Number(product.price),
        vatRate: product.vatRate,
        unitType: product.unitType,
        category: product.categoryId ? categoryById.get(product.categoryId) ?? (product.productType === 'stock_item' ? 'Hammadde' : 'Mutfak') : (product.productType === 'stock_item' ? 'Hammadde' : 'Mutfak'),
        metadata: product.metadata,
      })),
    });
  } catch (error) {
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    console.error('[products] bulk product list failed', { error });
    return NextResponse.json({ ok: false, error: 'Ürünler server tarafindan okunamadı.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = (await request.json().catch(() => null)) as { products?: BulkProductInput[]; source?: string } | null;
    const products = Array.isArray(body?.products) ? body.products : [];

    if (products.length === 0) {
      return NextResponse.json({ ok: false, error: 'Kaydedilecek ürün bulunamadı.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const saved = [];
      const categories = new Set<string>();
      const productTypes = new Set<string>();
      let createdCount = 0;
      let updatedCount = 0;
      let skipped = 0;

      for (const [index, input] of products.entries()) {
        const name = normalizeProductName(cleanText(input.name));
        if (!name) {
          skipped += 1;
          continue;
        }

        const productType = normalizeProductType(input.productType);
        productTypes.add(productType);
        categories.add(cleanText(input.category, productType === 'stock_item' ? 'Hammadde' : 'Mutfak'));
        const categoryId = await findOrCreateCategory(tx, tenant.tenantId, input.category ?? '', productType);
        const existing = await tx.product.findFirst({
          where: {
            tenantId: tenant.tenantId,
            deletedAt: null,
            productType,
            name: { equals: name, mode: 'insensitive' },
          },
          select: { id: true, revision: true, posKey: true },
        });

        const price = parseMoney(input.salePrice ?? input.price);
        const vatRate = parseVatRate(input.vatRate);
        const unitType = productType === 'stock_item' ? cleanText(input.unitType, 'adet') : cleanText(input.unitType, 'portion');

        if (existing) {
          const updated = await tx.product.update({
            where: { id: existing.id },
            data: {
              name,
              categoryId,
              price,
              vatRate,
              unitType,
              active: true,
              lifecycleStatus: productType === 'stock_item' ? 'active' : 'published',
              publishStatus: productType === 'stock_item' ? 'draft' : 'published',
              revision: existing.revision + 1,
              metadata: {
                source: body?.source ?? 'excel-import',
                importedAt: new Date().toISOString(),
                branchId: tenant.branchId,
              },
            },
            select: { id: true, name: true, posKey: true, revision: true },
          });
          saved.push(updated);
          updatedCount += 1;
          continue;
        }

        const created = await tx.product.create({
          data: {
            tenantId: tenant.tenantId,
            categoryId,
            name,
            posKey: productType === 'stock_item' ? null : safePosKey(tenant.tenantId, name, index),
            legacyKey: cleanText(input.id, name),
            revision: 1,
            lifecycleStatus: productType === 'stock_item' ? 'active' : 'published',
            publishStatus: productType === 'stock_item' ? 'draft' : 'published',
            price,
            vatRate,
            unitType,
            productType,
            active: true,
            metadata: {
              source: body?.source ?? 'excel-import',
              importedAt: new Date().toISOString(),
              branchId: tenant.branchId,
            },
          },
          select: { id: true, name: true, posKey: true, revision: true },
        });
        saved.push(created);
        createdCount += 1;
      }

      return { saved, skipped, createdCount, updatedCount, categories: [...categories], productTypes: [...productTypes] };
    });

    await invalidateRuntimePosCatalog(tenant.tenantId, 'product-bulk-import', tenant.branchId).catch((error) => {
      console.error('[products] runtime catalog invalidation failed after bulk import', {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        error,
      });
    });

    const source = body?.source ?? 'excel-import';
    const eventType = source === 'excel-import'
      ? 'product.imported'
      : result.createdCount > 0 && result.updatedCount === 0
        ? 'product.created'
        : result.updatedCount > 0 && result.createdCount === 0
          ? 'product.updated'
          : 'product.imported';

    await publishTenantEvent(tenant.tenantId, 'products', {
      type: eventType,
      source,
      branchId: tenant.branchId,
      savedCount: result.saved.length,
      skippedCount: result.skipped,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      categories: result.categories,
      productTypes: result.productTypes,
      catalogInvalidationRequired: true,
      runtimeCacheCleared: true,
    }).catch((error) => {
      console.warn('[products] tenant product event publish failed after bulk save', {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return NextResponse.json({
      ok: true,
      tenantId: tenant.tenantId,
      branchId: tenant.branchId,
      savedCount: result.saved.length,
      skippedCount: result.skipped,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      products: result.saved,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    console.error('[products] bulk product save failed', { error });
    return NextResponse.json({ ok: false, error: 'Ürünler server tarafına kaydedilemedi.' }, { status: 500 });
  }
}
