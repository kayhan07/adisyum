'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Grid2x2,
  Package2,
  ShoppingBasket,
  Wallet,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { erpIngredients, formatTRY } from '@/lib/erp-engine';
import { getDailyPurchaseInvoiceCount, getDailyPurchaseInvoiceTotal, loadStoredPurchaseInvoices } from '@/lib/purchase-invoice-store';
import { DEFAULT_SALE_PRODUCT_BASE, loadStoredSaleProducts } from '@/lib/sale-product-catalog';
import { loadStoredRawIngredients } from '@/lib/raw-ingredient-store';
import { loadAllWarehouseStocks, MAIN_WAREHOUSE_ID } from '@/lib/warehouse-store';

const quickLinks = [
  {
    href: '/floor',
    label: 'Masalar',
    description: 'Salon akisi ve acik adisyonlar',
    icon: Grid2x2,
  },
  {
    href: '/finance',
    label: 'Finans',
    description: 'Kasa, tahsilat ve faturalar',
    icon: Wallet,
  },
  {
    href: '/products',
    label: 'Urunler',
    description: 'Stok, recete ve satis kartlari',
    icon: Package2,
  },
  {
    href: '/reports',
    label: 'Raporlar',
    description: 'Gunluk performans ve ozetler',
    icon: Activity,
  },
];

export default function OverviewPage() {
  // Lazy-initialized state: all localStorage reads in one pass on mount,
  // eliminating the default-value -> useEffect -> setState double-render.
  const [pageData] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const storedProducts = loadStoredSaleProducts();
    const invoices = loadStoredPurchaseInvoices();
    const rawIngredients = loadStoredRawIngredients();
    const mainStocks = (loadAllWarehouseStocks()[MAIN_WAREHOUSE_ID]) ?? [];
    const stockById = new Map(mainStocks.map((item) => [item.ingredientId, item]));
    const stockRows = rawIngredients.map((ingredient) => {
      const stock = stockById.get(ingredient.id);
      return {
        ingredientId: ingredient.id,
        quantity: stock?.quantity ?? (Number(String(ingredient.currentQuantity).replace(',', '.')) || 0),
        minimumQuantity: Number(String(ingredient.minimumQuantity).replace(',', '.')) || 0,
        unit: ingredient.unit,
      };
    });
    return {
      saleProductCount: storedProducts?.length ?? DEFAULT_SALE_PRODUCT_BASE.length,
      dailyInvoiceTotal: getDailyPurchaseInvoiceTotal(today, invoices),
      dailyInvoiceCount: getDailyPurchaseInvoiceCount(today, invoices),
      criticalStocks: stockRows.filter((s) => s.minimumQuantity > 0 && s.quantity <= s.minimumQuantity),
      nearLimitStocks: stockRows.filter(
        (s) => s.minimumQuantity > 0 && s.quantity > s.minimumQuantity && s.quantity <= s.minimumQuantity * 1.25,
      ),
    };
  });
  const { saleProductCount, dailyInvoiceTotal, dailyInvoiceCount, criticalStocks, nearLimitStocks } = pageData;

  const ingredientById = useMemo(
    () => Object.fromEntries(erpIngredients.map((ingredient) => [ingredient.id, ingredient])),
    [],
  );

  const cards = [
    {
      label: 'Satis urunu',
      value: String(saleProductCount),
      helper: 'POS ve menu kartlari',
      icon: ShoppingBasket,
      tone: 'from-[#2563EB]/22 to-[#1D4ED8]/12 border-sky-500/20',
    },
    {
      label: 'Hammadde',
      value: String(erpIngredients.length),
      helper: 'Depo ve uretim kalemi',
      icon: Package2,
      tone: 'from-[#0F766E]/22 to-[#134E4A]/12 border-emerald-500/20',
    },
    {
      label: 'Kritik stok',
      value: String(criticalStocks.length),
      helper: nearLimitStocks.length > 0 ? `${nearLimitStocks.length} ürün sınıra yakın` : 'Stoklar kontrol altında',
      icon: AlertTriangle,
      tone: criticalStocks.length > 0
        ? 'from-[#D97706]/22 to-[#92400E]/12 border-amber-500/25'
        : 'from-[#475569]/22 to-[#1E293B]/10 border-slate-600/25',
    },
    {
      label: 'Gunluk alis faturasi',
      value: formatTRY(dailyInvoiceTotal),
      helper: dailyInvoiceCount > 0 ? `${dailyInvoiceCount} fatura islendi` : 'Bugun kayit yok',
      icon: CreditCard,
      tone: 'from-[#7C3AED]/22 to-[#4C1D95]/12 border-violet-500/20',
    },
  ];

  return (
    <AppShell
      title="Genel Gorunum"
      subtitle="Tum sistem icin anlik izleme ve hizli gecis ekrani."
    >
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.label}
                className={`rounded-[1.35rem] border bg-gradient-to-br ${card.tone} p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{card.value}</p>
                    <p className="mt-2 text-sm leading-5 text-slate-400">{card.helper}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-slate-100">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.35rem] border border-white/10 bg-[#0F172A] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">Hizli operasyon gecisi</h2>
                <p className="mt-1 text-sm text-slate-400">En cok kullanilan modullere tek tikla ulas.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-[1.2rem] border border-white/8 bg-slate-950/35 p-4 transition duration-150 hover:-translate-y-0.5 hover:border-sky-400/30 hover:bg-slate-950/55"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-slate-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{item.label}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-white/10 bg-[#0F172A] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <h2 className="text-lg font-semibold tracking-tight text-white">Stok uyarilari</h2>
            <p className="mt-1 text-sm text-slate-400">Oncelik verilmesi gereken hammaddeler.</p>
            <div className="mt-4 space-y-3">
              {criticalStocks.length === 0 && nearLimitStocks.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Kritik stok bulunmuyor. Depo durumu su an dengede.
                </div>
              ) : null}

              {[...criticalStocks, ...nearLimitStocks].slice(0, 6).map((stock, index) => (
                <div
                  key={`${stock.ingredientId}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">{ingredientById[stock.ingredientId]?.name ?? stock.ingredientId}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Mevcut {stock.quantity} {stock.unit} â€¢ Minimum {stock.minimumQuantity} {stock.unit}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      stock.quantity <= stock.minimumQuantity
                        ? 'bg-amber-500/18 text-amber-100'
                        : 'bg-slate-700/60 text-slate-200'
                    }`}
                  >
                    {stock.quantity <= stock.minimumQuantity ? 'Kritik' : 'Takip'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

