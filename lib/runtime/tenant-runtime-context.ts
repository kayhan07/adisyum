'use client';

import { emitRuntimeEvent } from '@/lib/pos-runtime/runtime-event-bus';
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
  const scope = {
    tenantId: session.tenantId,
    packageType: session.packageType,
    subscriptionEndDate: session.subscriptionEndDate,
    isAuthenticated: session.isAuthenticated,
  } satisfies TenantRuntimeScope;
  emitRuntimeEvent({
    type: 'tenant scope resolved',
    channel: 'pos-runtime',
    payload: scope,
  });
  return scope;
}

export function resolveBranchRuntimeScope(session: SessionState): BranchRuntimeScope {
  const branch = session.branches.find((item) => item.id === session.activeBranchId)
    ?? session.branches.find((item) => item.id === session.currentUser.branchId)
    ?? session.branches[0]
    ?? ({ id: session.activeBranchId, label: session.activeBranchId } as BranchOption);
  const scope = {
    branchId: branch.id,
    branchLabel: branch.label,
    branchMode: branch.id === 'all' ? 'all' : 'single',
  } satisfies BranchRuntimeScope;
  emitRuntimeEvent({
    type: 'branch isolation verified',
    channel: 'pos-runtime',
    payload: scope,
  });
  return scope;
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
