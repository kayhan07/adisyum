import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

const ONLINE_WINDOW_MS = 90_000;
const IDLE_WINDOW_MS = 5 * 60_000;

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
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
  return prisma.operationalEvent.create({
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
  await expireStalePresence();
  const [presence, devices, events, activeTables, activeOrders, failedLogins] = await Promise.all([
    prisma.presenceSession.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 250 }),
    prisma.deviceHeartbeat.findMany({ orderBy: { lastHeartbeatAt: 'desc' }, take: 250 }),
    prisma.operationalEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 120 }),
    prisma.order.groupBy({ by: ['tenantId'], where: { status: 'open', orderNo: { startsWith: 'TABLE-' } }, _count: { id: true } }),
    prisma.order.count({ where: { status: 'open' } }),
    prisma.auditLog.count({ where: { action: 'failed_login', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);
  const onlinePresence = presence.filter((item) => item.status === 'online');
  return {
    summary: {
      onlineTenants: new Set(onlinePresence.map((item) => item.tenantId)).size,
      onlineUsers: onlinePresence.length,
      onlineBranches: new Set(onlinePresence.map((item) => `${item.tenantId}:${item.branchId ?? '-'}`)).size,
      activeDevices: devices.filter((item) => item.status === 'online').length,
      activeTables: activeTables.reduce((sum, item) => sum + item._count.id, 0),
      activeOrders,
      failedLogins24h: failedLogins,
    },
    presence,
    devices,
    events,
    activeTablesByTenant: activeTables.map((item) => ({ tenantId: item.tenantId, count: item._count.id })),
  };
}
