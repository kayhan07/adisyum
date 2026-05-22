import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import {
  buildServerMetricSnapshot,
  buildTenantObservabilityRows,
  buildReleaseTelemetryRows,
  getRecentObservabilityLogs,
  getRecentSlowQueries,
  getReleaseTelemetrySummary,
} from '@/lib/observability/metrics-store';
import { getOpenIncidents, getIncidentStats } from '@/lib/incidents/incident-engine';
import { getRecentAlerts, getAlertStats } from '@/lib/alerts/alert-engine';
import { getRecentAnomalies, getAnomalyStats } from '@/lib/anomaly/detector';
import { computeAllHealthScores, getSystemHealthSummary } from '@/lib/health-score/tenant-health-score';
import { getSecurityStats, getSecurityEvents } from '@/lib/security/security-telemetry';
import { getAuditStats, getAuditTrail } from '@/lib/audit/audit-trail';
import { generatePerformanceAdvisories } from '@/lib/performance/performance-advisor';
import { getDurableQueueMetrics } from '@/lib/queue/orchestration';
import { getHealingEvents, getHealingStats } from '@/lib/self-healing/engine';
import {
  bootstrapAutoBackupEngine,
  fireBackupFailureAlertIfNeeded,
  getBackupRuns,
  getBackupStats,
  runScheduledBackups,
} from '@/lib/backup/backup-engine';
import {
  getRecoveryReadinessReport,
  getRecentRestoreRuns,
} from '@/lib/dr/recovery-engine';
import {
  getBackupValidationRuns,
  getCorruptionRegistry,
  getLatestBackupValidation,
  runBackupIntegrityValidation,
} from '@/lib/backup/validation-engine';
import { getHAReadinessReport } from '@/lib/ha/readiness';
import { getOperationModeSnapshot } from '@/lib/operations/mode-manager';
import { getPlaybookRuns } from '@/lib/incidents/dr-playbooks';
import { getPilotOperationsDashboard } from '@/lib/pilot-field/field-validation';
import { getCommercialOperationsDashboard } from '@/lib/commercial-ops/platform';
import { buildAllTenantOperationalHealth } from '@/lib/operational-intelligence/engine';
import {
  bootstrapEnterpriseTelemetry,
  buildEnterpriseTelemetrySnapshot,
} from '@/lib/observability/enterprise-telemetry';
import { buildScaleReadinessSnapshot } from '@/lib/operations/scale-readiness';
import { buildAiOperationsSnapshot } from '@/lib/ai-operations/governance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function maskDbPassword(password: string) {
  if (!password) return '<missing>';
  if (password.length <= 4) return '*'.repeat(password.length);
  return `${password.slice(0, 2)}${'*'.repeat(Math.max(4, password.length - 4))}${password.slice(-2)}`;
}

function inspectDatabaseEnv() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { configured: false, validUrl: false, reason: 'DATABASE_URL missing' };
  if (raw.includes('${') || /\$DATABASE_URL/.test(raw)) {
    return { configured: true, validUrl: false, reason: 'DATABASE_URL unresolved variable syntax' };
  }
  try {
    const url = new URL(raw);
    return {
      configured: true,
      validUrl: url.protocol === 'postgresql:' || url.protocol === 'postgres:',
      host: url.hostname || '<missing>',
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || '<missing>',
      user: decodeURIComponent(url.username || '') || '<missing>',
      password: maskDbPassword(decodeURIComponent(url.password || '')),
      passwordPresent: Boolean(url.password),
      sslMode: url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'not-set',
    };
  } catch (error) {
    return {
      configured: true,
      validUrl: false,
      reason: error instanceof Error ? error.message : 'DATABASE_URL parse failed',
    };
  }
}

async function getPostgresMetrics() {
  const startedAt = Date.now();
  const env = inspectDatabaseEnv();
  try {
    await prisma.$queryRaw`SELECT 1`;
    let activeConnections = 0;
    try {
      const rows = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>`
        SELECT COUNT(*)::bigint AS count FROM pg_stat_activity
      `;
      const value = rows?.[0]?.count;
      activeConnections = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
    } catch {
      activeConnections = 0;
    }

    return {
      healthy: true,
      latencyMs: Date.now() - startedAt,
      activeConnections,
      authValid: true,
      env,
    };
  } catch (error) {
    return {
      healthy: false,
      authValid: false,
      message: error instanceof Error ? error.message : 'PostgreSQL check failed',
      env,
    };
  }
}

async function getRedisMetrics() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) {
    return {
      enabled: false,
      healthy: false,
      message: 'UPSTASH_REDIS_REST_URL not configured',
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(upstashUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${upstashToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(['PING']),
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        enabled: true,
        healthy: false,
        message: `Redis REST ${response.status}`,
      };
    }

    return {
      enabled: true,
      healthy: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      enabled: true,
      healthy: false,
      message: error instanceof Error ? error.message : 'Redis check failed',
    };
  }
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  // Bootstrap backup scheduler (idempotent)
  try { bootstrapAutoBackupEngine(); } catch { /* */ }
  try { bootstrapEnterpriseTelemetry(); } catch { /* */ }

  const [postgres, redis] = await Promise.all([getPostgresMetrics(), getRedisMetrics()]);
  const server = buildServerMetricSnapshot({ postgres, redis });
  const tenants = buildTenantObservabilityRows();
  const releases = buildReleaseTelemetryRows();
  const releaseSummary = getReleaseTelemetrySummary(releases);
  const logs = getRecentObservabilityLogs(250);
  const slowQueries = getRecentSlowQueries(80);

  let incidents: ReturnType<typeof getOpenIncidents> = [];
  let incidentStats: ReturnType<typeof getIncidentStats> | null = null;
  let alerts: ReturnType<typeof getRecentAlerts> = [];
  let alertStats: ReturnType<typeof getAlertStats> | null = null;
  let anomalies: ReturnType<typeof getRecentAnomalies> = [];
  let anomalyStats: ReturnType<typeof getAnomalyStats> | null = null;
  let healthScores: ReturnType<typeof computeAllHealthScores> = [];
  let healthSummary: ReturnType<typeof getSystemHealthSummary> | null = null;
  let securityStats: ReturnType<typeof getSecurityStats> | null = null;
  let securityEvents: ReturnType<typeof getSecurityEvents> = [];
  let auditStats: ReturnType<typeof getAuditStats> | null = null;
  let recentAudit: ReturnType<typeof getAuditTrail> = [];
  let advisories: ReturnType<typeof generatePerformanceAdvisories> = [];
  let queueMetrics: Awaited<ReturnType<typeof getDurableQueueMetrics>> = [];
  let healingEvents: ReturnType<typeof getHealingEvents> = [];
  let healingStats: ReturnType<typeof getHealingStats> | null = null;

  // DR / Backup / HA
  let backupStats: ReturnType<typeof getBackupStats> | null = null;
  let backupRuns: ReturnType<typeof getBackupRuns> = [];
  let recoveryReport: ReturnType<typeof getRecoveryReadinessReport> | null = null;
  let recentRestores: ReturnType<typeof getRecentRestoreRuns> = [];
  let latestValidation: Awaited<ReturnType<typeof runBackupIntegrityValidation>> | null = null;
  let validationRuns: ReturnType<typeof getBackupValidationRuns> = [];
  let corruptionRegistry: ReturnType<typeof getCorruptionRegistry> = {};
  let haReadiness: ReturnType<typeof getHAReadinessReport> | null = null;
  let operationMode: ReturnType<typeof getOperationModeSnapshot> | null = null;
  let playbookRuns: ReturnType<typeof getPlaybookRuns> = [];
  let pilotField: ReturnType<typeof getPilotOperationsDashboard> | null = null;
  let commercialOps: ReturnType<typeof getCommercialOperationsDashboard> | null = null;
  let operationalIntelligence: Awaited<ReturnType<typeof buildAllTenantOperationalHealth>> = [];
  let enterpriseTelemetry: ReturnType<typeof buildEnterpriseTelemetrySnapshot> | null = null;
  let scaleReadiness: ReturnType<typeof buildScaleReadinessSnapshot> | null = null;
  let aiOperations: ReturnType<typeof buildAiOperationsSnapshot> | null = null;

  try { incidents = getOpenIncidents(); } catch { /* */ }
  try { incidentStats = getIncidentStats(); } catch { /* */ }
  try { alerts = getRecentAlerts(50); } catch { /* */ }
  try { alertStats = getAlertStats(); } catch { /* */ }
  try { anomalies = getRecentAnomalies(30); } catch { /* */ }
  try { anomalyStats = getAnomalyStats(); } catch { /* */ }
  try { healthScores = computeAllHealthScores(); } catch { /* */ }
  try { healthSummary = getSystemHealthSummary(); } catch { /* */ }
  try { securityStats = getSecurityStats(); } catch { /* */ }
  try { securityEvents = getSecurityEvents(30); } catch { /* */ }
  try { auditStats = getAuditStats(); } catch { /* */ }
  try { recentAudit = getAuditTrail({ limit: 50 }); } catch { /* */ }
  try { advisories = generatePerformanceAdvisories(); } catch { /* */ }
  try { queueMetrics = await getDurableQueueMetrics(); } catch { /* */ }
  try { healingEvents = getHealingEvents(50); } catch { /* */ }
  try { healingStats = getHealingStats(); } catch { /* */ }

  // DR / Backup / HA collections
  try { backupStats = getBackupStats(); } catch { /* */ }
  try { backupRuns = getBackupRuns(80); } catch { /* */ }
  try { recoveryReport = getRecoveryReadinessReport(); } catch { /* */ }
  try { recentRestores = getRecentRestoreRuns(30); } catch { /* */ }
  try { latestValidation = getLatestBackupValidation(); } catch { /* */ }
  try { validationRuns = getBackupValidationRuns(20); } catch { /* */ }
  try { corruptionRegistry = getCorruptionRegistry(); } catch { /* */ }
  try { haReadiness = getHAReadinessReport(); } catch { /* */ }
  try { operationMode = getOperationModeSnapshot(); } catch { /* */ }
  try { playbookRuns = getPlaybookRuns(20); } catch { /* */ }
  try { pilotField = getPilotOperationsDashboard(); } catch { /* */ }
  try { commercialOps = getCommercialOperationsDashboard({ pilotField, healthScores }); } catch { /* */ }
  try { operationalIntelligence = await buildAllTenantOperationalHealth(); } catch { /* */ }
  try { enterpriseTelemetry = buildEnterpriseTelemetrySnapshot(); } catch { /* */ }
  try { scaleReadiness = buildScaleReadinessSnapshot(); } catch { /* */ }
  try { aiOperations = buildAiOperationsSnapshot(); } catch { /* */ }

  // Fire backup failure alert if needed (non-blocking)
  void fireBackupFailureAlertIfNeeded().catch(() => undefined);

  // Trigger incident playbooks from live probe data
  try {
    const incidentMod = await import('@/lib/incidents/incident-engine');
    if (!redis.healthy && typeof redis.latencyMs === 'number') {
      void incidentMod.handleRedisLatency(redis.latencyMs);
    }
    if (typeof postgres.activeConnections === 'number' && postgres.activeConnections > 50) {
      void incidentMod.handleDbConnectionSaturation(postgres.activeConnections, 100);
    }
  } catch { /* */ }

  return NextResponse.json({
    ok: true,
    server,
    tenants,
    logs,
    slowQueries,
    incidents,
    incidentStats,
    alerts,
    alertStats,
    anomalies,
    anomalyStats,
    healthScores,
    healthSummary,
    securityStats,
    securityEvents,
    auditStats,
    recentAudit,
    advisories,
    queueMetrics,
    healingEvents,
    healingStats,
    backupStats,
    backupRuns,
    recoveryReport,
    recentRestores,
    latestValidation,
    validationRuns,
    corruptionRegistry,
    haReadiness,
    operationMode,
    playbookRuns,
    pilotField,
    commercialOps,
    operationalIntelligence,
    enterpriseTelemetry,
    scaleReadiness,
    aiOperations,
    releases,
    releaseSummary,
    generatedAt: new Date().toISOString(),
  });
}
