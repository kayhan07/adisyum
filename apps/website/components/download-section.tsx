const TRUST_ITEMS = [
  'Signed Installer',
  'SHA256 Verified',
  'Automatic Updates',
  'Offline Support',
  'Windows Compatible',
];

const RELEASE_VERSION = process.env.NEXT_PUBLIC_ADISYUM_WINDOWS_VERSION || '0.1.7';
const INSTALLER_SIZE = process.env.NEXT_PUBLIC_ADISYUM_WINDOWS_INSTALLER_SIZE || '85.9 MB';
const INSTALLER_URL =
  process.env.NEXT_PUBLIC_ADISYUM_WINDOWS_INSTALLER_URL ||
  '/downloads/windows/latest/AdisyumDesktopSetup.exe?v=windows-1781700703379';

export function DownloadSection() {
  return (
    <section id="download" className="relative py-24 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_20%,rgba(20,184,166,0.08),transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-emerald-500/12 px-4 py-1.5 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
              Windows Desktop Bridge
            </p>
            <h2 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-white lg:text-5xl">
              Restoran cihazlari icin guvenli Windows kurulumu
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">
              Adisyum Desktop Bridge yazici, offline sync ve cihaz baglantilarini browser bagimliligindan
              ayirir. Stable kanal her zaman imzali installer uzerinden dagitilir.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={INSTALLER_URL}
                className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-7 text-sm font-black text-slate-950 shadow-[0_6px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 active:scale-[0.98]"
              >
                Windows icin indir
              </a>
              <a
                href="/downloads/windows/latest.json"
                className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-7 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Release manifest
              </a>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">AdisyumDesktopSetup.exe</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{RELEASE_VERSION}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{INSTALLER_SIZE}</span>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                Signed installer
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/4 p-6 shadow-2xl shadow-black/20">
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
              <div className="flex items-center justify-between border-b border-white/8 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stable release</p>
                  <h3 className="mt-1 text-xl font-black text-white">AdisyumDesktopSetup.exe</h3>
                </div>
                <div className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/25">
                  Verified
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {TRUST_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/25">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 010 1.415l-7.25 7.25a1 1 0 01-1.415 0L3.296 9.21A1 1 0 014.71 7.796l4.036 4.036 6.543-6.543a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{item}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-6 text-slate-500">
                Downloads are served from adisyum.com/downloads with immutable versioned paths and cache-safe release manifests.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
