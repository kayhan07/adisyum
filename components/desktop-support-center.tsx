'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, LifeBuoy, MonitorCog, Printer, ShieldCheck } from 'lucide-react';

type DownloadMetadata = {
  ok: boolean;
  version: string;
  buildId: string;
  releasedAt: string;
  files: DownloadItem[];
};

type DownloadItem = {
  name: string;
  fileName: string;
  path: string;
  versionedPath?: string;
  version?: string;
  url: string;
  exists: boolean;
  executable?: boolean;
  healthy?: boolean;
  sizeBytes: number;
  sizeLabel: string;
  sha256: string;
};

const latestBuildId = 'windows-1781737725566';

const fallbackDownloads: DownloadItem[] = [
  {
    name: 'Adisyum Desktop',
    fileName: 'AdisyumDesktopSetup.exe',
    path: '/downloads/windows/latest/AdisyumDesktopSetup.exe',
    versionedPath: '/downloads/windows/v0.1.7/AdisyumDesktopSetup.exe',
    version: '0.1.7',
    url: `https://adisyum.com/downloads/windows/latest/AdisyumDesktopSetup.exe?v=${latestBuildId}`,
    exists: true,
    executable: true,
    healthy: true,
    sizeBytes: 85929118,
    sizeLabel: '81.9 MB (85.929.118 byte)',
    sha256: '0ec2172ad28cbe5f7df14603e3cecf687c4955289ef1ea8ed58d59123a505c71',
  },
  {
    name: 'Printer Bridge',
    fileName: 'PrinterBridgeSetup.exe',
    path: '/downloads/windows/latest/PrinterBridgeSetup.exe',
    versionedPath: '/downloads/windows/v0.1.7/PrinterBridgeSetup.exe',
    version: '0.1.7',
    url: `https://adisyum.com/downloads/windows/latest/PrinterBridgeSetup.exe?v=${latestBuildId}`,
    exists: true,
    executable: true,
    healthy: true,
    sizeBytes: 69284369,
    sizeLabel: '66.1 MB (69.284.369 byte)',
    sha256: '10c8d563bb922aa6e1bfd4ac11191f947d0e7f7facb8f1c220c8361c70ca10f8',
  },
  {
    name: 'Fiscal POS Bridge',
    fileName: 'FiscalPosBridgeSetup.exe',
    path: '/downloads/windows/latest/FiscalPosBridgeSetup.exe',
    versionedPath: '/downloads/windows/v0.1.7/FiscalPosBridgeSetup.exe',
    version: '0.1.7',
    url: `https://adisyum.com/downloads/windows/latest/FiscalPosBridgeSetup.exe?v=${latestBuildId}`,
    exists: true,
    executable: true,
    healthy: true,
    sizeBytes: 69284369,
    sizeLabel: '66.1 MB (69.284.369 byte)',
    sha256: '10c8d563bb922aa6e1bfd4ac11191f947d0e7f7facb8f1c220c8361c70ca10f8',
  },
];

const details: Record<string, string> = {
  'Adisyum Desktop': 'POS kabuğu, kiosk modu ve ilk kurulum sihirbazı',
  'Printer Bridge': 'Yazıcı keşfi, ESC/POS ve yerel kuyruk servisi',
  'Fiscal POS Bridge': 'Mali POS sürücü katmanı ve vendor adaptör paketi',
};

const downloadLabels: Record<string, string> = {
  AdisyumDesktopSetup: 'Windows Uygulamasını İndir',
  PrinterBridgeSetup: 'Yazıcı Köprüsünü İndir',
  FiscalPosBridgeSetup: 'Mali POS Köprüsünü İndir',
};

function cacheBustedUrl(item: DownloadItem, buildId?: string) {
  const path = item.path || item.versionedPath || item.url;
  const originSafePath = path.startsWith('http') ? path : `https://adisyum.com${path}`;
  const separator = originSafePath.includes('?') ? '&' : '?';
  return `${originSafePath}${separator}v=${encodeURIComponent(buildId || item.sha256 || 'latest')}`;
}

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
  const releaseVersion = metadata?.version ?? '0.1.7';
  const releaseBuildId = metadata?.buildId ?? latestBuildId;
  const releaseDate = metadata?.releasedAt ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(metadata.releasedAt)) : '16 Haziran 2026';
  const shortBuildId = releaseBuildId.replace(/^windows-/, '').slice(-8);

  function trackDownload(fileName: string) {
    const payload = JSON.stringify({ fileName, version: releaseVersion, status: 'started', source: 'desktop-support-center' });
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
          <h2 className="mt-2 text-2xl font-semibold">Masaüstü ve yerel cihaz desteği</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Yerel yazıcılar, mali POS cihazları ve çevrimdışı operasyon için Windows bileşenlerini buradan indirin.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Build: {shortBuildId} · Tam buildId: {releaseBuildId} · Yayın {releaseDate}
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><ShieldCheck className="h-3.5 w-3.5" /> Kurulum paketi</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-2"><LifeBuoy className="h-3.5 w-3.5" /> Destek hazır</span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {downloads.map((item, index) => {
          const Icon = index === 0 ? MonitorCog : index === 1 ? Printer : ShieldCheck;
          const ready = item.exists && (item.healthy ?? item.executable ?? item.sizeBytes > 100 * 1024);
          const href = cacheBustedUrl(item, releaseBuildId);
          const label = downloadLabels[item.fileName.replace('.exe', '')] ?? 'İndir';
          const itemVersion = item.version ?? releaseVersion;
          return (
            <a
              key={item.fileName}
              href={ready ? href : undefined}
              aria-disabled={!ready}
              onClick={() => ready && trackDownload(item.fileName)}
              className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition ${ready ? 'hover:border-cyan-300/30 hover:bg-cyan-400/10' : 'pointer-events-none opacity-60'}`}
            >
              <Icon className="h-5 w-5 text-cyan-200" />
              <p className="mt-4 font-semibold">{item.name}</p>
              <p className="mt-2 min-h-10 text-sm text-slate-400">{details[item.name] ?? item.fileName}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span className="rounded-full bg-white/5 px-2 py-1">{item.exists ? item.sizeLabel : 'Dosya yok'}</span>
                <span className={`rounded-full px-2 py-1 ${ready ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>
                  {ready ? 'Geçerli EXE' : 'Yayın dışı'}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-1">{item.fileName}</span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-100">v{itemVersion}</span>
                <span className="rounded-full bg-white/5 px-2 py-1">sha {item.sha256.slice(0, 8)}</span>
                <span className="rounded-full bg-white/5 px-2 py-1">build {shortBuildId}</span>
              </div>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
                <Download className="h-4 w-4" />
                {label}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
