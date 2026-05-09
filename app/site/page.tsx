import Link from 'next/link';

export const metadata = {
  title: 'Restoran Adisyon Programı | Paket Servis ve Kurye Takibi',
  description: 'Restoranınızda sipariş, kurye ve kasa yönetimini tek ekranda yönetin.',
  keywords: ['restoran adisyon programı', 'paket servis yazılımı', 'kurye takip sistemi', 'restoran otomasyonu'],
};

export default function MarketingSitePage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/site" className="text-lg font-semibold">Adisyon</Link>
          <Link href="/adisyonsistemi" className="rounded-2xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white">Giriş</Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2563EB]">Restoran POS / ERP</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight md:text-6xl">Sipariş, kurye ve kasa tek ekranda</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">Yoğun saatte sipariş karışmasın, paket servis kaybolmasın, kasa farkı sürpriz olmasın. Restoran operasyonunu tek panelden yönetin.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/adisyonsistemi" className="rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-5 py-3 text-sm font-semibold text-white">Hemen Başla</Link>
            <Link href="/demo" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold">Demo Talep Et</Link>
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <div className="rounded-[1.5rem] bg-[#0F172A] p-5 text-white">
            <div className="grid grid-cols-3 gap-3">
              {['Yeni', 'Hazırlık', 'Yolda'].map((item, index) => (
                <div key={item} className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs text-slate-300">{item}</p>
                  <p className="mt-2 text-3xl font-semibold">{[8, 5, 3][index]}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {['Masa 12 - POS', 'Ayşe Yılmaz - Paket Servis', 'Kurye Deniz - 1.240 TL'].map((item) => (
                <div key={item} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#0F172A]">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
