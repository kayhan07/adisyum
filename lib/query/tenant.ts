import { queryOptions } from '@tanstack/react-query';
import { tenantQueryKey } from '@/lib/query/keys';
import { runtimeFetch } from '@/lib/runtime/runtime-api';

export async function fetchTenantRuntimeState<TState = Record<string, unknown>>(scope: string) {
  const response = await runtimeFetch(`/api/runtime/state/${scope}` as `/api/${string}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Tenant runtime state alınamadı.');
  const payload = (await response.json()) as { ok: boolean; state: TState };
  return payload.state;
}

export function tenantRuntimeStateQueryOptions<TState = Record<string, unknown>>(tenantId: string | null | undefined, resource: string) {
  return queryOptions({
    queryKey: tenantQueryKey(tenantId, resource),
    queryFn: () => fetchTenantRuntimeState<TState>('tenant'),
  });
}
