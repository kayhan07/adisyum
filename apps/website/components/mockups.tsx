// Inline SVG/CSS mockups — no external images required
// Premium UI wireframe visuals

export function PosDashboardMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-[1.6rem] bg-[#0a1628]">
      {/* Mac-style window chrome */}
      <div className="flex items-center gap-1.5 border-b border-white/6 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-rose-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-500/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
        <div className="mx-auto flex h-5 w-48 items-center justify-center rounded-full bg-white/5 text-[10px] text-slate-500">
          adisyum.com/app
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] min-h-[420px]">
        {/* Sidebar */}
        <aside className="border-r border-white/5 bg-[#070e1c] p-4 space-y-1">
          <div className="mb-4 flex items-center gap-2 px-2">
            <div className="h-7 w-7 rounded-lg bg-brand-500" />
            <div className="h-4 w-24 rounded bg-white/10" />
          </div>
          {['Genel Bakış','Siparişler','Masalar','Ürünler','Mutfak','QR Menü','Raporlar','Ayarlar'].map((item, i) => (
            <div
              key={item}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs ${
                i === 0 ? 'bg-brand-500/15 text-brand-300' : 'text-slate-500'
              }`}
            >
              <div className={`h-3.5 w-3.5 rounded ${i === 0 ? 'bg-brand-400' : 'bg-white/15'}`} />
              {item}
            </div>
          ))}
        </aside>

        {/* Main content */}
        <main className="p-5 space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Bugün Ciro', value: '₺18,240', delta: '+12%', c: 'text-emerald-400' },
              { label: 'Açık Masa', value: '14', delta: '6 hazır', c: 'text-amber-400' },
              { label: 'Bekleyen', value: '8', delta: '2 kritik', c: 'text-rose-400' },
              { label: 'Mutfak', value: '6 sipariş', delta: 'Ortalama 8dk', c: 'text-brand-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-white/6 bg-white/3 p-3">
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <p className="mt-1 text-base font-bold text-white">{kpi.value}</p>
                <p className={`text-[10px] font-semibold ${kpi.c}`}>{kpi.delta}</p>
              </div>
            ))}
          </div>

          {/* Floor map preview */}
          <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Salon — Katlı Görünüm</p>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 18 }).map((_, i) => {
                const status = i < 8 ? 'open' : i < 12 ? 'reserved' : i < 14 ? 'ready' : 'empty';
                const cls = {
                  open: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                  reserved: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
                  ready: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                  empty: 'border-white/6 bg-white/3 text-slate-600',
                }[status];
                return (
                  <div key={i} className={`flex h-10 items-center justify-center rounded-xl border text-[10px] font-bold ${cls}`}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent orders */}
          <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Son Siparişler</p>
            <div className="space-y-2">
              {[
                { table: 'Masa 4', item: 'Kaburga, Fıstık Ezmeli Tatlı, 2× Kola', status: 'Hazırlanıyor', c: 'text-amber-400' },
                { table: 'Masa 7', item: 'Taş Fırın Pizza Margarita, 1× Lemonade', status: 'Servise Hazır', c: 'text-emerald-400' },
                { table: 'Masa 12', item: '3× Espresso, Tiramisu', status: 'Teslim Edildi', c: 'text-slate-500' },
              ].map((o) => (
                <div key={o.table} className="flex items-center justify-between rounded-xl bg-white/3 px-3 py-2 text-[11px]">
                  <span className="font-bold text-white w-16">{o.table}</span>
                  <span className="flex-1 text-slate-400 truncate mx-3">{o.item}</span>
                  <span className={`font-semibold ${o.c}`}>{o.status}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function KdsScreenMockup() {
  const tickets = [
    { table: 'Masa 3', items: ['Antrikot (orta)', 'Közlenmiş Sebze', 'Izgara Kuzu'], time: '4:12', urgent: false },
    { table: 'Masa 7', items: ['Karışık Pizza', 'Lazanya', 'Çocuk Menüsü'], time: '8:45', urgent: true },
    { table: 'Masa 11', items: ['2× Kaburga', 'Pilav', 'Salata Bar'], time: '2:30', urgent: false },
    { table: 'Paket #48', items: ['Döner Dürüm', 'İçecek Seti'], time: '12:00', urgent: true },
  ];

  return (
    <div className="w-full rounded-2xl bg-[#0a0a0a] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold text-white uppercase tracking-widest">Mutfak Ekranı</span>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[10px] text-emerald-400">Canlı</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tickets.map((t) => (
          <div key={t.table} className={`rounded-xl border p-3 ${t.urgent ? 'border-rose-500/40 bg-rose-500/8' : 'border-white/8 bg-white/3'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold ${t.urgent ? 'text-rose-300' : 'text-white'}`}>{t.table}</span>
              <span className={`text-[10px] font-mono font-bold ${t.urgent ? 'text-rose-400' : 'text-slate-500'}`}>{t.time}</span>
            </div>
            <ul className="space-y-1">
              {t.items.map((item) => (
                <li key={item} className="text-[10px] text-slate-400">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QrMenuMockup() {
  const products = [
    { name: 'Kaburga', category: 'Ana Yemek', price: '₺480', gradient: 'from-red-800 to-orange-900' },
    { name: 'Margherita Pizza', category: 'Pizza', price: '₺280', gradient: 'from-amber-800 to-yellow-900' },
    { name: 'Espresso', category: 'İçecek', price: '₺95', gradient: 'from-stone-800 to-neutral-900' },
  ];

  return (
    <div className="mx-auto w-48 rounded-[2rem] border-4 border-white/15 bg-[#08111f] p-3 shadow-xl">
      <div className="mb-3 text-center">
        <p className="text-[9px] font-bold uppercase tracking-widest text-brand-400">QR Menü</p>
        <p className="text-sm font-bold text-white">Masa 5</p>
      </div>
      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.name} className="overflow-hidden rounded-xl">
            <div className={`h-12 bg-gradient-to-br ${p.gradient} flex items-end p-2`}>
              <p className="text-[9px] font-bold text-white">{p.name}</p>
            </div>
            <div className="flex items-center justify-between bg-white/5 px-2 py-1.5">
              <span className="text-[8px] text-slate-500">{p.category}</span>
              <span className="text-[9px] font-bold text-white">{p.price}</span>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="mt-3 w-full rounded-xl bg-brand-500 py-1.5 text-[9px] font-bold text-white">
        Sipariş Gönder
      </button>
    </div>
  );
}

export function MonitoringMockup() {
  return (
    <div className="w-full rounded-2xl border border-white/8 bg-[#0a1628] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold text-white">Canlı İzleme</span>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[10px] text-emerald-400">Tüm sistemler normal</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'API Yanıt', value: '68ms', ok: true },
          { label: 'DB Bağlantı', value: '12/50', ok: true },
          { label: 'WebSocket', value: '342', ok: true },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-white/4 p-2 text-center">
            <p className={`text-sm font-bold ${m.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{m.value}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      {/* Mini chart */}
      <div className="flex items-end gap-0.5 h-12 rounded-xl bg-white/3 p-2">
        {[35, 52, 48, 72, 65, 88, 76, 82, 94, 78, 90, 85, 92, 88, 96, 98, 92, 88, 95, 100].map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-brand-500/60"
            style={{ height: `${v}%` }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-right text-[9px] text-slate-600">İstek/saniye — son 60 sn</p>
    </div>
  );
}
