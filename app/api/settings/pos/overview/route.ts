import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { getTenantCache, setTenantCache, tenantCacheKey } from '@/lib/db/cache';
import { filterSellableProducts } from '@/lib/product-domain';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null, defaultValue: number, maxValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(Math.floor(parsed), maxValue);
}

type DeviceIndexPayload = {
  devices?: unknown[];
  queue?: unknown;
  agents_online?: number;
};

type MappingIndexPayload = {
  data?: unknown[];
};

function filterPosFacingProducts(products: unknown[]) {
  const productObjects = products.filter((product): product is Record<string, unknown> =>
    Boolean(product && typeof product === 'object'),
  );

  return filterSellableProducts(
    productObjects.map((product) => ({
      ...product,
      id: typeof product.id === 'string' ? product.id : typeof product.product_id === 'string' ? product.product_id : null,
      name: typeof product.name === 'string' ? product.name : typeof product.product_name === 'string' ? product.product_name : null,
      category: typeof product.category === 'string' ? product.category : typeof product.category_name === 'string' ? product.category_name : null,
      productType: typeof product.productType === 'string'
        ? product.productType
        : typeof product.product_type === 'string'
          ? product.product_type
          : null,
    })),
    'settings-pos-overview-products',
  );
}

export async function GET(request: Request) {
  let tenantId = '';
  try {
    tenantId = (await requireTenant(request)).tenantId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  const url = new URL(request.url);
  const logsLimit = parseLimit(url.searchParams.get('logsLimit'), 200, 2000);
  const productsLimit = parseLimit(url.searchParams.get('productsLimit'), 500, 5000);
  const mappingsLimit = parseLimit(url.searchParams.get('mappingsLimit'), 500, 5000);
  const cacheKey = tenantCacheKey(tenantId, 'pos-overview', `${logsLimit}:${productsLimit}:${mappingsLimit}`);

  const cached = await getTenantCache<unknown>(cacheKey).catch(() => null);
  if (cached) return NextResponse.json(cached);

  const [devicesResult, logsResult, productsResult, mappingsResult, coverageResult] = await Promise.allSettled([
    posBackendJson<DeviceIndexPayload>('/pos/devices'),
    posBackendJson<unknown[]>('/pos/logs'),
    posBackendJson<unknown[]>('/products'),
    posBackendJson<MappingIndexPayload | unknown[]>('/product-mappings'),
    posBackendJson<unknown>('/product-mappings/coverage'),
  ]);

  const backendErrors = [devicesResult, logsResult, productsResult, mappingsResult, coverageResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : 'Bilinmeyen POS backend hatası');

  const devicesPayload = devicesResult.status === 'fulfilled' ? devicesResult.value : null;
  const mappingsPayload = mappingsResult.status === 'fulfilled' ? mappingsResult.value : [];
  const logs = logsResult.status === 'fulfilled' ? logsResult.value : [];
  const products = productsResult.status === 'fulfilled' ? productsResult.value : [];
  const sellableProducts = Array.isArray(products) ? filterPosFacingProducts(products) : [];
  const mappings = Array.isArray(mappingsPayload) ? mappingsPayload : (mappingsPayload.data ?? []);

  const responsePayload = {
    backendAvailable: backendErrors.length === 0,
    backendErrors,
    devices: devicesPayload?.devices ?? [],
    queue: devicesPayload?.queue ?? null,
    agentsOnline: devicesPayload?.agents_online ?? 0,
    logs: Array.isArray(logs) ? logs.slice(0, logsLimit) : [],
    products: sellableProducts.slice(0, productsLimit),
    mappings: Array.isArray(mappings) ? mappings.slice(0, mappingsLimit) : [],
    coverage: coverageResult.status === 'fulfilled' ? coverageResult.value : null,
  };

  await setTenantCache(cacheKey, responsePayload, 15).catch(() => undefined);

  return NextResponse.json(responsePayload);
}
