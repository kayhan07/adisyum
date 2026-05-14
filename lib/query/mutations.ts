import { QueryClient } from '@tanstack/react-query';
import { tenantQueryKey } from '@/lib/query/keys';

export async function optimisticTenantRuntimeUpdate<TData>(params: {
  queryClient: QueryClient;
  tenantId: string;
  resource: string;
  updater: (current: TData | undefined) => TData;
  mutate: () => Promise<unknown>;
}) {
  const key = tenantQueryKey(params.tenantId, params.resource);
  await params.queryClient.cancelQueries({ queryKey: key });
  const previous = params.queryClient.getQueryData<TData>(key);
  params.queryClient.setQueryData<TData>(key, params.updater(previous));

  try {
    await params.mutate();
  } catch (error) {
    params.queryClient.setQueryData(key, previous);
    throw error;
  } finally {
    await params.queryClient.invalidateQueries({ queryKey: key });
  }
}
