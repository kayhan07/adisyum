export function tenantCacheKey(tenantId: string, scope: string, suffix?: string) {
  const normalizedTenant = tenantId.trim();
  const normalizedScope = scope.trim().replace(/[^a-zA-Z0-9:_-]/g, '-');
  const normalizedSuffix = suffix?.trim().replace(/[^a-zA-Z0-9:_-]/g, '-');
  return normalizedSuffix
    ? `tenant:${normalizedTenant}:${normalizedScope}:${normalizedSuffix}`
    : `tenant:${normalizedTenant}:${normalizedScope}`;
}

export const tenantCacheKeys = {
  products: (tenantId: string) => tenantCacheKey(tenantId, 'products'),
  tables: (tenantId: string) => tenantCacheKey(tenantId, 'tables'),
  reports: (tenantId: string, reportId: string) => tenantCacheKey(tenantId, 'reports', reportId),
  orders: (tenantId: string, status = 'all') => tenantCacheKey(tenantId, 'orders', status),
  payments: (tenantId: string) => tenantCacheKey(tenantId, 'payments'),
  stock: (tenantId: string) => tenantCacheKey(tenantId, 'stock'),
};

type CacheScope = 'products' | 'tables' | 'reports' | 'orders' | 'payments' | 'stock';

async function upstashCommand(command: unknown[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis cache is required in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    return null;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Redis command failed: ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function invalidateTenantCache(tenantId: string, scopes: CacheScope[]) {
  const keys = scopes.flatMap((scope) => {
    if (scope === 'reports') return [tenantCacheKey(tenantId, 'reports:*')];
    if (scope === 'orders') return [tenantCacheKeys.orders(tenantId)];
    return [tenantCacheKey(tenantId, scope)];
  });

  await Promise.all(keys.map((key) => upstashCommand(['DEL', key])));
}

export async function setTenantCache<T>(key: string, value: T, ttlSeconds = 60) {
  await upstashCommand(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

export async function getTenantCache<T>(key: string) {
  const result = await upstashCommand(['GET', key]);
  if (!result || typeof result !== 'object' || !('result' in result) || typeof result.result !== 'string') return null;
  return JSON.parse(result.result) as T;
}
