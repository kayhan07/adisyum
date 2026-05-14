import { queryOptions } from '@tanstack/react-query';
import { tenantQueryKey } from '@/lib/query/keys';

export async function fetchTenantRuntimeState<TState = Record<string, unknown>>(scope: string) {
  const response = await fetch(`/api/runtime/state/${scope}`, { cache: 'no-store', credentials: 'include' });
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
