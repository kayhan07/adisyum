'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, LifeBuoy, MonitorCog, Printer, ShieldCheck } from 'lucide-react';

type DownloadMetadata = {
  ok: boolean;
  version: string;
  buildId: string;
  releasedAt: string;
  files: Array<{
    name: string;
    fileName: string;
    path: string;
    url: string;
    exists: boolean;
    sizeBytes: number;
    sizeLabel: string;
    sha256: string;
  }>;
};

const fallbackDownloads = [
  {
    name: 'Adisyum Desktop',
    fileName: 'AdisyumDesktopSetup.exe',
    path: '/downloads/windows/latest/AdisyumDesktopSetup.exe',
    url: 'https://adisyum.com/downloads/windows/latest/AdisyumDesktopSetup.exe',
    exists: false,
    sizeBytes: 0,
    sizeLabel: 'Kontrol ediliyor',
    sha256: 'pending',
  },
  {
    name: 'Printer Bridge',
    fileName: 'PrinterBridgeSetup.exe',
    path: '/downloads/windows/latest/PrinterBridgeSetup.exe',
    url: 'https://adisyum.com/downloads/windows/latest/PrinterBridgeSetup.exe',
    exists: false,
    sizeBytes: 0,
    sizeLabel: 'Kontrol ediliyor',
    sha256: 'pending',
  },
  {
    name: 'Fiscal POS Bridge',
    fileName: 'FiscalPosBridgeSetup.exe',
    path: '/downloads/windows/latest/FiscalPosBridgeSetup.exe',
    url: 'https://adisyum.com/downloads/windows/latest/FiscalPosBridgeSetup.exe',
    exists: false,
    sizeBytes: 0,
    sizeLabel: 'Kontrol ediliyor',
    sha256: 'pending',
  },
  {
    name: 'Alpemix',
    fileName: 'AlpemixSetup.exe',
    path: '/downloads/windows/latest/AlpemixSetup.exe',
    url: 'https://adisyum.com/downloads/windows/latest/AlpemixSetup.exe',
    exists: false,
    sizeBytes: 0,
    sizeLabel: 'Kontrol ediliyor',
    sha256: 'pending',
  },
];

const details: Record<string, string> = {
  'Adisyum Desktop': 'POS kabuğu, kiosk modu ve ilk kurulum sihirbazı',
  'Printer Bridge': 'Yazıcı keşfi, ESC/POS ve yerel kuyruk servisi',
  'Fiscal POS Bridge': 'Mali POS sürücü katmanı ve vendor adaptör paketi',
  Alpemix: 'Uzaktan destek oturumu',
};

export function DesktopSupportCenter() {
  const [metadata, setMetadata] = useState<DownloadMetadata | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/downloads/windows/metadata', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (mounted && payload?.ok) setMetadata(payload);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const downloads = useMemo(() => metadata?.files ?? fallbackDownloads, [metadata]);
  const releaseDate = metadata?.releasedAt ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(metadata.releasedAt)) : 'Kontrol ediliyor';
  function trackDownload(fileName: string) {
    const payload = JSON.stringify({ fileName, version: metadata?.version, status: 'started', source: 'desktop-support-center' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/downloads/windows/track', new Blob([payload], { type: 'application/json' }));
      return;
    }
    void fetch('/api/downloads/windows/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
  }

  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-slate-900/80 p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Yerel Operasyon</p>
          <h2 className="mt-2 text-2xl font-semibold">Masaüstü ve uzaktan destek</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Yerel yazıcılar, mali POS cihazları ve çevrimdışı operasyon için Windows bileşenlerini buradan indirin.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Sürüm {metadata?.version ?? 'kontrol ediliyor'} · Yayın {releaseDate}
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><ShieldCheck className="h-3.5 w-3.5" /> İmzalı paket</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><LifeBuoy className="h-3.5 w-3.5" /> Destek hazır</span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {downloads.map((item, index) => {
          const Icon = index === 0 ? MonitorCog : index === 1 ? Printer : index === 2 ? ShieldCheck : LifeBuoy;
          return (
            <a key={item.fileName} href={item.url} onClick={() => trackDownload(item.fileName)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/30 hover:bg-cyan-400/10">
              <Icon className="h-5 w-5 text-cyan-200" />
              <p className="mt-4 font-semibold">{item.name}</p>
              <p className="mt-2 min-h-10 text-sm text-slate-400">{details[item.name] ?? item.fileName}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span className="rounded-full bg-white/5 px-2 py-1">{item.exists ? item.sizeLabel : 'Dosya yok'}</span>
                <span className="rounded-full bg-white/5 px-2 py-1">{item.fileName}</span>
              </div>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
                <Download className="h-4 w-4" />
                İndir
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
