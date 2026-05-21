'use client';

import type { BranchOption, SessionState } from '@/lib/session-store';

export type TenantRuntimeScope = {
  tenantId: string;
  packageType: SessionState['packageType'];
  subscriptionEndDate: string;
  isAuthenticated: boolean;
};

export type BranchRuntimeScope = {
  branchId: string;
  branchLabel: string;
  branchMode: 'all' | 'single';
};

export type RuntimePermissionEnvelope = {
  permissions: string[];
  role: string;
  can: (permission: string) => boolean;
};

export function resolveTenantRuntimeScope(session: SessionState): TenantRuntimeScope {
  return {
    tenantId: session.tenantId,
    packageType: session.packageType,
    subscriptionEndDate: session.subscriptionEndDate,
    isAuthenticated: session.isAuthenticated,
  } satisfies TenantRuntimeScope;
}

export function resolveBranchRuntimeScope(session: SessionState): BranchRuntimeScope {
  const branch = session.branches.find((item) => item.id === session.activeBranchId)
    ?? session.branches.find((item) => item.id === session.currentUser.branchId)
    ?? session.branches[0]
    ?? ({ id: session.activeBranchId, label: session.activeBranchId } as BranchOption);
  return {
    branchId: branch.id,
    branchLabel: branch.label,
    branchMode: branch.id === 'all' ? 'all' : 'single',
  } satisfies BranchRuntimeScope;
}

export function createRuntimePermissionEnvelope(input: {
  role: string;
  permissions: string[];
}) {
  return {
    role: input.role,
    permissions: input.permissions,
    can: (permission: string) => input.permissions.includes(permission),
  } satisfies RuntimePermissionEnvelope;
}
