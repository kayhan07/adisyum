import { KdsScreenMockup, QrMenuMockup, MonitoringMockup } from '@/components/mockups';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Cloud POS & Offline First',
    description: 'İnternet kesildiğinde bile çalışmaya devam eder. Bağlantı tekrar kurulduğunda tüm veriler otomatik senkronize edilir.',
    tags: ['PWA', 'Service Worker', 'Conflict Resolution'],
  },
  {
    icon: '🖨️',
    title: 'Mutfak Yazıcı Altyapısı (KDS)',
    description: 'Her sipariş anında mutfağa iletilir. Yazıcı kopuklarında otomatik retry, kuyruk yönetimi ve Desktop Bridge entegrasyonu.',
    tags: ['Termal Yazıcı', 'ESC/POS', 'Desktop Bridge'],
  },
  {
    icon: '📱',
    title: 'Dijital QR Menü',
    description: 'Müşteriler masadan QR okuyarak sipariş verir, garson çağırır, hesap ister. Görsel, premium, ultra hızlı.',
    tags: ['Anında Yükleme', 'Görsel Menü', 'Mobil Ödeme'],
  },
  {
    icon: '📊',
    title: 'Canlı Raporlama & Analytics',
    description: 'Gerçek zamanlı satış verileri, trend analizi, kategori bazlı performans ve multi-branch kıyaslama.',
    tags: ['Gerçek Zamanlı', 'Multi-Branch', 'Export'],
  },
  {
    icon: '🏢',
    title: 'Çok Şubeli Yönetim',
    description: 'Onlarca şubeyi tek panelden yönetin. Her şube kendi tenant\'ında izole ama merkezi raporlamayla bağlı.',
    tags: ['Tenant Isolation', 'Merkezi Yönetim', 'Rol Bazlı'],
  },
  {
    icon: '🛡️',
    title: 'GİB Entegrasyon (Fiskal POS)',
    description: 'Türkiye\'nin vergi mevzuatına tam uyumlu. ÖKC entegrasyonu, e-arşiv fatura, otomatik fiş gönderimi.',
    tags: ['ÖKC', 'e-Arşiv', 'EFATURA'],
  },
  {
    icon: '🖥️',
    title: 'Desktop Bridge',
    description: 'Yazıcı, çekmece ve diğer donanımlarla yerel bağlantı. Bulut sisteminin yerel donanım desteği ile tam gücü.',
    tags: ['Windows App', 'USB/LAN', 'Offline'],
  },
  {
    icon: '👁️',
    title: 'Enterprise Monitoring',
    description: 'Her API isteği, her websocket bağlantısı, her printer durumu anlık izlenir. Self-healing altyapı.',
    tags: ['Anomaly Detection', 'DR/HA', 'Alerts'],
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-section-dark py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="inline-flex rounded-full bg-brand-500/12 px-4 py-1.5 text-sm font-semibold text-brand-400 ring-1 ring-brand-500/25">
            Platform Özellikleri
          </p>
          <h2 className="mt-5 text-4xl font-black tracking-tight text-white lg:text-5xl">
            Bir restoran için ihtiyacınız olan{' '}
            <span className="text-gradient-brand">her şey</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            POS'tan mutfak ekranına, QR menüden fiskal entegrasyona kadar — enterprise düzeyde, tek platform.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass-card-hover group rounded-2xl p-6"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6 text-2xl ring-1 ring-white/10 transition-all group-hover:bg-brand-500/15 group-hover:ring-brand-500/30">
                {f.icon}
              </div>
              <h3 className="text-base font-bold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {f.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-white/8">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Feature deep-dives */}
        <div className="mt-24 space-y-24">
          {/* KDS */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Mutfak Yönetimi</p>
              <h3 className="mt-3 text-3xl font-black text-white">Her siparişi, her saniye takip edin</h3>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Kitchen Display System siparişleri öncelik, süre ve masa bazlı sıralar. Kritik siparişler kırmızıyla belirgin, hazır olanlar yeşile döner.
                Wifi kesilse bile Desktop Bridge üzerinden yerel mutfak yazıcısı çalışmaya devam eder.
              </p>
              <ul className="mt-6 space-y-3">
                {['Öncelik sıralaması ve gecikme uyarısı', 'Garson mobil bildirimleri', 'Multi-printer routing (mutfak/bar/tatlı)', 'Yazıcı bağlantı kaybında otomatik kuyruk'].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <KdsScreenMockup />
          </div>

          {/* QR Menu */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex justify-center lg:order-2">
              <QrMenuMockup />
            </div>
            <div className="lg:order-1">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Dijital Menü</p>
              <h3 className="mt-3 text-3xl font-black text-white">QR oku, sipariş ver, öde</h3>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Müşteriniz masadaki QR'ı okur, görsel menüyü görür, siparişini doğrudan POS'a iletir.
                Garson çağırma ve hesap isteme de aynı ekranda.
              </p>
              <ul className="mt-6 space-y-3">
                {['Anlık görsel güncelleme (stok binişi)', 'Garson çağır & hesap iste', 'Sepet yönetimi — siparişi onaylamadan gönderme', 'Tamamen özelleştirilebilir marka + renk'].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Monitoring */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Enterprise Altyapı</p>
              <h3 className="mt-3 text-3xl font-black text-white">Sisteminiz asla uykuya geçmez</h3>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Her API isteği, her printer bağlantısı, her WebSocket oturumu anlık izlenir. Anomali tespiti, self-healing mekanizması ve otomatik DR playbook'ları ile sistem kendi kendini iyileştirir.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[['99.99%', 'Uptime'], ['< 80ms', 'API Yanıt'], ['< 5dk', 'RTO'], ['7/24', 'Destek'], ['SOC2', 'Uyumluluk'], ['E2E', 'Şifreleme']].map(([val, lbl]) => (
                  <div key={lbl} className="rounded-xl border border-white/6 bg-white/3 p-3 text-center">
                    <p className="text-lg font-black text-white">{val}</p>
                    <p className="text-[10px] text-slate-500">{lbl}</p>
                  </div>
                ))}
              </div>
            </div>
            <MonitoringMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
