const NAV = [
  {
    title: 'Ürün',
    links: [
      { label: 'Özellikler', href: '#features' },
      { label: 'Mutfak Ekranı (KDS)', href: '#features' },
      { label: 'QR Menü', href: '#features' },
      { label: 'Raporlama & Analitik', href: '#features' },
      { label: 'Fiyatlandırma', href: '#pricing' },
    ],
  },
  {
    title: 'Çözümler',
    links: [
      { label: 'Cafe & Restoran', href: '#' },
      { label: 'Zincir & Franchise', href: '#' },
      { label: 'Otel F&B', href: '#' },
      { label: 'Bayi Programı', href: '#demo' },
    ],
  },
  {
    title: 'Şirket',
    links: [
      { label: 'Hakkımızda', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Kariyer', href: '#' },
      { label: 'İletişim', href: '#demo' },
    ],
  },
  {
    title: 'Destek',
    links: [
      { label: 'Yardım Merkezi', href: '#' },
      { label: 'Durum Sayfası', href: '#' },
      { label: 'POS Arayüzü', href: 'https://app.adisyum.com' },
      { label: 'Admin Paneli', href: 'https://app.adisyum.com/app' },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/6">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-1">
            <a href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
                <span className="text-xs font-black text-white">A</span>
              </div>
              <span className="text-base font-black tracking-tight text-white">adisyum</span>
            </a>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed">
              Türkiye'nin en hızlı büyüyen bulut tabanlı restoran yönetim platformu.
            </p>
            {/* Socials */}
            <div className="mt-6 flex gap-3">
              {[
                { icon: 'X', href: '#', label: 'X (Twitter)' },
                { icon: 'in', href: '#', label: 'LinkedIn' },
                { icon: 'ig', href: '#', label: 'Instagram' },
              ].map((s) => (
                <a
                  key={s.icon}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {NAV.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">{col.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-slate-400 transition hover:text-white">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/6 pt-8 sm:flex-row">
          <p className="text-xs text-slate-600">
            © {year} Adisyum Yazılım A.Ş. Tüm hakları saklıdır.
          </p>
          <div className="flex gap-5">
            {['Gizlilik Politikası', 'KVKK Aydınlatma', 'Kullanım Şartları'].map((t) => (
              <a key={t} href="#" className="text-xs text-slate-600 transition hover:text-slate-400">
                {t}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
