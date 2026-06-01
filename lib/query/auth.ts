import { queryOptions } from '@tanstack/react-query';
import { authQueryKeys } from '@/lib/query/keys';
import { runtimeFetch } from '@/lib/runtime/runtime-api';

export type AuthMePayload = {
  ok: true;
  session: {
    userId: string;
    tenantId: string;
    role: string;
    permissions: string[];
    branchId?: string;
    packageType?: 'mini' | 'gold' | 'premium';
    username?: string;
    name?: string;
    tenantName?: string;
    subscriptionEndDate?: string;
  };
} | {
  ok: false;
};

export async function fetchAuthSession(): Promise<AuthMePayload> {
  const response = await runtimeFetch('/api/auth/me', { cache: 'no-store' });
  if (response.status === 401) return { ok: false };
  if (!response.ok) throw new Error('Oturum bilgisi alınamadı.');
  return response.json() as Promise<AuthMePayload>;
}

export function authSessionQueryOptions() {
  return queryOptions({
    queryKey: authQueryKeys.session(),
    queryFn: fetchAuthSession,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
