const TESTIMONIALS = [
  {
    name: 'Kemal Aydın',
    role: 'Kurucu Ortak',
    place: 'Bosphorus Fine Dining, İstanbul',
    avatar: 'KA',
    color: 'from-brand-600 to-brand-800',
    quote:
      'Adisyum\'a geçtiğimizden bu yana mutfak koordinasyonu %40 iyileşti. Garsonlarımız artık masadan masaya koşmak yerine müşteriye odaklanıyor.',
  },
  {
    name: 'Selin Karataş',
    role: 'Genel Müdür',
    place: 'Karataş Restoran Grubu (8 Şube)',
    avatar: 'SK',
    color: 'from-violet-600 to-purple-800',
    quote:
      '8 şubeyi tek panelden yönetmek artık gerçek. Her şubenin anlık cirosu, stok durumu ve masa doluluk oranı cebimde.',
  },
  {
    name: 'Mehmet Yıldız',
    role: 'İşletme Sahibi',
    place: 'Yıldız Kafeterya Zinciri',
    avatar: 'MY',
    color: 'from-emerald-600 to-teal-800',
    quote:
      'Offline çalışma özelliği hayat kurtarıcı. İnternet kesintilerinde bile siparişler kayda geçiyor, bağlantı gelince anında senkronize oluyor.',
  },
];

const METRICS = [
  { metric: '+38%', label: 'Masa devir hızı artışı', desc: 'QR Menü & dijital sipariş' },
  { metric: '-52%', label: 'Yazıcı kaynaklı hata', desc: 'Desktop Bridge & yeniden deneme' },
  { metric: '4.8/5', label: 'Ortalama müşteri notu', desc: 'Beta pilot restoran grubu' },
  { metric: '< 15dk', label: 'Kurulum süresi', desc: 'Sıfır IT bilgisi gerekmiyor' },
];

export function TrustSection() {
  return (
    <section id="trust" className="relative py-24 lg:py-32">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_60%_at_50%_50%,rgba(14,165,233,0.04),transparent)]" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        {/* Metrics */}
        <div className="mb-20 text-center">
          <p className="inline-flex rounded-full bg-emerald-500/12 px-4 py-1.5 text-sm font-semibold text-emerald-400 ring-1 ring-emerald-500/25">
            Kanıtlanmış Sonuçlar
          </p>
          <h2 className="mt-5 text-4xl font-black text-white lg:text-5xl">
            Rakamlar yalan söylemez
          </h2>
        </div>

        <div className="mb-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.metric} className="rounded-3xl border border-white/8 bg-white/3 p-6 text-center">
              <p className="text-4xl font-black text-white">{m.metric}</p>
              <p className="mt-1 text-sm font-bold text-slate-200">{m.label}</p>
              <p className="mt-1 text-xs text-slate-500">{m.desc}</p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid gap-6 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="glass-card rounded-3xl p-7">
              {/* Stars */}
              <div className="flex gap-0.5 mb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-sm leading-relaxed text-slate-300">"{t.quote}"</blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-xs font-bold text-white`}>
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role} · {t.place}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Uptime visual */}
        <div className="mt-20 rounded-3xl border border-white/8 bg-white/3 p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Platform Uptime — Son 90 Gün</h3>
              <p className="mt-1 text-sm text-slate-400">Tüm servisler operasyonel</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/12 px-4 py-2 ring-1 ring-emerald-500/25">
              <span className="live-dot" />
              <span className="text-sm font-bold text-emerald-300">99.99% uptime</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-16">
            {Array.from({ length: 90 }).map((_, i) => {
              const h = 70 + Math.sin(i * 0.3 + 1) * 20 + (i > 75 ? -30 : 0);
              const isDown = i === 77 || i === 78;
              return (
                <div
                  key={i}
                  title={isDown ? 'Kısa kesinti' : 'Normal'}
                  className={`flex-1 rounded-sm ${isDown ? 'bg-rose-500/80' : 'bg-emerald-500/70'}`}
                  style={{ height: `${isDown ? 40 : h}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-600">
            <span>90 gün önce</span>
            <span className="text-rose-400">2× &lt; 5dk kesinti</span>
            <span>Bugün</span>
          </div>
        </div>
      </div>
    </section>
  );
}
