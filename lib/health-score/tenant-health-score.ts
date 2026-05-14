/**
 * ADISYUM Tenant Health Score Engine
 * Computes 0–100 enterprise health score per tenant.
 * Weights: websocket uptime, printer success, sync success,
 *          API latency, DB errors, device health.
 */

import { buildTenantObservabilityRows } from '@/lib/observability/metrics-store';
import { getAnomaliesByTenant } from '@/lib/anomaly/detector';
import { getAlertsByTenant } from '@/lib/alerts/alert-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type HealthScoreBreakdown = {
  tenantId: string;
  companyName: string;
  score: number;
  grade: HealthGrade;
  components: {
    websocketScore: number;     // 0-20
    printerScore: number;       // 0-20
    syncScore: number;          // 0-15
    apiLatencyScore: number;    // 0-20
    errorRateScore: number;     // 0-15
    anomalyScore: number;       // 0-10
  };
  insights: string[];
  trend: 'improving' | 'stable' | 'degrading';
  updatedAt: string;
};

// ─── Singleton for trend tracking ────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __adisyumHealthHistory?: Record<string, { score: number; at: string }[]>;
};

function getHistory(): Record<string, { score: number; at: string }[]> {
  if (!g.__adisyumHealthHistory) g.__adisyumHealthHistory = {};
  return g.__adisyumHealthHistory;
}

function recordHistory(tenantId: string, score: number) {
  const history = getHistory();
  if (!history[tenantId]) history[tenantId] = [];
  history[tenantId].push({ score, at: new Date().toISOString() });
  if (history[tenantId].length > 20) history[tenantId].shift();
}

function computeTrend(tenantId: string, currentScore: number): 'improving' | 'stable' | 'degrading' {
  const history = getHistory()[tenantId] ?? [];
  if (history.length < 3) return 'stable';

  const recent = history.slice(-3).map((h) => h.score);
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const diff = currentScore - avg;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'degrading';
  return 'stable';
}

// ─── Score Computation ────────────────────────────────────────────────────────

function gradeFromScore(score: number): HealthGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function computeTenantHealthScore(tenantId: string): HealthScoreBreakdown | null {
  const rows = buildTenantObservabilityRows();
  const row = rows.find((r) => r.tenantId === tenantId);
  if (!row) return null;

  const insights: string[] = [];
  const components = {
    websocketScore: 0,
    printerScore: 0,
    syncScore: 0,
    apiLatencyScore: 0,
    errorRateScore: 0,
    anomalyScore: 0,
  };

  // ── 1. WebSocket Uptime (0-20) ──────────────────────────────────────────────
  if (row.websocketHealth === 'healthy') {
    components.websocketScore = 20;
  } else if (row.websocketHealth === 'degraded') {
    components.websocketScore = 8;
    insights.push('WebSocket bağlantısı kararsız.');
  } else {
    components.websocketScore = 15; // unknown = neutral
  }

  // ── 2. Printer Success Rate (0-20) ─────────────────────────────────────────
  if (row.printerTotalCount === 0) {
    components.printerScore = 18; // No printers = not penalized heavily
  } else {
    const printerSuccessRate = row.printerOnlineCount / row.printerTotalCount;
    components.printerScore = Math.round(printerSuccessRate * 20);
    if (printerSuccessRate < 0.5) insights.push(`Yazıcı başarı oranı düşük: ${row.printerOnlineCount}/${row.printerTotalCount}`);
  }

  // ── 3. Sync Success (0-15) ──────────────────────────────────────────────────
  if (row.syncFailures === 0) {
    components.syncScore = 15;
  } else if (row.syncFailures <= 3) {
    components.syncScore = 10;
    insights.push(`${row.syncFailures} sync hatası var.`);
  } else {
    components.syncScore = Math.max(0, 15 - row.syncFailures * 2);
    insights.push(`Yüksek sync hatası: ${row.syncFailures}`);
  }

  // ── 4. API Latency (0-20) ───────────────────────────────────────────────────
  const avgMs = row.avgResponseMs;
  if (avgMs === 0) {
    components.apiLatencyScore = 15; // No data = neutral
  } else if (avgMs < 150) {
    components.apiLatencyScore = 20;
  } else if (avgMs < 300) {
    components.apiLatencyScore = 15;
  } else if (avgMs < 600) {
    components.apiLatencyScore = 10;
    insights.push(`API gecikmesi yüksek: ${avgMs.toFixed(0)}ms`);
  } else {
    components.apiLatencyScore = 5;
    insights.push(`Kritik API gecikmesi: ${avgMs.toFixed(0)}ms`);
  }

  // ── 5. Error Rate (0-15) ────────────────────────────────────────────────────
  const errorRate = row.errorRate;
  if (errorRate < 1) {
    components.errorRateScore = 15;
  } else if (errorRate < 5) {
    components.errorRateScore = 10;
  } else if (errorRate < 15) {
    components.errorRateScore = 5;
    insights.push(`Hata oranı yüksek: %${errorRate.toFixed(1)}`);
  } else {
    components.errorRateScore = 0;
    insights.push(`Kritik hata oranı: %${errorRate.toFixed(1)}`);
  }

  // ── 6. Anomaly Penalty (0-10) ───────────────────────────────────────────────
  const anomalies = getAnomaliesByTenant(tenantId).filter((a) => !a.resolved);
  const highAnomalies = anomalies.filter((a) => a.severity === 'high').length;
  const medAnomalies = anomalies.filter((a) => a.severity === 'medium').length;

  const anomalyDeduction = Math.min(10, highAnomalies * 4 + medAnomalies * 2);
  components.anomalyScore = 10 - anomalyDeduction;
  if (anomalies.length > 0) insights.push(`${anomalies.length} aktif anomali tespit edildi.`);

  // ── Open Critical Alerts: extra penalty ────────────────────────────────────
  const openCritical = getAlertsByTenant(tenantId).filter(
    (a) => (a.severity === 'critical' || a.severity === 'emergency'),
  ).length;
  const alertPenalty = Math.min(10, openCritical * 3);

  // ── Total ───────────────────────────────────────────────────────────────────
  const raw =
    components.websocketScore +
    components.printerScore +
    components.syncScore +
    components.apiLatencyScore +
    components.errorRateScore +
    components.anomalyScore -
    alertPenalty;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const trend = computeTrend(tenantId, score);
  recordHistory(tenantId, score);

  if (insights.length === 0) insights.push('Sistem sağlıklı görünüyor.');

  return {
    tenantId,
    companyName: row.companyName,
    score,
    grade: gradeFromScore(score),
    components,
    insights,
    trend,
    updatedAt: new Date().toISOString(),
  };
}

export function computeAllHealthScores(): HealthScoreBreakdown[] {
  const rows = buildTenantObservabilityRows();
  return rows
    .map((r) => computeTenantHealthScore(r.tenantId))
    .filter((s): s is HealthScoreBreakdown => s !== null)
    .sort((a, b) => a.score - b.score); // worst first
}

export function getSystemHealthSummary() {
  const scores = computeAllHealthScores();
  if (scores.length === 0) return { avgScore: 100, unhealthyCount: 0, criticalCount: 0, tenantCount: 0 };

  const avg = scores.reduce((s, v) => s + v.score, 0) / scores.length;
  return {
    avgScore: Math.round(avg),
    unhealthyCount: scores.filter((s) => s.score < 60).length,
    criticalCount: scores.filter((s) => s.score < 40).length,
    tenantCount: scores.length,
    worstTenant: scores[0],
  };
}
