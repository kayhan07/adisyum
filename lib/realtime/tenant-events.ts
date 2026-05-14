type TenantEventScope = 'orders' | 'payments' | 'stock' | 'tables' | 'products' | 'system';

export function tenantEventChannel(tenantId: string, scope: TenantEventScope) {
  return `tenant:${tenantId}:${scope}`;
}

async function publishUpstash(channel: string, payload: unknown) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis pub/sub is required in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    return null;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(['PUBLISH', channel, JSON.stringify(payload)]),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Redis publish failed: ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function publishTenantEvent(tenantId: string, scope: TenantEventScope, payload: unknown) {
  return publishUpstash(tenantEventChannel(tenantId, scope), {
    tenantId,
    scope,
    payload,
    emittedAt: new Date().toISOString(),
  });
}
