/**
 * ADISYUM Enterprise Audit Trail
 * Who changed what, before/after snapshots, critical config & permission changes.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditCategory =
  | 'tenant_config'
  | 'tenant_permission'
  | 'printer_config'
  | 'package_change'
  | 'refund_cancel'
  | 'admin_action'
  | 'auth_event'
  | 'data_export'
  | 'system_config'
  | 'user_change';

export type AuditEntry = {
  id: string;
  category: AuditCategory;
  action: string;
  actorId: string;
  actorRole: string;
  tenantId?: string;
  resourceId?: string;
  resourceType?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  diff?: Record<string, { before: unknown; after: unknown }>;
  ip?: string;
  userAgent?: string;
  at: string;
  note?: string;
};

// ─── Singleton ────────────────────────────────────────────────────────────────

const MAX_AUDIT_ENTRIES = 10000;

const g = globalThis as typeof globalThis & {
  __adisyumAudit?: AuditEntry[];
};

function getStore(): AuditEntry[] {
  if (!g.__adisyumAudit) g.__adisyumAudit = [];
  return g.__adisyumAudit;
}

function uid() { return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function nowIso() { return new Date().toISOString(); }

// ─── Diff Computation ─────────────────────────────────────────────────────────

function computeDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Record<string, { before: unknown; after: unknown }> | undefined {
  if (!before || !after) return undefined;

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { before: before[key], after: after[key] };
    }
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

// ─── Core Audit Function ──────────────────────────────────────────────────────

export function audit(input: {
  category: AuditCategory;
  action: string;
  actorId: string;
  actorRole: string;
  tenantId?: string;
  resourceId?: string;
  resourceType?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  note?: string;
}): AuditEntry {
  const store = getStore();
  const diff = computeDiff(input.before, input.after);

  const entry: AuditEntry = {
    id: uid(),
    category: input.category,
    action: input.action,
    actorId: input.actorId,
    actorRole: input.actorRole,
    tenantId: input.tenantId,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    before: input.before,
    after: input.after,
    diff,
    ip: input.ip,
    userAgent: input.userAgent,
    at: nowIso(),
    note: input.note,
  };

  store.unshift(entry);
  if (store.length > MAX_AUDIT_ENTRIES) store.splice(MAX_AUDIT_ENTRIES);

  return entry;
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

export function auditTenantConfigChange(
  actorId: string,
  tenantId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ctx?: { ip?: string; note?: string },
) {
  return audit({
    category: 'tenant_config',
    action: 'tenant.config.updated',
    actorId,
    actorRole: 'super_admin',
    tenantId,
    resourceType: 'tenant',
    resourceId: tenantId,
    before,
    after,
    ...ctx,
  });
}

export function auditPermissionChange(
  actorId: string,
  tenantId: string,
  userId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return audit({
    category: 'tenant_permission',
    action: 'user.permission.changed',
    actorId,
    actorRole: 'super_admin',
    tenantId,
    resourceType: 'user',
    resourceId: userId,
    before,
    after,
  });
}

export function auditPrinterChange(
  actorId: string,
  tenantId: string,
  printerName: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return audit({
    category: 'printer_config',
    action: 'printer.config.changed',
    actorId,
    actorRole: 'tenant_admin',
    tenantId,
    resourceType: 'printer',
    resourceId: printerName,
    before,
    after,
  });
}

export function auditRefundOrCancel(
  actorId: string,
  tenantId: string,
  orderId: string,
  type: 'refund' | 'cancel',
  amount: number,
  reason?: string,
) {
  return audit({
    category: 'refund_cancel',
    action: `order.${type}`,
    actorId,
    actorRole: 'cashier',
    tenantId,
    resourceType: 'order',
    resourceId: orderId,
    after: { type, amount, reason },
    note: reason,
  });
}

export function auditPackageChange(
  actorId: string,
  tenantId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return audit({
    category: 'package_change',
    action: 'tenant.package.changed',
    actorId,
    actorRole: 'super_admin',
    tenantId,
    resourceType: 'package',
    before,
    after,
  });
}

export function auditAuthEvent(
  actorId: string,
  action: 'login' | 'logout' | 'token_refresh' | 'password_reset',
  tenantId?: string,
  ip?: string,
) {
  return audit({
    category: 'auth_event',
    action: `auth.${action}`,
    actorId,
    actorRole: 'user',
    tenantId,
    ip,
  });
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export function getAuditTrail(filter?: {
  tenantId?: string;
  category?: AuditCategory;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): AuditEntry[] {
  let entries = getStore();

  if (filter?.tenantId) entries = entries.filter((e) => e.tenantId === filter.tenantId);
  if (filter?.category) entries = entries.filter((e) => e.category === filter.category);
  if (filter?.actorId) entries = entries.filter((e) => e.actorId === filter.actorId);
  if (filter?.from) {
    const from = new Date(filter.from).getTime();
    entries = entries.filter((e) => new Date(e.at).getTime() >= from);
  }
  if (filter?.to) {
    const to = new Date(filter.to).getTime();
    entries = entries.filter((e) => new Date(e.at).getTime() <= to);
  }

  return entries.slice(0, filter?.limit ?? 200);
}

export function getAuditStats() {
  const entries = getStore();
  const last24h = entries.filter((e) => Date.now() - new Date(e.at).getTime() < 86400000);

  return {
    total: entries.length,
    last24h: last24h.length,
    byCategory: last24h.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    }, {}),
    sensitiveActions: last24h.filter((e) =>
      ['refund_cancel', 'tenant_permission', 'system_config', 'data_export'].includes(e.category),
    ).length,
  };
}
