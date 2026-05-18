import { recordStructuredLog } from '@/lib/observability/metrics-store';

export type PilotSeverity = 'info' | 'warning' | 'critical';
export type PilotEventType =
  | 'printer_disconnect'
  | 'websocket_reconnect'
  | 'wifi_instability'
  | 'offline_session'
  | 'print_retry'
  | 'fiscal_latency'
  | 'windows_restart'
  | 'memory_pressure'
  | 'cpu_spike'
  | 'crash_report'
  | 'queue_snapshot'
  | 'ux_flow'
  | 'chaos_result';
export type FieldReliabilityMetric = {
  printerFailureRate: number;
  reconnectRate: number;
  offlineDurationSec: number;
  fiscalErrorFrequency: number;
  deviceInstabilityScore: number;
};

export type PilotProgramConfig = {
  tenantId: string;
  restaurantName: string;
  enabled: boolean;
  startedAt: string;
  enhancedTelemetry: boolean;
  fieldDiagnostics: boolean;
  crashReporting: boolean;
  deviceTelemetry: boolean;
  printTelemetry: boolean;
  syncTelemetry: boolean;
};

export type PilotFieldEvent = {
  id: string;
  tenantId: string;
  type: PilotEventType;
  severity: PilotSeverity;
  at: string;
  source: string;
  message: string;
  metrics: Record<string, number | string | boolean>;
};

type PilotTenantState = {
  config: PilotProgramConfig;
  events: PilotFieldEvent[];
};

type PilotState = {
  tenants: Record<string, PilotTenantState>;
};

const MAX_EVENTS_PER_TENANT = 800;
const globalState = globalThis as typeof globalThis & {
  __adisyumPilotField?: PilotState;
};

function nowIso() {
  return new Date().toISOString();
}

function getState() {
  if (!globalState.__adisyumPilotField) {
    globalState.__adisyumPilotField = { tenants: {} };
  }
  return globalState.__adisyumPilotField;
}

function metricNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensurePilotTenant(tenantId: string, restaurantName?: string) {
  const state = getState();
  if (!state.tenants[tenantId]) {
    state.tenants[tenantId] = {
      config: {
        tenantId,
        restaurantName: restaurantName || tenantId,
        enabled: true,
        startedAt: nowIso(),
        enhancedTelemetry: true,
        fieldDiagnostics: true,
        crashReporting: true,
        deviceTelemetry: true,
        printTelemetry: true,
        syncTelemetry: true,
      },
      events: [],
    };
  }
  return state.tenants[tenantId];
}

export function enablePilotTenant(input: { tenantId: string; restaurantName?: string }) {
  const tenant = ensurePilotTenant(input.tenantId, input.restaurantName);
  tenant.config = {
    ...tenant.config,
    restaurantName: input.restaurantName || tenant.config.restaurantName,
    enabled: true,
    enhancedTelemetry: true,
    fieldDiagnostics: true,
    crashReporting: true,
    deviceTelemetry: true,
    printTelemetry: true,
    syncTelemetry: true,
  };
  return tenant.config;
}

export function disablePilotTenant(tenantId: string) {
  const tenant = ensurePilotTenant(tenantId);
  tenant.config.enabled = false;
  return tenant.config;
}

export function recordPilotEvent(input: {
  tenantId: string;
  restaurantName?: string;
  type: PilotEventType;
  severity?: PilotSeverity;
  source?: string;
  message: string;
  metrics?: Record<string, number | string | boolean>;
}) {
  const tenant = ensurePilotTenant(input.tenantId, input.restaurantName);
  const event: PilotFieldEvent = {
    id: `pilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: input.tenantId,
    type: input.type,
    severity: input.severity ?? inferSeverity(input.type, input.metrics ?? {}),
    at: nowIso(),
    source: input.source ?? 'desktop-bridge',
    message: input.message,
    metrics: input.metrics ?? {},
  };

  tenant.events.push(event);
  tenant.events = tenant.events.slice(Math.max(tenant.events.length - MAX_EVENTS_PER_TENANT, 0));

  recordStructuredLog({
    level: event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warn' : 'info',
    service: 'pilot-field',
    tenantId: event.tenantId,
    message: event.message,
    context: { type: event.type, source: event.source, ...event.metrics },
  });

  return event;
}

export function ingestPilotDiagnostics(input: {
  tenantId: string;
  restaurantName?: string;
  bridgeId?: string;
  diagnostics?: {
    printerDisconnects?: number;
    websocketReconnects?: number;
    wifiInstability?: number;
    offlineDurationSec?: number;
    printRetryCount?: number;
    fiscalTransactionLatencyMs?: number;
    windowsRestartEvents?: number;
    memoryUsageMb?: number;
    cpuSpikeCount?: number;
    crashReports?: number;
  };
  print?: {
    averageLatencyMs?: number;
    failedPercent?: number;
    retryRate?: number;
    duplicateIncidents?: number;
    kitchenBarSplitSuccess?: number;
    escposEncodingFailures?: number;
  };
  fiscal?: {
    successfulTransactions?: number;
    failedCommands?: number;
    timeoutRate?: number;
    reconnectRate?: number;
    reportSuccessRate?: number;
    paymentVerificationMismatch?: number;
  };
  ux?: {
    orderCreationSpeedSec?: number;
    paymentCompletionSpeedSec?: number;
    tableSwitchFrequency?: number;
    serviceInteractionFlowScore?: number;
    touchInteractionLatencyMs?: number;
    peakHourResponseMs?: number;
    userErrorRate?: number;
  };
  offline?: {
    scenarioRuns?: number;
    successfulRecoveries?: number;
    dataLossIncidents?: number;
    syncReconcileFailures?: number;
  };
  reliability?: Partial<FieldReliabilityMetric>;
  logs?: Array<{ type: PilotEventType; message: string; severity?: PilotSeverity; metrics?: Record<string, number | string | boolean> }>;
}) {
  enablePilotTenant({ tenantId: input.tenantId, restaurantName: input.restaurantName });
  const events: PilotFieldEvent[] = [];
  const source = input.bridgeId ? `desktop-bridge:${input.bridgeId}` : 'desktop-bridge';
  const d = input.diagnostics ?? {};

  const mappings: Array<[PilotEventType, string, number | undefined, string]> = [
    ['printer_disconnect', 'Printer disconnect observed', d.printerDisconnects, 'count'],
    ['websocket_reconnect', 'WebSocket reconnect observed', d.websocketReconnects, 'count'],
    ['wifi_instability', 'WiFi instability observed', d.wifiInstability, 'score'],
    ['offline_session', 'Offline session observed', d.offlineDurationSec, 'durationSec'],
    ['print_retry', 'Print retry observed', d.printRetryCount, 'count'],
    ['fiscal_latency', 'Fiscal transaction latency observed', d.fiscalTransactionLatencyMs, 'latencyMs'],
    ['windows_restart', 'Windows restart observed', d.windowsRestartEvents, 'count'],
    ['memory_pressure', 'Memory usage observed', d.memoryUsageMb, 'memoryMb'],
    ['cpu_spike', 'CPU spike observed', d.cpuSpikeCount, 'count'],
    ['crash_report', 'Crash report observed', d.crashReports, 'count'],
  ];

  for (const [type, message, value, key] of mappings) {
    if (typeof value === 'number' && value > 0) {
      events.push(recordPilotEvent({ tenantId: input.tenantId, restaurantName: input.restaurantName, type, source, message, metrics: { [key]: value } }));
    }
  }

  if (input.print) {
    events.push(recordPilotEvent({ tenantId: input.tenantId, restaurantName: input.restaurantName, type: 'queue_snapshot', source, message: 'Print reliability telemetry ingested', metrics: input.print as Record<string, number> }));
  }

  if (input.fiscal) {
    events.push(recordPilotEvent({ tenantId: input.tenantId, restaurantName: input.restaurantName, type: 'fiscal_latency', source, message: 'Fiscal POS validation telemetry ingested', metrics: input.fiscal as Record<string, number> }));
  }

  if (input.ux) {
    events.push(recordPilotEvent({ tenantId: input.tenantId, restaurantName: input.restaurantName, type: 'ux_flow', source, message: 'Field UX telemetry ingested', metrics: input.ux as Record<string, number> }));
  }

  if (input.offline) {
    events.push(recordPilotEvent({ tenantId: input.tenantId, restaurantName: input.restaurantName, type: 'offline_session', source, message: 'Offline validation telemetry ingested', metrics: input.offline as Record<string, number> }));
  }

  if (input.reliability) {
    events.push(recordPilotEvent({
      tenantId: input.tenantId,
      restaurantName: input.restaurantName,
      type: 'queue_snapshot',
      source,
      message: 'Field reliability metrics ingested',
      metrics: input.reliability as Record<string, number>,
    }));
  }

  for (const log of input.logs ?? []) {
    events.push(recordPilotEvent({
      tenantId: input.tenantId,
      restaurantName: input.restaurantName,
      type: log.type,
      severity: log.severity,
      source,
      message: log.message,
      metrics: log.metrics,
    }));
  }

  return { accepted: events.length, events };
}

export function recordChaosResult(input: {
  tenantId: string;
  scenario: string;
  passed: boolean;
  durationMs: number;
  recoveryMs?: number;
  dataLoss?: boolean;
  details?: string;
}) {
  return recordPilotEvent({
    tenantId: input.tenantId,
    type: 'chaos_result',
    severity: input.passed && !input.dataLoss ? 'info' : 'critical',
    source: 'field-chaos-runner',
    message: `${input.scenario} chaos scenario ${input.passed ? 'passed' : 'failed'}`,
    metrics: {
      scenario: input.scenario,
      passed: input.passed,
      durationMs: input.durationMs,
      recoveryMs: input.recoveryMs ?? 0,
      dataLoss: Boolean(input.dataLoss),
      details: input.details ?? '',
    },
  });
}

export function getPilotOperationsDashboard() {
  const state = getState();
  const restaurants = Object.values(state.tenants).map((tenant) => buildRestaurantReport(tenant));
  const unhealthy = restaurants.filter((item) => item.restaurantHealthScore < 75);
  const failingDevices = restaurants.reduce((sum, item) => sum + item.deviceReliabilityMatrix.filter((device) => device.healthScore < 75).length, 0);
  const offlineRestaurants = restaurants.filter((item) => item.offlineRecoveryScore < 80);
  const fiscalIssues = restaurants.filter((item) => item.fiscalReadinessScore < 80);

  return {
    pilotCount: restaurants.length,
    unhealthyRestaurants: unhealthy.length,
    failingDevices,
    offlineRestaurants: offlineRestaurants.length,
    fiscalIssues: fiscalIssues.length,
    printStabilityScore: restaurants.length ? clampScore(avg(restaurants.map((item) => item.printStabilityScore))) : 100,
    fiscalReadinessScore: restaurants.length ? clampScore(avg(restaurants.map((item) => item.fiscalReadinessScore))) : 100,
    realWorldProductionReadinessScore: restaurants.length ? clampScore(avg(restaurants.map((item) => item.realWorldProductionReadinessScore))) : 100,
    restaurants,
    recentEvents: Object.values(state.tenants)
      .flatMap((tenant) => tenant.events)
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, 80),
    generatedAt: nowIso(),
  };
}

export function getPilotFieldReport(tenantId?: string) {
  const dashboard = getPilotOperationsDashboard();
  const restaurants = tenantId ? dashboard.restaurants.filter((item) => item.tenantId === tenantId) : dashboard.restaurants;
  return {
    ...dashboard,
    restaurants,
    deviceReliabilityMatrix: restaurants.flatMap((item) => item.deviceReliabilityMatrix),
    pilotFieldReport: restaurants.map((item) => ({
      tenantId: item.tenantId,
      restaurantName: item.restaurantName,
      health: item.restaurantHealthScore,
      print: item.printStabilityScore,
      fiscal: item.fiscalReadinessScore,
      offline: item.offlineRecoveryScore,
      readiness: item.realWorldProductionReadinessScore,
      topRisks: item.topRisks,
    })),
  };
}

function buildRestaurantReport(tenant: PilotTenantState) {
  const events = tenant.events;
  const printerDisconnects = sumMetric(events, 'printer_disconnect', 'count');
  const websocketReconnects = sumMetric(events, 'websocket_reconnect', 'count');
  const offlineDurationSec = sumMetric(events, 'offline_session', 'durationSec');
  const printRetries = sumMetric(events, 'print_retry', 'count') + sumMetric(events, 'queue_snapshot', 'retryRate');
  const crashReports = sumMetric(events, 'crash_report', 'count');
  const cpuSpikes = sumMetric(events, 'cpu_spike', 'count');
  const memoryMb = maxMetric(events, 'memory_pressure', 'memoryMb');
  const fiscalLatency = maxMetric(events, 'fiscal_latency', 'latencyMs') || maxMetric(events, 'fiscal_latency', 'fiscalTransactionLatencyMs');
  const failedPrintPercent = maxMetric(events, 'queue_snapshot', 'failedPercent');
  const duplicateIncidents = sumMetric(events, 'queue_snapshot', 'duplicateIncidents');
  const escposFailures = sumMetric(events, 'queue_snapshot', 'escposEncodingFailures');
  const fiscalFailed = sumMetric(events, 'fiscal_latency', 'failedCommands');
  const fiscalMismatch = sumMetric(events, 'fiscal_latency', 'paymentVerificationMismatch');
  const offlineDataLoss = sumMetric(events, 'offline_session', 'dataLossIncidents') + events.filter((event) => event.type === 'chaos_result' && event.metrics.dataLoss === true).length;
  const uxErrorRate = maxMetric(events, 'ux_flow', 'userErrorRate');

  const printStabilityScore = clampScore(100 - printerDisconnects * 5 - failedPrintPercent * 3 - printRetries * 2 - duplicateIncidents * 10 - escposFailures * 10);
  const fiscalReadinessScore = clampScore(100 - fiscalFailed * 8 - fiscalMismatch * 12 - (fiscalLatency > 3000 ? 15 : 0));
  const offlineRecoveryScore = clampScore(100 - Math.min(30, offlineDurationSec / 120) - offlineDataLoss * 60);
  const restaurantHealthScore = clampScore(
    printStabilityScore * 0.25
    + fiscalReadinessScore * 0.2
    + offlineRecoveryScore * 0.2
    + (100 - Math.min(35, websocketReconnects * 3)) * 0.15
    + (100 - Math.min(30, uxErrorRate * 2)) * 0.1
    + (100 - Math.min(25, crashReports * 10 + cpuSpikes * 2 + (memoryMb > 900 ? 10 : 0))) * 0.1,
  );
  const realWorldProductionReadinessScore = clampScore(avg([printStabilityScore, fiscalReadinessScore, offlineRecoveryScore, restaurantHealthScore]));

  return {
    tenantId: tenant.config.tenantId,
    restaurantName: tenant.config.restaurantName,
    enabled: tenant.config.enabled,
    restaurantHealthScore,
    printStabilityScore,
    fiscalReadinessScore,
    offlineRecoveryScore,
    realWorldProductionReadinessScore,
    metrics: {
      printerDisconnects,
      websocketReconnects,
      offlineDurationSec,
      printRetries,
      fiscalLatencyMs: fiscalLatency,
      crashReports,
      cpuSpikes,
      memoryMb,
      uxErrorRate,
    },
    deviceReliabilityMatrix: buildDeviceMatrix(events, tenant.config.tenantId, tenant.config.restaurantName),
    topRisks: buildRisks({ printerDisconnects, failedPrintPercent, fiscalFailed, fiscalMismatch, offlineDataLoss, websocketReconnects, crashReports, uxErrorRate }),
    recentEvents: events.slice(Math.max(events.length - 20, 0)).reverse(),
  };
}

function buildDeviceMatrix(events: PilotFieldEvent[], tenantId: string, restaurantName: string) {
  const devices = new Map<string, { deviceId: string; type: string; vendor: string; failures: number; reconnects: number; latencyMs: number; healthScore: number; tenantId: string; restaurantName: string }>();
  for (const event of events) {
    const deviceId = String(event.metrics.deviceId ?? event.metrics.printerName ?? event.metrics.device ?? event.type);
    const current = devices.get(deviceId) ?? { deviceId, type: inferDeviceType(event), vendor: String(event.metrics.vendor ?? 'unknown'), failures: 0, reconnects: 0, latencyMs: 0, healthScore: 100, tenantId, restaurantName };
    if (event.severity !== 'info') current.failures += 1;
    current.reconnects += metricNumber(event.metrics.reconnects ?? event.metrics.reconnectCount);
    current.latencyMs = Math.max(current.latencyMs, metricNumber(event.metrics.latencyMs ?? event.metrics.fiscalTransactionLatencyMs));
    current.healthScore = clampScore(100 - current.failures * 8 - current.reconnects * 3 - (current.latencyMs > 2500 ? 10 : 0));
    devices.set(deviceId, current);
  }
  return Array.from(devices.values()).sort((left, right) => left.healthScore - right.healthScore).slice(0, 40);
}

function inferSeverity(type: PilotEventType, metrics: Record<string, number | string | boolean>): PilotSeverity {
  if (type === 'crash_report') return 'critical';
  if (type === 'chaos_result' && metrics.passed === false) return 'critical';
  if (type === 'offline_session' && metricNumber(metrics.dataLossIncidents) > 0) return 'critical';
  if (type === 'printer_disconnect' || type === 'fiscal_latency' || type === 'cpu_spike') return 'warning';
  return 'info';
}

function inferDeviceType(event: PilotFieldEvent) {
  if (event.type.startsWith('print') || event.type === 'printer_disconnect') return 'printer';
  if (event.type === 'fiscal_latency') return 'fiscal-pos';
  if (event.type === 'websocket_reconnect') return 'websocket';
  return 'runtime';
}

function sumMetric(events: PilotFieldEvent[], type: PilotEventType, key: string) {
  return events.filter((event) => event.type === type).reduce((sum, event) => sum + metricNumber(event.metrics[key]), 0);
}

function maxMetric(events: PilotFieldEvent[], type: PilotEventType, key: string) {
  return events.filter((event) => event.type === type).reduce((max, event) => Math.max(max, metricNumber(event.metrics[key])), 0);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRisks(input: Record<string, number>) {
  const risks: string[] = [];
  if (input.printerDisconnects > 0 || input.failedPrintPercent > 2) risks.push('Printer stability needs field review');
  if (input.fiscalFailed > 0 || input.fiscalMismatch > 0) risks.push('Fiscal POS commands need vendor validation');
  if (input.offlineDataLoss > 0) risks.push('Offline validation found data loss risk');
  if (input.websocketReconnects > 10) risks.push('Restaurant network/WebSocket instability');
  if (input.crashReports > 0) risks.push('Crash reports collected from bridge runtime');
  if (input.uxErrorRate > 5) risks.push('Field UX flow has elevated user error rate');
  return risks.length > 0 ? risks : ['No major pilot risk detected'];
}
