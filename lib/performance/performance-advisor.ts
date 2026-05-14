/**
 * ADISYUM Performance Intelligence Advisor
 * AI-like performance recommendations based on live metrics.
 */

import { buildTenantObservabilityRows, getRecentSlowQueries } from '@/lib/observability/metrics-store';
import { getQueueMetrics } from '@/lib/queue/enterprise-queue';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdvisoryCategory =
  | 'slow_tenant'
  | 'inefficient_query'
  | 'overloaded_printer'
  | 'sync_bottleneck'
  | 'redis_saturation'
  | 'websocket_bottleneck'
  | 'queue_backlog'
  | 'memory_pressure'
  | 'high_error_tenant';

export type Advisory = {
  id: string;
  category: AdvisoryCategory;
  tenantId?: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  recommendation: string;
  metrics: Record<string, number | string>;
  generatedAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return `adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function nowIso() { return new Date().toISOString(); }

function makeAdvisory(input: Omit<Advisory, 'id' | 'generatedAt'>): Advisory {
  return { ...input, id: uid(), generatedAt: nowIso() };
}

// ─── Analysis Functions ───────────────────────────────────────────────────────

function analyzeSlowTenants(advisories: Advisory[]) {
  const rows = buildTenantObservabilityRows();

  for (const row of rows) {
    if (row.avgResponseMs > 500) {
      advisories.push(makeAdvisory({
        category: 'slow_tenant',
        tenantId: row.tenantId,
        severity: row.avgResponseMs > 1000 ? 'high' : 'medium',
        title: `Yavaş API yanıtı: ${row.companyName}`,
        recommendation: `Ortalama ${row.avgResponseMs.toFixed(0)}ms yanıt süresi yüksek. Veritabanı sorgu optimizasyonu, Redis önbellekleme veya CDN kullanımını değerlendirin.`,
        metrics: { avgResponseMs: row.avgResponseMs },
      }));
    }

    if (row.errorRate > 5) {
      advisories.push(makeAdvisory({
        category: 'high_error_tenant',
        tenantId: row.tenantId,
        severity: row.errorRate > 20 ? 'high' : 'medium',
        title: `Yüksek hata oranı: ${row.companyName}`,
        recommendation: `%${row.errorRate.toFixed(1)} hata oranı. Son hataları inceleyin, timeout ayarlarını gözden geçirin.`,
        metrics: { errorRate: row.errorRate },
      }));
    }

    if (row.printerTotalCount > 0 && row.printerOnlineCount < row.printerTotalCount) {
      const offlineCount = row.printerTotalCount - row.printerOnlineCount;
      advisories.push(makeAdvisory({
        category: 'overloaded_printer',
        tenantId: row.tenantId,
        severity: offlineCount === row.printerTotalCount ? 'high' : 'medium',
        title: `Yazıcı sorunu: ${row.companyName}`,
        recommendation: `${offlineCount}/${row.printerTotalCount} yazıcı çevrimdışı. Ağ bağlantısını, yazıcı agentını ve kağıt/toner durumunu kontrol edin.`,
        metrics: { onlineCount: row.printerOnlineCount, totalCount: row.printerTotalCount },
      }));
    }

    if (row.syncFailures > 5) {
      advisories.push(makeAdvisory({
        category: 'sync_bottleneck',
        tenantId: row.tenantId,
        severity: row.syncFailures > 20 ? 'high' : 'medium',
        title: `Sync sorunu: ${row.companyName}`,
        recommendation: `${row.syncFailures} sync hatası. İnternet bağlantısını, offline queue boyutunu ve API endpoint sağlığını kontrol edin.`,
        metrics: { syncFailures: row.syncFailures, syncPending: row.syncPending },
      }));
    }

    if (row.websocketHealth === 'degraded') {
      advisories.push(makeAdvisory({
        category: 'websocket_bottleneck',
        tenantId: row.tenantId,
        severity: 'medium',
        title: `WebSocket instability: ${row.companyName}`,
        recommendation: 'WebSocket bağlantısı kararsız. Pusher/Soketi server sağlığını, CORS ayarlarını ve client reconnect mantığını kontrol edin.',
        metrics: { websocketHealth: row.websocketHealth },
      }));
    }
  }
}

function analyzeSlowQueries(advisories: Advisory[]) {
  const queries = getRecentSlowQueries(50);
  if (!queries.length) return;

  // Group by query prefix to find repeat offenders
  const queryGroups: Record<string, { count: number; maxMs: number; avgMs: number; example: string }> = {};

  for (const q of queries) {
    const prefix = q.query.slice(0, 60);
    if (!queryGroups[prefix]) {
      queryGroups[prefix] = { count: 0, maxMs: 0, avgMs: 0, example: q.query };
    }
    queryGroups[prefix].count += 1;
    queryGroups[prefix].maxMs = Math.max(queryGroups[prefix].maxMs, q.durationMs);
    queryGroups[prefix].avgMs = (queryGroups[prefix].avgMs * (queryGroups[prefix].count - 1) + q.durationMs) / queryGroups[prefix].count;
  }

  for (const [prefix, stats] of Object.entries(queryGroups)) {
    if (stats.avgMs > 300 || stats.count > 5) {
      advisories.push(makeAdvisory({
        category: 'inefficient_query',
        severity: stats.avgMs > 1000 ? 'high' : stats.avgMs > 500 ? 'medium' : 'low',
        title: 'Yavaş veritabanı sorgusu',
        recommendation: `"${prefix.slice(0, 40)}…" sorgusu ortalama ${stats.avgMs.toFixed(0)}ms sürüyor (${stats.count} kez). Index ekleyin veya sorguyu optimize edin.`,
        metrics: { count: stats.count, avgMs: Math.round(stats.avgMs), maxMs: stats.maxMs },
      }));
    }
  }
}

function analyzeQueues(advisories: Advisory[]) {
  const metrics = getQueueMetrics();

  for (const m of metrics) {
    if (m.pending > 100) {
      advisories.push(makeAdvisory({
        category: 'queue_backlog',
        severity: m.pending > 500 ? 'high' : 'medium',
        title: `Queue birikimi: ${m.queue}`,
        recommendation: `'${m.queue}' kuyruğunda ${m.pending} bekleyen iş var. İşleyici sayısını artırın veya job önceliklerini gözden geçirin.`,
        metrics: { pending: m.pending, dead: m.dead, throughputLastMinute: m.throughputLastMinute },
      }));
    }

    if (m.dead > 50) {
      advisories.push(makeAdvisory({
        category: 'queue_backlog',
        severity: 'medium',
        title: `Dead letter queue: ${m.queue}`,
        recommendation: `'${m.queue}' kuyruğunda ${m.dead} başarısız iş var. Dead letter queue'yu inceleyin ve hata nedenlerini giderin.`,
        metrics: { dead: m.dead },
      }));
    }
  }
}

// ─── Main Advisor ─────────────────────────────────────────────────────────────

export function generatePerformanceAdvisories(): Advisory[] {
  const advisories: Advisory[] = [];

  try { analyzeSlowTenants(advisories); } catch { /* non-fatal */ }
  try { analyzeSlowQueries(advisories); } catch { /* non-fatal */ }
  try { analyzeQueues(advisories); } catch { /* non-fatal */ }

  // Sort: high first
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return advisories.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function getPerformanceSummary() {
  const advisories = generatePerformanceAdvisories();
  return {
    total: advisories.length,
    high: advisories.filter((a) => a.severity === 'high').length,
    medium: advisories.filter((a) => a.severity === 'medium').length,
    low: advisories.filter((a) => a.severity === 'low').length,
    topAdvisories: advisories.slice(0, 5),
  };
}
