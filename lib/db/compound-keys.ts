export function branchTenantBranchKey(tenantId: string, branchId: string) {
  return { tenantId_branchId: { tenantId, branchId } } as const;
}

export function branchTenantIdKey(tenantId: string, id: string) {
  return { tenantId_id: { tenantId, id } } as const;
}

export function permissionTenantKey(tenantId: string, key: string) {
  return { tenantId_key: { tenantId, key } } as const;
}

export function roleTenantKey(tenantId: string, key: string) {
  return { tenantId_key: { tenantId, key } } as const;
}

export function runtimeStateTenantKey(tenantId: string, key: string) {
  return { tenantId_key: { tenantId, key } } as const;
}

export function subscriptionTenantIdKey(tenantId: string, id: string) {
  return { tenantId_id: { tenantId, id } } as const;
}

export function userPermissionTenantKey(tenantId: string, userId: string, permissionId: string) {
  return { tenantId_userId_permissionId: { tenantId, userId, permissionId } } as const;
}

export function userRoleTenantKey(tenantId: string, userId: string, roleId: string) {
  return { tenantId_userId_roleId: { tenantId, userId, roleId } } as const;
}

export function rolePermissionTenantKey(tenantId: string, roleId: string, permissionId: string) {
  return { tenantId_roleId_permissionId: { tenantId, roleId, permissionId } } as const;
}

export function userTenantIdKey(tenantId: string, id: string) {
  return { tenantId_id: { tenantId, id } } as const;
}

export function userTenantUsernameKey(tenantId: string, username: string) {
  return { tenantId_username: { tenantId, username } } as const;
}
