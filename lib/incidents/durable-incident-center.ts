import { prisma } from '@/lib/db/prisma';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

type IncidentSeverity = 'info' | 'warning' | 'degraded' | 'critical' | 'outage';
type IncidentStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved';

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonValueLike;
}

export async function openOrUpdateIncident(input: {
  incidentKey: string;
  tenantId?: string | null;
  branchId?: string | null;
  type: string;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  correlationId?: string | null;
  blastRadius?: unknown;
  metadata?: unknown;
}) {
  return prisma.operationalIncident.upsert({
    where: { incidentKey: input.incidentKey },
    update: {
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      type: input.type,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      correlationId: input.correlationId ?? null,
      blastRadius: json(input.blastRadius),
      metadata: json(input.metadata),
      status: { set: 'open' },
      resolvedAt: null,
    },
    create: {
      incidentKey: input.incidentKey,
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      type: input.type,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      correlationId: input.correlationId ?? null,
      blastRadius: json(input.blastRadius),
      metadata: json(input.metadata),
    },
  });
}

export async function appendIncidentEvent(input: {
  incidentId: string;
  eventType: string;
  severity?: IncidentSeverity;
  message: string;
  actorId?: string | null;
  deviceId?: string | null;
  queueJobId?: string | null;
  orchestrationJobId?: string | null;
  correlationId?: string | null;
  metadata?: unknown;
}) {
  return prisma.operationalIncidentEvent.create({
    data: {
      incidentId: input.incidentId,
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      message: input.message,
      actorId: input.actorId ?? null,
      deviceId: input.deviceId ?? null,
      queueJobId: input.queueJobId ?? null,
      orchestrationJobId: input.orchestrationJobId ?? null,
      correlationId: input.correlationId ?? null,
      metadata: json(input.metadata),
    },
  });
}

export async function listIncidents(input?: { tenantId?: string; status?: IncidentStatus; limit?: number }) {
  return prisma.operationalIncident.findMany({
    where: {
      tenantId: input?.tenantId,
      status: input?.status,
    },
    include: {
      events: { orderBy: { createdAt: 'desc' }, take: 12 },
    },
    orderBy: { updatedAt: 'desc' },
    take: input?.limit ?? 80,
  });
}

export async function getIncidentWithTimeline(id: string) {
  return prisma.operationalIncident.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function acknowledgeIncident(id: string, operatorId: string) {
  const incident = await prisma.operationalIncident.update({
    where: { id },
    data: { status: 'acknowledged', acknowledgedBy: operatorId, acknowledgedAt: new Date() },
  });
  await appendIncidentEvent({
    incidentId: id,
    eventType: 'acknowledged',
    message: `Incident acknowledged by ${operatorId}`,
    actorId: operatorId,
  });
  return incident;
}

export async function resolveIncident(id: string, operatorId: string, resolutionNotes?: string) {
  const incident = await prisma.operationalIncident.update({
    where: { id },
    data: { status: 'resolved', resolvedAt: new Date(), resolutionNotes: resolutionNotes ?? null },
  });
  await appendIncidentEvent({
    incidentId: id,
    eventType: 'resolved',
    message: resolutionNotes ? `Resolved: ${resolutionNotes}` : `Resolved by ${operatorId}`,
    actorId: operatorId,
  });
  return incident;
}

export async function buildIncidentSummary() {
  const [total, open, critical, outage] = await Promise.all([
    prisma.operationalIncident.count(),
    prisma.operationalIncident.count({ where: { status: { not: 'resolved' } } }),
    prisma.operationalIncident.count({ where: { severity: 'critical', status: { not: 'resolved' } } }),
    prisma.operationalIncident.count({ where: { severity: 'outage', status: { not: 'resolved' } } }),
  ]);
  return { total, open, critical, outage };
}

export async function correlateIncidentContext(correlationId: string) {
  const [audit, events, incidentEvents] = await Promise.all([
    prisma.auditLog.findMany({ where: { correlationId }, orderBy: { createdAt: 'asc' }, take: 80 }),
    prisma.operationalEvent.findMany({
      where: {
        metadata: { path: ['correlationId'], equals: correlationId },
      },
      orderBy: { createdAt: 'asc' },
      take: 80,
    }),
    prisma.operationalIncidentEvent.findMany({ where: { correlationId }, orderBy: { createdAt: 'asc' }, take: 80 }),
  ]);
  return { audit, events, incidentEvents };
}
