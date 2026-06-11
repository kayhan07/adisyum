import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { appendIncidentEvent, openOrUpdateIncident } from '@/lib/incidents/durable-incident-center';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

const ONLINE_WINDOW_MS = 90_000;
const IDLE_WINDOW_MS = 5 * 60_000;
const DUPLICATE_EVENT_WINDOW_MS = 60_000;
const SNAPSHOT_CACHE_MS = 2_500;

type LiveOpsGlobalState = typeof globalThis & {
  __adisyumLiveOpsSnapshot?: { expiresAt: number; value: Awaited<ReturnType<typeof buildLiveOperationsSnapshot>> };
};
const liveOpsGlobalState = globalThis as LiveOpsGlobalState;

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonValueLike;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function findSessionByRawToken(token: string) {
  return prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, tenantId: true, userId: true, branchId: true, ip: true, userAgent: true, createdAt: true },
  });
}

export async function recordOperationalEvent(input: {
  tenantId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  type: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  entity?: string;
  entityId?: string;
  source?: string;
  metadata?: unknown;
}) {
  if ((input.severity ?? 'info') !== 'critical') {
    const duplicate = await prisma.operationalEvent.findFirst({
      where: {
        tenantId: input.tenantId ?? null,
        type: input.type,
        source: input.source ?? 'runtime',
        message: input.message,
        entityId: input.entityId,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_EVENT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (duplicate) return duplicate;
  }
  const event = await prisma.operationalEvent.create({
    data: {
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      type: input.type,
      severity: input.severity ?? 'info',
      message: input.message,
      entity: input.entity,
      entityId: input.entityId,
      source: input.source ?? 'runtime',
      metadata: json(input.metadata),
    },
  });
  if ((input.severity === 'critical' || input.severity === 'error') && input.tenantId) {
    const metadata = (input.metadata ?? {}) as Record<string, unknown>;
    const correlationId = typeof metadata.correlationId === 'string' ? metadata.correlationId : null;
    const incident = await openOrUpdateIncident({
      incidentKey: `${input.tenantId}:${input.type}:${input.entityId ?? 'global'}`,
      tenantId: input.tenantId,
      branchId: input.branchId,
      type: input.type,
      severity: input.severity === 'critical' ? 'critical' : 'degraded',
      title: input.message,
      summary: input.message,
      correlationId,
      blastRadius: { tenantId: input.tenantId, branchId: input.branchId ?? null, entityId: input.entityId ?? null },
      metadata: input.metadata,
    });
    await appendIncidentEvent({
      incidentId: incident.id,
      eventType: input.type,
      severity: input.severity === 'critical' ? 'critical' : 'degraded',
      message: input.message,
      actorId: input.userId,
      correlationId,
      metadata: { operationalEventId: event.id, source: input.source ?? 'runtime' },
    });
  }
  return event;
}

export async function upsertPresence(input: {
  sessionId: string;
  tenantId: string;
  branchId?: string | null;
  userId: string;
  username: string;
  role: string;
  deviceType?: string | null;
  browser?: string | null;
  os?: string | null;
  ip?: string | null;
  currentRoute?: string | null;
  activeTableId?: string | null;
  heartbeatLatency?: number | null;
  metadata?: unknown;
}) {
  const now = new Date();
  return prisma.presenceSession.upsert({
    where: { sessionId: input.sessionId },
    update: {
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      userId: input.userId,
      username: input.username,
      role: input.role,
      deviceType: input.deviceType ?? null,
      browser: input.browser ?? null,
      os: input.os ?? null,
      ip: input.ip ?? null,
      currentRoute: input.currentRoute ?? null,
      activeTableId: input.activeTableId ?? null,
      heartbeatLatency: input.heartbeatLatency ?? null,
      lastSeenAt: now,
      disconnectedAt: null,
      status: 'online',
      metadata: json(input.metadata),
    },
    create: {
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      userId: input.userId,
      username: input.username,
      role: input.role,
      deviceType: input.deviceType ?? null,
      browser: input.browser ?? null,
      os: input.os ?? null,
      ip: input.ip ?? null,
      currentRoute: input.currentRoute ?? null,
      activeTableId: input.activeTableId ?? null,
      heartbeatLatency: input.heartbeatLatency ?? null,
      loginAt: now,
      lastSeenAt: now,
      metadata: json(input.metadata),
    },
  });
}

export async function touchDeviceHeartbeat(input: {
  tenantId: string;
  branchId?: string | null;
  deviceId: string;
  deviceType: string;
  latencyMs?: number | null;
  status?: string;
  failureCount?: number;
  metadata?: unknown;
}) {
  return prisma.deviceHeartbeat.upsert({
    where: { tenantId_deviceId: { tenantId: input.tenantId, deviceId: input.deviceId } },
    update: {
      branchId: input.branchId ?? null,
      deviceType: input.deviceType,
      status: input.status ?? 'online',
      latencyMs: input.latencyMs ?? null,
      failureCount: input.failureCount ?? 0,
      lastHeartbeatAt: new Date(),
      metadata: json(input.metadata),
    },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      deviceId: input.deviceId,
      deviceType: input.deviceType,
      status: input.status ?? 'online',
      latencyMs: input.latencyMs ?? null,
      failureCount: input.failureCount ?? 0,
      metadata: json(input.metadata),
    },
  });
}

export async function expireStalePresence() {
  const now = Date.now();
  await prisma.presenceSession.updateMany({
    where: { lastSeenAt: { lt: new Date(now - IDLE_WINDOW_MS) }, status: { not: 'disconnected' } },
    data: { status: 'disconnected', disconnectedAt: new Date() },
  });
  await prisma.presenceSession.updateMany({
    where: {
      lastSeenAt: { lt: new Date(now - ONLINE_WINDOW_MS), gte: new Date(now - IDLE_WINDOW_MS) },
      status: 'online',
    },
    data: { status: 'idle' },
  });
}

export async function getLiveOperationsSnapshot() {
  const cached = liveOpsGlobalState.__adisyumLiveOpsSnapshot;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await buildLiveOperationsSnapshot();
  liveOpsGlobalState.__adisyumLiveOpsSnapshot = { expiresAt: Date.now() + SNAPSHOT_CACHE_MS, value };
  return value;
}

async function buildLiveOperationsSnapshot() {
  await expireStalePresence();
  const [presence, devices, events, activeTables, activeOrders, failedLogins] = await Promise.all([
    prisma.presenceSession.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 250 }),
    prisma.deviceHeartbeat.findMany({ orderBy: { lastHeartbeatAt: 'desc' }, take: 250 }),
    prisma.operationalEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 120 }),
    prisma.order.groupBy({ by: ['tenantId'], where: { status: 'open', orderNo: { startsWith: 'TABLE-' } }, _count: { id: true } }),
    prisma.order.count({ where: { status: 'open' } }),
    prisma.auditLog.count({ where: { action: 'failed_login', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);
  const onlinePresence = presence.filter((item: { status: string }) => item.status === 'online');
  return {
    summary: {
      onlineTenants: new Set(onlinePresence.map((item: { tenantId: string }) => item.tenantId)).size,
      onlineUsers: onlinePresence.length,
      onlineBranches: new Set(onlinePresence.map((item: { tenantId: string; branchId?: string | null }) => `${item.tenantId}:${item.branchId ?? '-'}`)).size,
      activeDevices: devices.filter((item: { status: string }) => item.status === 'online').length,
      activeTables: activeTables.reduce((sum: number, item: { _count: { id: number } }) => sum + item._count.id, 0),
      activeOrders,
      failedLogins24h: failedLogins,
    },
    presence,
    devices,
    events,
    activeTablesByTenant: activeTables.map((item: { tenantId: string; _count: { id: number } }) => ({ tenantId: item.tenantId, count: item._count.id })),
  };
}
