import { Download, LifeBuoy, MonitorCog, Printer, ShieldCheck } from 'lucide-react';

const downloads = [
  {
    title: 'Adisyum Desktop',
    detail: 'POS kabuğu, kiosk modu ve ilk kurulum sihirbazı',
    href: 'https://downloads.adisyum.com/windows/AdisyumDesktopSetup.exe',
  },
  {
    title: 'Printer Bridge',
    detail: 'Yazıcı keşfi, ESC/POS ve yerel kuyruk servisi',
    href: 'https://downloads.adisyum.com/windows/AdisyumPrinterBridge.exe',
  },
  {
    title: 'Fiscal POS Bridge',
    detail: 'Mali POS sürücü katmanı ve vendor adaptör paketi',
    href: 'https://downloads.adisyum.com/windows/AdisyumFiscalBridge.exe',
  },
  {
    title: 'Alpemix',
    detail: 'Uzaktan destek oturumu',
    href: 'https://www.alpemix.com/en/download',
  },
];

export function DesktopSupportCenter() {
  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-slate-900/80 p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Yerel Operasyon</p>
          <h2 className="mt-2 text-2xl font-semibold">Masaüstü ve uzaktan destek</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Yerel yazıcılar, mali POS cihazları ve çevrimdışı operasyon için Windows bileşenlerini buradan indirin.
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
            <a key={item.title} href={item.href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/30 hover:bg-cyan-400/10">
              <Icon className="h-5 w-5 text-cyan-200" />
              <p className="mt-4 font-semibold">{item.title}</p>
              <p className="mt-2 min-h-10 text-sm text-slate-400">{item.detail}</p>
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
