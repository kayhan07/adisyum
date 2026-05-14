export const authQueryKeys = {
  root: ['auth'] as const,
  session: () => [...authQueryKeys.root, 'session'] as const,
};

export function tenantQueryKey(tenantId: string | null | undefined, resource: string, ...parts: Array<string | number | null | undefined>) {
  return ['tenant', tenantId ?? 'anonymous', resource, ...parts] as const;
}

export function systemAdminQueryKey(resource: string, ...parts: Array<string | number | null | undefined>) {
  return ['system-admin', resource, ...parts] as const;
}
