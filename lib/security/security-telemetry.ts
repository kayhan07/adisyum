/**
 * ADISYUM Security Observability
 * Tracks brute force, suspicious API usage, token abuse, admin anomalies.
 */

import { alertCritical, alertEmergency, alertWarning } from '@/lib/alerts/alert-engine';
import { recordStructuredLog } from '@/lib/observability/metrics-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'brute_force'
  | 'suspicious_api'
  | 'unusual_tenant_access'
  | 'token_abuse'
  | 'excessive_failed_auth'
  | 'abnormal_admin_action'
  | 'rate_limit_exceeded'
  | 'unusual_ip_access';

export type SecurityEvent = {
  id: string;
  type: SecurityEventType;
  tenantId?: string;
  ip?: string;
  userId?: string;
  detectedAt: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  context?: Record<string, unknown>;
};

// ─── Singleton ────────────────────────────────────────────────────────────────

const MAX_EVENTS = 5000;

const g = globalThis as typeof globalThis & {
  __adisyumSecurity?: {
    events: SecurityEvent[];
    authAttempts: Record<string, { count: number; firstAt: number; lastAt: number }>;
    apiUsage: Record<string, { count: number; window: number }>;
    blockedIps: Set<string>;
  };
};

function getState() {
  if (!g.__adisyumSecurity) {
    g.__adisyumSecurity = {
      events: [],
      authAttempts: {},
      apiUsage: {},
      blockedIps: new Set(),
    };
  }
  return g.__adisyumSecurity;
}

function uid() { return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function nowIso() { return new Date().toISOString(); }

// ─── Record Security Event ────────────────────────────────────────────────────

async function recordSecurityEvent(event: Omit<SecurityEvent, 'id' | 'detectedAt'>): Promise<SecurityEvent> {
  const state = getState();
  const full: SecurityEvent = { ...event, id: uid(), detectedAt: nowIso() };

  state.events.unshift(full);
  if (state.events.length > MAX_EVENTS) state.events.splice(MAX_EVENTS);

  recordStructuredLog({
    level: event.severity === 'low' ? 'warn' : 'error',
    message: `[SECURITY:${event.type}] ${event.description}`,
    tenantId: event.tenantId,
    service: 'security',
    context: { ip: event.ip, userId: event.userId, ...event.context },
  });

  if (event.severity === 'critical') {
    await alertEmergency(`Security: ${event.type}`, event.description, { tenantId: event.tenantId, service: 'security' });
  } else if (event.severity === 'high') {
    await alertCritical(`Security: ${event.type}`, event.description, { tenantId: event.tenantId, service: 'security' });
  } else if (event.severity === 'medium') {
    await alertWarning(`Security: ${event.type}`, event.description, { tenantId: event.tenantId, service: 'security' });
  }

  return full;
}

// ─── Brute Force Detection ────────────────────────────────────────────────────

const BRUTE_FORCE_WINDOW_MS = 5 * 60 * 1000; // 5 min
const BRUTE_FORCE_THRESHOLD = 10;
const BLOCK_THRESHOLD = 20;

export async function trackFailedAuth(ip: string, tenantId?: string, userId?: string): Promise<boolean> {
  const state = getState();
  const key = `${ip}:${tenantId ?? '*'}`;
  const now = Date.now();

  if (!state.authAttempts[key]) {
    state.authAttempts[key] = { count: 0, firstAt: now, lastAt: now };
  }

  const record = state.authAttempts[key];

  // Reset window if expired
  if (now - record.firstAt > BRUTE_FORCE_WINDOW_MS) {
    record.count = 0;
    record.firstAt = now;
  }

  record.count += 1;
  record.lastAt = now;

  if (record.count >= BLOCK_THRESHOLD) {
    state.blockedIps.add(ip);
    await recordSecurityEvent({
      type: 'brute_force',
      tenantId,
      ip,
      userId,
      severity: 'critical',
      blocked: true,
      description: `Brute force detected: ${record.count} failed auth attempts from ${ip} in ${Math.round(BRUTE_FORCE_WINDOW_MS / 60000)} minutes. IP blocked.`,
      context: { attempts: record.count, windowMs: BRUTE_FORCE_WINDOW_MS },
    });
    return true; // blocked
  }

  if (record.count >= BRUTE_FORCE_THRESHOLD) {
    await recordSecurityEvent({
      type: 'excessive_failed_auth',
      tenantId,
      ip,
      userId,
      severity: 'high',
      blocked: false,
      description: `Excessive failed auth: ${record.count} attempts from ${ip}`,
      context: { attempts: record.count },
    });
  }

  return false;
}

export function isIpBlocked(ip: string): boolean {
  return getState().blockedIps.has(ip);
}

export function unblockIp(ip: string) {
  getState().blockedIps.delete(ip);
}

// ─── API Rate / Abuse Tracking ────────────────────────────────────────────────

const API_RATE_THRESHOLD_PER_MIN = 300;

export async function trackApiUsage(ip: string, route: string, tenantId?: string) {
  const state = getState();
  const key = `${ip}:${route}`;
  const now = Date.now();

  if (!state.apiUsage[key] || now - state.apiUsage[key].window > 60000) {
    state.apiUsage[key] = { count: 0, window: now };
  }

  state.apiUsage[key].count += 1;

  if (state.apiUsage[key].count > API_RATE_THRESHOLD_PER_MIN) {
    await recordSecurityEvent({
      type: 'rate_limit_exceeded',
      tenantId,
      ip,
      severity: 'medium',
      blocked: false,
      description: `Rate limit: ${state.apiUsage[key].count} requests/min to ${route} from ${ip}`,
      context: { route, count: state.apiUsage[key].count },
    });
  }
}

// ─── Suspicious Tenant Access ─────────────────────────────────────────────────

export async function trackCrossTenantAccess(requestingTenantId: string, targetTenantId: string, route: string) {
  if (requestingTenantId === targetTenantId) return;

  await recordSecurityEvent({
    type: 'unusual_tenant_access',
    tenantId: requestingTenantId,
    severity: 'high',
    blocked: false,
    description: `Cross-tenant access attempt: tenant '${requestingTenantId}' accessing '${targetTenantId}' data on ${route}`,
    context: { requestingTenantId, targetTenantId, route },
  });
}

// ─── Admin Action Tracking ────────────────────────────────────────────────────

export async function trackAdminAction(adminId: string, action: string, context?: Record<string, unknown>) {
  // Only flag unusual patterns
  const SENSITIVE_ACTIONS = ['delete_tenant', 'reset_password', 'grant_permission', 'bulk_delete', 'export_data'];

  if (SENSITIVE_ACTIONS.some((s) => action.toLowerCase().includes(s))) {
    await recordSecurityEvent({
      type: 'abnormal_admin_action',
      userId: adminId,
      severity: 'medium',
      blocked: false,
      description: `Sensitive admin action: '${action}' by admin ${adminId}`,
      context: { action, ...context },
    });
  }
}

// ─── Token Abuse Detection ────────────────────────────────────────────────────

export async function trackTokenAbuse(token: string, ip: string, tenantId?: string, reason = 'invalid_signature') {
  await recordSecurityEvent({
    type: 'token_abuse',
    tenantId,
    ip,
    severity: 'high',
    blocked: false,
    description: `Invalid/abused token from ${ip}: ${reason}`,
    context: { tokenPrefix: token.slice(0, 12) + '…', reason },
  });
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export function getSecurityEvents(limit = 100): SecurityEvent[] {
  return getState().events.slice(0, limit);
}

export function getSecurityEventsByTenant(tenantId: string): SecurityEvent[] {
  return getState().events.filter((e) => e.tenantId === tenantId);
}

export function getSecurityStats() {
  const events = getState().events;
  const last24h = events.filter((e) => Date.now() - new Date(e.detectedAt).getTime() < 86400000);
  const blockedIps = getState().blockedIps;

  return {
    total: events.length,
    last24h: last24h.length,
    blockedIps: blockedIps.size,
    bySeverity: {
      critical: last24h.filter((e) => e.severity === 'critical').length,
      high: last24h.filter((e) => e.severity === 'high').length,
      medium: last24h.filter((e) => e.severity === 'medium').length,
      low: last24h.filter((e) => e.severity === 'low').length,
    },
    byType: last24h.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export function getBlockedIps(): string[] {
  return Array.from(getState().blockedIps);
}
