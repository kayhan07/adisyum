import { PosDashboardMockup } from '@/components/mockups';

const STATS = [
  { value: '99.99%', label: 'Çalışma Süresi (Uptime)' },
  { value: '< 80ms', label: 'Ortalama API Yanıt' },
  { value: '500+', label: 'Aktif Restoran' },
  { value: '7/24', label: 'Teknik Destek' },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-hero-grid pt-28 pb-20 lg:pt-36 lg:pb-28">
      {/* Background glow orbs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-brand-500/8 blur-[120px]" />
        <div className="absolute top-1/2 -right-48 h-[400px] w-[600px] -translate-y-1/2 rounded-full bg-indigo-500/6 blur-[100px]" />
      </div>

      {/* Grid lines */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_40%,transparent_100%)] opacity-20" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        {/* Pill badge */}
        <div className="flex justify-center animate-fade-up" style={{ animationDelay: '0ms' }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-300">
            <span className="live-dot" />
            <span>Canlı Platform — 500+ Restoran Çalışıyor</span>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-8 text-center animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h1 className="mx-auto max-w-4xl text-5xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Restoranınızı bir{' '}
            <span className="text-gradient-brand">işletme platformuna</span>{' '}
            dönüştürün
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl">
            Cloud POS, offline-first altyapı, anlık mutfak yönetimi, QR menü ve canlı izleme — 
            tek entegre platform. Bağlantı kesilse bile çalışmaya devam eder.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-up" style={{ animationDelay: '160ms' }}>
          <a
            href="#demo"
            className="group inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-7 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(14,165,233,0.4)] transition hover:bg-brand-400 hover:shadow-[0_0_50px_rgba(14,165,233,0.55)] active:scale-95"
          >
            Ücretsiz Demo Talep Et
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 transition group-hover:translate-x-0.5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </a>
          <a
            href="/app/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-7 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-slate-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Uygulamaya Giriş
          </a>
          <a
            href="/system-admin/login"
            className="inline-flex items-center rounded-2xl border border-white/12 bg-white/5 px-7 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
          >
            System Admin
          </a>
        </div>

        {/* Trust micro-badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: '240ms' }}>
          {['Kredi kartı gerektirmez', 'Kurulum < 15 dk', 'Türk desteği 7/24'].map((text) => (
            <div key={text} className="flex items-center gap-1.5 text-sm text-slate-500">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-500">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              {text}
            </div>
          ))}
        </div>

        {/* Dashboard mockup */}
        <div className="mx-auto mt-16 max-w-5xl animate-fade-up" style={{ animationDelay: '320ms' }}>
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/6 to-white/2 p-1 shadow-[0_32px_80px_rgba(0,0,0,0.6),_0_0_0_1px_rgba(255,255,255,0.06)]">
            <div className="absolute inset-0 rounded-3xl bg-glow-brand opacity-60" />
            <PosDashboardMockup />
          </div>
        </div>

        {/* Stats bar */}
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-px rounded-3xl border border-white/8 bg-white/8 shadow-card-dark overflow-hidden sm:grid-cols-4 animate-fade-up" style={{ animationDelay: '400ms' }}>
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center bg-[#0d1626] px-4 py-5 text-center">
              <span className="text-2xl font-black text-white">{stat.value}</span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
