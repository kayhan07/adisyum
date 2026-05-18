'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Activity, Boxes, Printer, Wifi } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { DeviceCertificationPanel } from '@/components/device-certification-panel';
import type { OperationalHealth } from '@/lib/operational-intelligence/engine';

export default function OperationsPage() {
  const [health, setHealth] = useState<OperationalHealth | null>(null);
  useEffect(() => {
    void fetch('/api/operational-intelligence', { credentials: 'include', cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setHealth(payload.health ?? null))
      .catch(() => setHealth(null));
  }, []);

  return (
    <AppShell title="Operasyon Sağlığı" subtitle="Ürün, reçete, stok, yazıcı ve senkronizasyon kalitenizi tek ekranda izleyin.">
      {!health ? <p className="text-sm text-muted">Operasyon verisi yükleniyor...</p> : (
        <div className="grid gap-5">
          <section className="grid gap-3 md:grid-cols-5">
            {([
              ['Genel sağlık', health.healthScore, Activity],
              ['Operasyon', health.operationalScore, Activity],
              ['Stok doğruluğu', health.stockAccuracyScore, Boxes],
              ['Senkronizasyon', health.syncHealthScore, Wifi],
              ['Yazıcı', health.printerHealthScore, Printer],
            ] as const).map(([label, value, Icon]) => (
              <article key={String(label)} className="rounded-3xl border border-line bg-panel p-5">
                <Icon className="h-4 w-4 text-accent" />
                <p className="mt-4 text-sm text-muted">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
              </article>
            ))}
          </section>
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <article className="rounded-3xl border border-line bg-panel p-5">
              <h2 className="text-lg font-semibold text-ink">Akıllı uyarılar</h2>
              <div className="mt-4 grid gap-3">
                {health.issues.length === 0 ? <p className="text-sm text-muted">Kritik sorun bulunamadı.</p> : health.issues.map((issue) => (
                  <div key={issue.code} className="rounded-2xl border border-line bg-canvas p-4">
                    <p className="flex items-center gap-2 font-semibold text-ink"><AlertTriangle className="h-4 w-4 text-amber-500" /> {issue.title}</p>
                    <p className="mt-1 text-sm text-muted">{issue.detail} ({issue.count})</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-3xl border border-line bg-panel p-5">
              <h2 className="text-lg font-semibold text-ink">Bugünün içgörüleri</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <p>Açık sipariş: <strong>{health.insights.openOrders}</strong></p>
                <p>Günlük ciro: <strong>₺{health.insights.dailyRevenue.toLocaleString('tr-TR')}</strong></p>
                <p>En çok satan: <strong>{health.insights.mostSoldProducts[0]?.name ?? '-'}</strong></p>
                <p>Yoğun saat: <strong>{health.insights.peakHours[0] ? `${health.insights.peakHours[0].hour}:00` : '-'}</strong></p>
              </div>
            </article>
          </section>
          <DeviceCertificationPanel />
        </div>
      )}
    </AppShell>
  );
}
