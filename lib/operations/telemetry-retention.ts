import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export const TELEMETRY_RETENTION = {
  presenceDays: 90,
  heartbeatDays: 7,
  normalEventDays: 30,
  criticalEventDays: 365,
} as const;
const GLOBAL_TENANT_BUCKET = 'global';

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function startOfHour(value = new Date()) {
  const next = new Date(value);
  next.setMinutes(0, 0, 0);
  return next;
}

function startOfDay(value = new Date()) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function aggregateOperationalTelemetry(now = new Date()) {
  const hourStart = startOfHour(now);
  const previousHourStart = new Date(hourStart.getTime() - 60 * 60 * 1000);
  const dayStart = startOfDay(now);
  const previousDayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);

  const [hourlyEvents, hourlyPresence, hourlyDevices, dailyEvents] = await Promise.all([
    prisma.operationalEvent.groupBy({
      by: ['tenantId', 'type'],
      where: { createdAt: { gte: previousHourStart, lt: hourStart } },
      _count: { id: true },
    }),
    prisma.presenceSession.groupBy({
      by: ['tenantId', 'status'],
      where: { lastSeenAt: { gte: previousHourStart, lt: hourStart } },
      _count: { id: true },
      _avg: { heartbeatLatency: true },
    }),
    prisma.deviceHeartbeat.groupBy({
      by: ['tenantId', 'status'],
      where: { lastHeartbeatAt: { gte: previousHourStart, lt: hourStart } },
      _count: { id: true },
      _avg: { latencyMs: true },
    }),
    prisma.operationalEvent.groupBy({
      by: ['tenantId', 'severity'],
      where: { createdAt: { gte: previousDayStart, lt: dayStart } },
      _count: { id: true },
    }),
  ]);

  type MetricWrite = {
    tenantId: string;
    bucketStart: Date;
    bucketSize: string;
    metricType: string;
    eventCount: number;
    sampleCount: number;
    numericValue?: number | null;
    metadata: Prisma.InputJsonValue;
  };
  const writes: MetricWrite[] = [
    ...hourlyEvents.map((row) => ({
      tenantId: row.tenantId ?? GLOBAL_TENANT_BUCKET,
      bucketStart: previousHourStart,
      bucketSize: 'hour',
      metricType: `event.${row.type}`,
      eventCount: row._count.id,
      sampleCount: row._count.id,
      metadata: json({ type: row.type }),
    })),
    ...hourlyPresence.map((row) => ({
      tenantId: row.tenantId,
      bucketStart: previousHourStart,
      bucketSize: 'hour',
      metricType: `presence.${row.status}`,
      eventCount: row._count.id,
      sampleCount: row._count.id,
      numericValue: row._avg.heartbeatLatency ?? undefined,
      metadata: json({ status: row.status }),
    })),
    ...hourlyDevices.map((row) => ({
      tenantId: row.tenantId,
      bucketStart: previousHourStart,
      bucketSize: 'hour',
      metricType: `device.${row.status}`,
      eventCount: row._count.id,
      sampleCount: row._count.id,
      numericValue: row._avg.latencyMs ?? undefined,
      metadata: json({ status: row.status }),
    })),
    ...dailyEvents.map((row) => ({
      tenantId: row.tenantId ?? GLOBAL_TENANT_BUCKET,
      bucketStart: previousDayStart,
      bucketSize: 'day',
      metricType: `events.${row.severity}`,
      eventCount: row._count.id,
      sampleCount: row._count.id,
      metadata: json({ severity: row.severity }),
    })),
  ];

  await Promise.all(writes.map((row) => prisma.operationalMetricBucket.upsert({
    where: {
      tenantId_bucketStart_bucketSize_metricType: {
        tenantId: row.tenantId,
        bucketStart: row.bucketStart,
        bucketSize: row.bucketSize,
        metricType: row.metricType,
      },
    },
    update: {
      eventCount: row.eventCount,
      sampleCount: row.sampleCount,
      numericValue: row.numericValue,
      metadata: row.metadata,
    },
    create: row,
  })));

  return { bucketsWritten: writes.length, previousHourStart, previousDayStart };
}

export async function runTelemetryRetention(now = new Date()) {
  const run = await prisma.telemetryArchiveRun.create({
    data: { kind: 'retention', status: 'running', metadata: { retention: TELEMETRY_RETENTION } },
  });
  try {
    const [presence, heartbeats, normalEvents, criticalEvents] = await Promise.all([
      prisma.presenceSession.deleteMany({ where: { lastSeenAt: { lt: daysAgo(TELEMETRY_RETENTION.presenceDays) } } }),
      prisma.deviceHeartbeat.deleteMany({ where: { lastHeartbeatAt: { lt: daysAgo(TELEMETRY_RETENTION.heartbeatDays) } } }),
      prisma.operationalEvent.deleteMany({
        where: {
          severity: { notIn: ['critical'] },
          createdAt: { lt: daysAgo(TELEMETRY_RETENTION.normalEventDays) },
        },
      }),
      prisma.operationalEvent.deleteMany({
        where: {
          severity: 'critical',
          createdAt: { lt: daysAgo(TELEMETRY_RETENTION.criticalEventDays) },
        },
      }),
    ]);
    return prisma.telemetryArchiveRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        presenceDeleted: presence.count,
        heartbeatsDeleted: heartbeats.count,
        eventsDeleted: normalEvents.count + criticalEvents.count,
        completedAt: now,
      },
    });
  } catch (error) {
    await prisma.telemetryArchiveRun.update({
      where: { id: run.id },
      data: { status: 'failed', completedAt: now, metadata: json({ error: error instanceof Error ? error.message : String(error) }) },
    });
    throw error;
  }
}

export async function getHistoricalOperationalMetrics(days = 7) {
  return prisma.operationalMetricBucket.findMany({
    where: { bucketStart: { gte: daysAgo(days) } },
    orderBy: [{ bucketStart: 'desc' }, { metricType: 'asc' }],
    take: 1000,
  });
}
