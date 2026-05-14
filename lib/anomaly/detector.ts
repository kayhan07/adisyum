/**
 * ADISYUM Anomaly Detection Engine
 * AI-like statistical anomaly detection for tenant operations.
 * Uses rolling baselines + z-score deviation analysis.
 */

import { fireAlert } from '@/lib/alerts/alert-engine';
import { logWarn } from '@/lib/observability/structured-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnomalyType =
  | 'printer_failures'
  | 'tenant_traffic_spike'
  | 'login_pattern'
  | 'sync_failures'
  | 'websocket_disconnects'
  | 'revenue_drop'
  | 'cancel_refund_spike';

export type AnomalyEvent = {
  id: string;
  type: AnomalyType;
  tenantId?: string;
  detectedAt: string;
  description: string;
  currentValue: number;
  baselineValue: number;
  deviationFactor: number;
  severity: 'low' | 'medium' | 'high';
  resolved: boolean;
};

type BaselineSeries = {
  samples: number[];
  windowSize: number;
  lastUpdated: string;
};

type AnomalyState = {
  anomalies: AnomalyEvent[];
  baselines: Record<string, BaselineSeries>; // key: `${tenantId}:${metric}`
};

// ─── Global Singleton ─────────────────────────────────────────────────────────

const MAX_ANOMALIES = 500;
const DEFAULT_WINDOW = 30; // last 30 samples per metric

const g = globalThis as typeof globalThis & {
  __adisyumAnomalies?: AnomalyState;
};

function getState(): AnomalyState {
  if (!g.__adisyumAnomalies) {
    g.__adisyumAnomalies = { anomalies: [], baselines: {} };
  }
  return g.__adisyumAnomalies;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function mean(samples: number[]): number {
  if (!samples.length) return 0;
  return samples.reduce((s, v) => s + v, 0) / samples.length;
}

function stdDev(samples: number[]): number {
  if (samples.length < 2) return 0;
  const avg = mean(samples);
  const variance = samples.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / samples.length;
  return Math.sqrt(variance);
}

function zScore(value: number, samples: number[]): number {
  const sd = stdDev(samples);
  if (sd === 0) return 0;
  return Math.abs(value - mean(samples)) / sd;
}

// ─── Baseline Tracking ────────────────────────────────────────────────────────

function recordSample(key: string, value: number): BaselineSeries {
  const state = getState();
  if (!state.baselines[key]) {
    state.baselines[key] = { samples: [], windowSize: DEFAULT_WINDOW, lastUpdated: new Date().toISOString() };
  }
  const series = state.baselines[key];
  series.samples.push(value);
  if (series.samples.length > series.windowSize) series.samples.shift();
  series.lastUpdated = new Date().toISOString();
  return series;
}

function getBaseline(key: string): number {
  const state = getState();
  const series = state.baselines[key];
  if (!series || series.samples.length === 0) return 0;
  return mean(series.samples);
}

// ─── Anomaly Recording ────────────────────────────────────────────────────────

function uid() { return `anom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

async function recordAnomaly(event: Omit<AnomalyEvent, 'id' | 'detectedAt' | 'resolved'>): Promise<AnomalyEvent> {
  const state = getState();
  const full: AnomalyEvent = { ...event, id: uid(), detectedAt: new Date().toISOString(), resolved: false };

  state.anomalies.unshift(full);
  if (state.anomalies.length > MAX_ANOMALIES) state.anomalies.splice(MAX_ANOMALIES);

  logWarn({
    service: 'anomaly-detector',
    tenantId: event.tenantId,
    message: `Anomaly detected [${event.type}]: ${event.description}`,
    context: { deviationFactor: event.deviationFactor, baseline: event.baselineValue, current: event.currentValue },
  });

  // Fire alert based on severity
  const alertSev = event.severity === 'high' ? 'critical' : event.severity === 'medium' ? 'warning' : 'info';
  await fireAlert({
    severity: alertSev,
    title: `Anomaly: ${event.type.replace(/_/g, ' ')}`,
    message: event.description,
    tenantId: event.tenantId,
    service: 'anomaly-detector',
    context: { deviationFactor: event.deviationFactor },
    suppressTtlMs: 10 * 60 * 1000,
  });

  return full;
}

// ─── Public Detection Functions ───────────────────────────────────────────────

const Z_THRESHOLD_LOW = 2;
const Z_THRESHOLD_MED = 3;
const Z_THRESHOLD_HIGH = 4;

export async function detectPrinterFailureAnomaly(tenantId: string, failureCount: number) {
  const key = `${tenantId}:printer_failures`;
  const series = recordSample(key, failureCount);
  if (series.samples.length < 5) return; // Need enough baseline

  const z = zScore(failureCount, series.samples.slice(0, -1));
  if (z < Z_THRESHOLD_LOW) return;

  const baseline = getBaseline(key);
  await recordAnomaly({
    type: 'printer_failures',
    tenantId,
    description: `Printer failure count spiked to ${failureCount} (baseline: ${baseline.toFixed(1)}, z-score: ${z.toFixed(2)})`,
    currentValue: failureCount,
    baselineValue: baseline,
    deviationFactor: z,
    severity: z >= Z_THRESHOLD_HIGH ? 'high' : z >= Z_THRESHOLD_MED ? 'medium' : 'low',
  });
}

export async function detectTrafficAnomaly(tenantId: string, requestsPerMinute: number) {
  const key = `${tenantId}:traffic_rpm`;
  const series = recordSample(key, requestsPerMinute);
  if (series.samples.length < 10) return;

  const z = zScore(requestsPerMinute, series.samples.slice(0, -1));
  if (z < Z_THRESHOLD_MED) return;

  const baseline = getBaseline(key);
  await recordAnomaly({
    type: 'tenant_traffic_spike',
    tenantId,
    description: `Unusual traffic: ${requestsPerMinute} req/min (baseline: ${baseline.toFixed(0)}, ${z.toFixed(1)}σ)`,
    currentValue: requestsPerMinute,
    baselineValue: baseline,
    deviationFactor: z,
    severity: z >= Z_THRESHOLD_HIGH ? 'high' : 'medium',
  });
}

export async function detectLoginAnomaly(tenantId: string, failedAuthCount: number) {
  const key = `${tenantId}:failed_auth`;
  const series = recordSample(key, failedAuthCount);
  if (series.samples.length < 5) return;

  // Brute force: >10 failures in window is always suspicious
  if (failedAuthCount >= 10) {
    const baseline = getBaseline(key);
    await recordAnomaly({
      type: 'login_pattern',
      tenantId,
      description: `Suspicious login activity: ${failedAuthCount} failed auth attempts (baseline: ${baseline.toFixed(1)})`,
      currentValue: failedAuthCount,
      baselineValue: baseline,
      deviationFactor: failedAuthCount / Math.max(baseline, 1),
      severity: failedAuthCount >= 30 ? 'high' : 'medium',
    });
    return;
  }

  const z = zScore(failedAuthCount, series.samples.slice(0, -1));
  if (z < Z_THRESHOLD_HIGH) return;

  const baseline = getBaseline(key);
  await recordAnomaly({
    type: 'login_pattern',
    tenantId,
    description: `Auth failure spike (${z.toFixed(1)}σ): ${failedAuthCount} failures`,
    currentValue: failedAuthCount,
    baselineValue: baseline,
    deviationFactor: z,
    severity: 'medium',
  });
}

export async function detectSyncFailureAnomaly(tenantId: string, failureCount: number) {
  const key = `${tenantId}:sync_failures`;
  const series = recordSample(key, failureCount);
  if (series.samples.length < 5) return;

  const z = zScore(failureCount, series.samples.slice(0, -1));
  if (z < Z_THRESHOLD_LOW || failureCount < 3) return;

  const baseline = getBaseline(key);
  await recordAnomaly({
    type: 'sync_failures',
    tenantId,
    description: `Sync failure spike: ${failureCount} failures (baseline: ${baseline.toFixed(1)}, ${z.toFixed(1)}σ)`,
    currentValue: failureCount,
    baselineValue: baseline,
    deviationFactor: z,
    severity: z >= Z_THRESHOLD_HIGH ? 'high' : z >= Z_THRESHOLD_MED ? 'medium' : 'low',
  });
}

export async function detectWebsocketAnomaly(tenantId: string, disconnectCount: number) {
  const key = `${tenantId}:ws_disconnects`;
  const series = recordSample(key, disconnectCount);
  if (series.samples.length < 5) return;

  const z = zScore(disconnectCount, series.samples.slice(0, -1));
  if (z < Z_THRESHOLD_MED) return;

  const baseline = getBaseline(key);
  await recordAnomaly({
    type: 'websocket_disconnects',
    tenantId,
    description: `WebSocket instability: ${disconnectCount} disconnects (${z.toFixed(1)}σ above baseline)`,
    currentValue: disconnectCount,
    baselineValue: baseline,
    deviationFactor: z,
    severity: z >= Z_THRESHOLD_HIGH ? 'high' : 'medium',
  });
}

export async function detectRevenueDrop(tenantId: string, dailyRevenue: number) {
  const key = `${tenantId}:daily_revenue`;
  const series = recordSample(key, dailyRevenue);
  if (series.samples.length < 7) return;

  const recent = series.samples.slice(-7, -1);
  const avg = mean(recent);

  if (avg > 0 && dailyRevenue < avg * 0.5) {
    await recordAnomaly({
      type: 'revenue_drop',
      tenantId,
      description: `Revenue drop: ${dailyRevenue.toFixed(0)} TL (>${((1 - dailyRevenue / avg) * 100).toFixed(0)}% below 7-day avg of ${avg.toFixed(0)} TL)`,
      currentValue: dailyRevenue,
      baselineValue: avg,
      deviationFactor: avg / Math.max(dailyRevenue, 1),
      severity: dailyRevenue < avg * 0.25 ? 'high' : 'medium',
    });
  }
}

export async function detectCancelRefundSpike(tenantId: string, cancelCount: number, orderCount: number) {
  if (orderCount === 0) return;
  const rate = cancelCount / orderCount;
  const key = `${tenantId}:cancel_rate`;
  const series = recordSample(key, rate);
  if (series.samples.length < 7) return;

  const baseline = getBaseline(key);
  const SPIKE_THRESHOLD = 0.2; // 20% cancel rate is anomalous

  if (rate > SPIKE_THRESHOLD && rate > baseline * 2) {
    await recordAnomaly({
      type: 'cancel_refund_spike',
      tenantId,
      description: `Cancel/refund rate spike: ${(rate * 100).toFixed(1)}% (baseline: ${(baseline * 100).toFixed(1)}%)`,
      currentValue: rate,
      baselineValue: baseline,
      deviationFactor: rate / Math.max(baseline, 0.01),
      severity: rate > 0.4 ? 'high' : 'medium',
    });
  }
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export function getRecentAnomalies(limit = 50): AnomalyEvent[] {
  return getState().anomalies.slice(0, limit);
}

export function getAnomaliesByTenant(tenantId: string): AnomalyEvent[] {
  return getState().anomalies.filter((a) => a.tenantId === tenantId);
}

export function resolveAnomaly(id: string) {
  const event = getState().anomalies.find((a) => a.id === id);
  if (event) event.resolved = true;
}

export function getAnomalyStats() {
  const all = getState().anomalies;
  const unresolved = all.filter((a) => !a.resolved);
  return {
    total: all.length,
    unresolved: unresolved.length,
    bySeverity: {
      high: unresolved.filter((a) => a.severity === 'high').length,
      medium: unresolved.filter((a) => a.severity === 'medium').length,
      low: unresolved.filter((a) => a.severity === 'low').length,
    },
    byType: unresolved.reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
