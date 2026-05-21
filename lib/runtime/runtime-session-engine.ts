'use client';

import { emitRuntimeEvent } from '@/lib/pos-runtime/runtime-event-bus';
import type { SessionState } from '@/lib/session-store';
import {
  createRuntimePermissionEnvelope,
  resolveBranchRuntimeScope,
  resolveTenantRuntimeScope,
  type BranchRuntimeScope,
  type RuntimePermissionEnvelope,
  type TenantRuntimeScope,
} from '@/lib/runtime/tenant-runtime-context';

export type RuntimeSessionContext = {
  tenant: TenantRuntimeScope;
  branch: BranchRuntimeScope;
  user: SessionState['currentUser'];
  permissions: RuntimePermissionEnvelope;
  hydratedAt: string;
};

export type AuthorizedBridgeSession = {
  authorized: boolean;
  tenantId: string;
  branchId: string;
  userRole: string;
  reason?: string;
};

export type BridgeRuntimeHandshake = {
  bridgeId: string;
  deviceId?: string;
  tenantId?: string;
  branchId?: string;
  requestedAt: string;
};

export type RuntimeSessionHydrationResult = {
  ok: boolean;
  context: RuntimeSessionContext;
  reason?: string;
};

export function hydrateRuntimeSessionContext(input: {
  session: SessionState;
  permissions: string[];
}) {
  const context = {
    tenant: resolveTenantRuntimeScope(input.session),
    branch: resolveBranchRuntimeScope(input.session),
    user: input.session.currentUser,
    permissions: createRuntimePermissionEnvelope({
      role: input.session.currentUser.role,
      permissions: input.permissions,
    }),
    hydratedAt: new Date().toISOString(),
  } satisfies RuntimeSessionContext;

  return {
    ok: context.tenant.isAuthenticated,
    context,
    reason: context.tenant.isAuthenticated ? undefined : 'unauthenticated_runtime_session',
  } satisfies RuntimeSessionHydrationResult;
}

export function traceRuntimeSessionHydrated(result: RuntimeSessionHydrationResult) {
  emitRuntimeEvent({
    type: 'runtime session hydrated',
    channel: 'pos-runtime',
    payload: {
      tenantId: result.context.tenant.tenantId,
      branchId: result.context.branch.branchId,
      role: result.context.user.role,
      isAuthenticated: result.context.tenant.isAuthenticated,
      permissionCount: result.context.permissions.permissions.length,
      ok: result.ok,
      reason: result.reason,
    },
  });
}

export function authorizeBridgeRuntimeSession(input: {
  context: RuntimeSessionContext;
  handshake: BridgeRuntimeHandshake;
}) {
  const tenantMatches = !input.handshake.tenantId || input.handshake.tenantId === input.context.tenant.tenantId;
  const branchMatches = !input.handshake.branchId || input.handshake.branchId === input.context.branch.branchId || input.context.branch.branchMode === 'all';
  const authorized = input.context.tenant.isAuthenticated && tenantMatches && branchMatches;
  const result = {
    authorized,
    tenantId: input.context.tenant.tenantId,
    branchId: input.context.branch.branchId,
    userRole: input.context.user.role,
    reason: authorized
      ? undefined
      : !input.context.tenant.isAuthenticated
        ? 'unauthenticated_runtime_session'
        : !tenantMatches
          ? 'tenant_mismatch'
          : 'branch_mismatch',
  } satisfies AuthorizedBridgeSession;

  emitRuntimeEvent({
    type: authorized ? 'bridge session authorized' : 'unauthorized bridge rejected',
    channel: 'pos-runtime',
    payload: {
      bridgeId: input.handshake.bridgeId,
      deviceId: input.handshake.deviceId,
      ...result,
    },
  });

  return result;
}
