const plans = [
  {
    id: 'baslangic',
    name: 'Başlangıç',
    tagline: 'Tek lokasyon için ideal',
    price: '₺990',
    period: '/ ay',
    highlight: false,
    badge: null,
    features: [
      'Bulut POS Sistemi',
      '1 şube / 30 masa',
      'QR Menü (sınırsız tarama)',
      'Desktop Bridge (1 bilgisayar)',
      'Günlük GİB e-arşiv',
      'Temel analitik raporlar',
      'E-posta desteği',
      'Ücretsiz onboarding',
    ],
    cta: 'Ücretsiz Başla',
    ctaHref: '#demo',
  },
  {
    id: 'buyume',
    name: 'Büyüme',
    tagline: 'Büyüyen restoranlar için',
    price: '₺2.490',
    period: '/ ay',
    highlight: true,
    badge: 'En Popüler',
    features: [
      'Her şey dahil — Başlangıç +',
      '5 şube / sınırsız masa',
      'Mutfak Ekranı (KDS)',
      'Gelişmiş yönetim paneli',
      'Stok ve hammadde takibi',
      'Çoklu Ödeme & Taksit',
      'API erişimi (beta)',
      '7/24 öncelikli destek',
    ],
    cta: 'Demo Talep Et',
    ctaHref: '#demo',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Zincir & kurumsal gruplar',
    price: null,
    period: null,
    highlight: false,
    badge: 'Özel Fiyat',
    features: [
      'Her şey dahil — Büyüme +',
      'Sınırsız şube & terminal',
      'Özel entegrasyonlar (ERP/HRM)',
      'HA aktif-aktif multi-region',
      'SLA garantisi (%99.99)',
      'Özel onboarding & eğitim',
      'Bayi & franchise yönetimi',
      'Dedicated destek hattı',
    ],
    cta: 'Fiyat Alın',
    ctaHref: '#demo',
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-24 lg:py-32 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(14,165,233,0.06),transparent)]">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-16">
          <p className="inline-flex rounded-full bg-brand-500/12 px-4 py-1.5 text-sm font-semibold text-brand-400 ring-1 ring-brand-500/25">
            Şeffaf Fiyatlandırma
          </p>
          <h2 className="mt-5 text-4xl font-black text-white lg:text-5xl">
            İşletmenizin büyüklüğüne uygun plan
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Tüm planlarda 14 gün iade garantisi. Kurulum ücreti yok, gizli maliyet yok.
          </p>
        </div>

        {/* Cards */}
        <div className="grid gap-6 lg:grid-cols-3 items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl p-8 transition-all ${
                plan.highlight
                  ? 'bg-gradient-to-b from-brand-600/20 to-brand-900/20 border border-brand-500/40 shadow-[0_0_60px_-10px_rgba(14,165,233,0.3)]'
                  : 'glass-card'
              }`}
            >
              {plan.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold ${
                  plan.highlight ? 'bg-brand-500 text-white' : 'bg-slate-700 text-slate-200'
                }`}>
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-black text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
                <div className="mt-5 flex items-end gap-1">
                  {plan.price ? (
                    <>
                      <span className="text-4xl font-black text-white">{plan.price}</span>
                      <span className="mb-1 text-sm text-slate-400">{plan.period}</span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-white">Görüşelim</span>
                  )}
                </div>
              </div>

              <ul className="mb-8 flex flex-col gap-3 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg viewBox="0 0 16 16" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={plan.ctaHref}
                className={`block rounded-2xl px-6 py-3.5 text-center text-sm font-bold transition-all ${
                  plan.highlight
                    ? 'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_4px_20px_rgba(14,165,233,0.35)]'
                    : 'border border-white/12 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Bayi note */}
        <p className="mt-10 text-center text-sm text-slate-500">
          Bayi / franchise yönetimi arıyorsanız{' '}
          <a href="#demo" className="text-brand-400 underline underline-offset-2 hover:text-brand-300">
            bayi başvuru formuna bakın
          </a>
          .
        </p>
      </div>
    </section>
  );
}
