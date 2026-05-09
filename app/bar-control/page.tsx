'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckSquare,
  Layers3,
  Package,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  analyzeAlcoholVariance,
  buildInitialAlcoholState,
  clToMl,
  getActualRemainingMl,
  getPortionsPerBottle,
  mlToCl,
  type OpenBottleEntry,
} from '@/lib/alcohol-tracking';
import {
  loadStoredSaleProducts,
  saveStoredSaleProducts,
  subscribeToStoredSaleProductsChanges,
  type StoredSaleProduct,
} from '@/lib/sale-product-catalog';
import {
  getStoredOrdersByTable,
  subscribeToStoredOrdersChanges,
} from '@/lib/table-payment-state';

type RuntimeOrderLine = {
  name: string;
  qty: number;
  sentQty?: number;
  isReturn?: boolean;
  complimentary?: boolean;
  complimentaryReason?: string;
  price?: number;
};

type AlertLevel = 'ok' | 'warning' | 'critical';

type DashboardAlert = {
  id: string;
  productId: string;
  level: AlertLevel;
  title: string;
  detail: string;
};

type DashboardAlcoholProduct = StoredSaleProduct & {
  openBottleSnapshots: OpenBottleEntry[];
};

type AlcoholDashboardItem = {
  product: DashboardAlcoholProduct;
  bottleVolumeCl: number;
  portionVolumeCl: number;
  bottleMl: number;
  sealedBottleCount: number;
  openBottleCount: number;
  portionsPerBottle: number;
  actualRemainingMl: number;
  remainingPortions: number;
  salesGlasses: number;
  totalConsumptionCl: number;
  totalConsumptionMl: number;
  variance: ReturnType<typeof analyzeAlcoholVariance>;
  alerts: DashboardAlert[];
  stockLevel: number;
};

type OpenBottleRow = {
  bottle: OpenBottleEntry;
  productId: string;
  productName: string;
  category: string;
  remainingCl: number;
  openedAt: string;
};

const ALCOHOL_KEYWORDS = ['alkol', 'bira', 'şarap', 'sarap', 'viski', 'vodka', 'cin', 'gin', 'rakı', 'raki', 'tekila', 'tequila', 'likör', 'likor'];

function parseAmount(value: string | number | undefined) {
  const parsed = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRuntimeOrderEffectiveQty(line: RuntimeOrderLine) {
  const baseQty = Math.max(0, Number(line.sentQty ?? 0)) > 0
    ? Math.max(0, Number(line.sentQty ?? 0))
    : Math.max(0, Number(line.qty ?? 0));
  return line.isReturn ? -baseQty : baseQty;
}

function buildSalesCountMapFromOrders(ordersByTable: Record<string, RuntimeOrderLine[]>) {
  const counts = new Map<string, number>();

  Object.values(ordersByTable).forEach((lines) => {
    lines.forEach((line) => {
      const name = String(line.name ?? '').trim();
      if (!name) return;
      const qty = getRuntimeOrderEffectiveQty(line);
      counts.set(name, Math.max(0, (counts.get(name) ?? 0) + qty));
    });
  });

  return counts;
}

function isAlcoholProduct(product: StoredSaleProduct) {
  if (product.stockProcurementType !== 'direct' || product.barStockMode !== 'bottle-glass') return false;
  const value = `${product.name} ${product.category}`.toLocaleLowerCase('tr-TR');
  return ALCOHOL_KEYWORDS.some((keyword) => value.includes(keyword));
}

function formatCl(value: number) {
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cl`;
}

function formatPortions(value: number) {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getStatusTone(level: AlertLevel) {
  if (level === 'critical') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  }

  if (level === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function getStockLevel(actualRemainingMl: number, bottleMl: number) {
  if (bottleMl <= 0) return 0;
  return actualRemainingMl / bottleMl;
}

function buildAlcoholAlerts(item: Omit<AlcoholDashboardItem, 'alerts'>): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const varianceCl = mlToCl(item.variance.varianceMl);

  if (item.variance.varianceMl < 0 && item.variance.status !== 'ok') {
    alerts.push({
      id: `${item.product.id}-over`,
      productId: item.product.id,
      level: item.variance.status === 'critical' ? 'critical' : 'warning',
      title: 'Aşırı tüketim',
      detail: `Beklenenden ${formatCl(Math.abs(varianceCl))} daha az stok görünüyor.`,
    });
  }

  if (item.stockLevel <= 1.5) {
    alerts.push({
      id: `${item.product.id}-low`,
      productId: item.product.id,
      level: item.stockLevel <= 0.75 ? 'critical' : 'warning',
      title: 'Düşük stok',
      detail: `Yaklaşık ${item.stockLevel.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} şişe kaldı.`,
    });
  }

  if (item.openBottleCount >= 3 || (item.salesGlasses === 0 && item.openBottleCount > 0)) {
    alerts.push({
      id: `${item.product.id}-abnormal`,
      productId: item.product.id,
      level: 'warning',
      title: 'Anormal kullanım',
      detail: item.salesGlasses === 0
        ? 'Satış yok ama açık şişe bulunuyor.'
        : `${item.openBottleCount} açık şişe takip ediliyor.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: `${item.product.id}-ok`,
      productId: item.product.id,
      level: 'ok',
      title: 'Kontrol altında',
      detail: 'Satış ve stok akışı normal.',
    });
  }

  return alerts;
}

export default function BarControlPage() {
  const [products, setProducts] = useState<StoredSaleProduct[]>([]);
  const [ordersByTable, setOrdersByTable] = useState<Record<string, RuntimeOrderLine[]>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedBottleId, setSelectedBottleId] = useState<string>('');
  const [manualSealedCount, setManualSealedCount] = useState('0');
  const [manualBottleRemainingCl, setManualBottleRemainingCl] = useState('0');
  const [stockCheckInput, setStockCheckInput] = useState('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const syncProducts = () => {
      setProducts(loadStoredSaleProducts() ?? []);
    };

    syncProducts();
    return subscribeToStoredSaleProductsChanges(syncProducts);
  }, []);

  useEffect(() => {
    const syncOrders = () => {
      setOrdersByTable(getStoredOrdersByTable<RuntimeOrderLine>());
    };

    syncOrders();
    return subscribeToStoredOrdersChanges(syncOrders);
  }, []);

  const liveSalesMap = useMemo(() => buildSalesCountMapFromOrders(ordersByTable), [ordersByTable]);

  const alcoholItems = useMemo(() => {
    return products
      .filter(isAlcoholProduct)
      .map((product) => {
        const normalizedProduct: DashboardAlcoholProduct = {
          ...product,
          openBottleSnapshots: (product.openBottleSnapshots ?? []).map((item) => ({ ...item })),
        };
        const bottleVolumeCl = Math.max(0, parseAmount(normalizedProduct.bottleVolumeCl || '70'));
        const portionVolumeCl = Math.max(0, parseAmount(normalizedProduct.portionVolumeCl || '5'));
        const bottleMl = clToMl(bottleVolumeCl);
        const sealedBottleCount = Math.max(0, Math.floor(parseAmount(normalizedProduct.currentStock || '0')));
        const dispensedPortions = Math.max(0, parseAmount(normalizedProduct.dispensedPortions || '0'));
        const salesGlasses = Math.max(0, liveSalesMap.get(normalizedProduct.name) ?? normalizedProduct.salesCount ?? dispensedPortions);
        const state = buildInitialAlcoholState({
          bottleVolumeCl,
          portionVolumeCl,
          sealedBottleCount,
          openBottles: normalizedProduct.openBottleSnapshots,
          dispensedPortions,
        });
        const actualRemainingMl = getActualRemainingMl(state);
        const variance = analyzeAlcoholVariance({
          bottleVolumeCl,
          portionVolumeCl,
          expectedPortionsSold: salesGlasses,
          actualRemainingMl,
          initialBottleCount: Math.max(0, parseAmount(normalizedProduct.initialBottleCount || normalizedProduct.currentStock || '0')),
        });
        const itemBase = {
          product: normalizedProduct,
          bottleVolumeCl,
          portionVolumeCl,
          bottleMl,
          sealedBottleCount,
          openBottleCount: normalizedProduct.openBottleSnapshots.length,
          portionsPerBottle: getPortionsPerBottle(bottleVolumeCl, portionVolumeCl),
          actualRemainingMl,
          remainingPortions: portionVolumeCl > 0 ? actualRemainingMl / clToMl(portionVolumeCl) : 0,
          salesGlasses,
          totalConsumptionCl: salesGlasses * portionVolumeCl,
          totalConsumptionMl: salesGlasses * clToMl(portionVolumeCl),
          variance,
          stockLevel: getStockLevel(actualRemainingMl, bottleMl),
        };

        return {
          ...itemBase,
          alerts: buildAlcoholAlerts(itemBase),
        };
      })
      .sort((a, b) => {
        const severity = { critical: 0, warning: 1, ok: 2 } as const;
        return severity[a.alerts[0].level] - severity[b.alerts[0].level] || a.product.name.localeCompare(b.product.name, 'tr');
      });
  }, [liveSalesMap, products]);

  const filteredAlcoholItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!query) return alcoholItems;
    return alcoholItems.filter((item) => `${item.product.name} ${item.product.category}`.toLocaleLowerCase('tr-TR').includes(query));
  }, [alcoholItems, searchQuery]);

  const selectedItem = useMemo(
    () => alcoholItems.find((item) => item.product.id === selectedProductId) ?? alcoholItems[0] ?? null,
    [alcoholItems, selectedProductId],
  );

  const allOpenBottles = useMemo<OpenBottleRow[]>(() => {
    return alcoholItems
      .flatMap((item) => (item.product.openBottleSnapshots ?? []).map((bottle) => ({
        bottle,
        productId: item.product.id,
        productName: item.product.name,
        category: item.product.category,
        remainingCl: mlToCl(bottle.remainingMl),
        openedAt: bottle.openedAt,
      })))
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }, [alcoholItems]);

  const alertStream = useMemo(
    () => alcoholItems.flatMap((item) => item.alerts.filter((alert) => alert.level !== 'ok')),
    [alcoholItems],
  );

  const totals = useMemo(() => {
    const totalSales = alcoholItems.reduce((sum, item) => sum + item.salesGlasses, 0);
    const totalConsumptionCl = alcoholItems.reduce((sum, item) => sum + item.totalConsumptionCl, 0);
    const totalVarianceCl = alcoholItems.reduce((sum, item) => sum + mlToCl(item.variance.varianceMl), 0);

    return {
      totalSales,
      totalConsumptionCl,
      totalVarianceCl,
    };
  }, [alcoholItems]);

  useEffect(() => {
    if (!selectedProductId && alcoholItems[0]) {
      setSelectedProductId(alcoholItems[0].product.id);
      return;
    }

    if (selectedProductId && !alcoholItems.some((item) => item.product.id === selectedProductId)) {
      setSelectedProductId(alcoholItems[0]?.product.id ?? '');
    }
  }, [alcoholItems, selectedProductId]);

  useEffect(() => {
    if (!selectedItem) {
      setSelectedBottleId('');
      setManualSealedCount('0');
      setManualBottleRemainingCl('0');
      setStockCheckInput('0');
      return;
    }

    setManualSealedCount(String(selectedItem.sealedBottleCount));
    setStockCheckInput(selectedItem.bottleMl > 0 ? String(selectedItem.actualRemainingMl / selectedItem.bottleMl) : '0');

    const openBottleSnapshots = selectedItem.product.openBottleSnapshots ?? [];
    const nextBottleId = openBottleSnapshots[0]?.id ?? '';
    setSelectedBottleId((current) => {
      if (current && openBottleSnapshots.some((item) => item.id === current)) return current;
      return nextBottleId;
    });
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      setManualBottleRemainingCl('0');
      return;
    }

    const openBottleSnapshots = selectedItem.product.openBottleSnapshots ?? [];
    const selectedBottle = openBottleSnapshots.find((item) => item.id === selectedBottleId);
    setManualBottleRemainingCl(selectedBottle ? String(mlToCl(selectedBottle.remainingMl)) : '0');
  }, [selectedBottleId, selectedItem]);

  function persistProducts(nextProducts: StoredSaleProduct[]) {
    setProducts(nextProducts);
    saveStoredSaleProducts(nextProducts);
  }

  function updateSelectedProduct(mutator: (product: StoredSaleProduct) => StoredSaleProduct | null) {
    if (!selectedItem) return;

    const nextProducts = products.map((product) => {
      if (product.id !== selectedItem.product.id) return product;
      return mutator(product) ?? product;
    });

    persistProducts(nextProducts);
  }

  function handleOpenBottle() {
    if (!selectedItem) return;
    if (selectedItem.sealedBottleCount <= 0 || selectedItem.bottleMl <= 0) {
      setFeedback({ type: 'error', text: 'Açılacak kapalı şişe bulunmuyor.' });
      return;
    }

    updateSelectedProduct((product) => ({
      ...product,
      currentStock: String(Math.max(0, Math.floor(parseAmount(product.currentStock || '0')) - 1)),
      openBottleSnapshots: [
        ...(product.openBottleSnapshots ?? []),
        {
          id: `manual-open-${Date.now()}`,
          openedAt: new Date().toISOString(),
          remainingMl: selectedItem.bottleMl,
        },
      ],
      lastCountedAt: new Date().toISOString(),
    }));

    setFeedback({ type: 'success', text: `${selectedItem.product.name} için yeni şişe açıldı.` });
  }

  function handleManualAdjustment() {
    if (!selectedItem) return;

    const sealedCount = Math.max(0, Math.floor(parseAmount(manualSealedCount)));
    const nextRemainingMl = Math.min(selectedItem.bottleMl, Math.max(0, clToMl(parseAmount(manualBottleRemainingCl))));

    updateSelectedProduct((product) => {
      let nextOpenBottles = [...(product.openBottleSnapshots ?? [])];
      const bottleIndex = nextOpenBottles.findIndex((item) => item.id === selectedBottleId);

      if (bottleIndex >= 0) {
        if (nextRemainingMl <= 0) {
          nextOpenBottles.splice(bottleIndex, 1);
        } else {
          nextOpenBottles[bottleIndex] = { ...nextOpenBottles[bottleIndex], remainingMl: nextRemainingMl };
        }
      } else if (nextRemainingMl > 0) {
        nextOpenBottles = [
          ...nextOpenBottles,
          {
            id: `manual-bottle-${Date.now()}`,
            openedAt: new Date().toISOString(),
            remainingMl: nextRemainingMl,
          },
        ];
      }

      return {
        ...product,
        currentStock: String(sealedCount),
        openBottleSnapshots: nextOpenBottles.filter((item) => item.remainingMl > 0),
        lastCountedAt: new Date().toISOString(),
      };
    });

    setFeedback({ type: 'success', text: 'Manuel düzeltme kaydedildi.' });
  }

  function handleStockCheck() {
    if (!selectedItem) return;

    const countedQuantity = Math.max(0, parseAmount(stockCheckInput));
    const sealedBottleCount = Math.max(0, Math.floor(countedQuantity));
    const fractionalBottle = Math.max(0, countedQuantity - sealedBottleCount);
    const openMl = selectedItem.bottleMl > 0 ? fractionalBottle * selectedItem.bottleMl : 0;

    updateSelectedProduct((product) => ({
      ...product,
      currentStock: String(sealedBottleCount),
      openBottleSnapshots: openMl > 0
        ? [{ id: `counted-open-${Date.now()}`, openedAt: new Date().toISOString(), remainingMl: openMl }]
        : [],
      lastCountedAt: new Date().toISOString(),
    }));

    setFeedback({ type: 'success', text: 'Stok sayımı işlendi ve açık şişe durumu güncellendi.' });
  }

  return (
    <AppShell
      title="Bar Control Dashboard"
      subtitle="Açık şişe, porsiyon satışı ve varyans kontrolünü tek ekranda yönetin."
      actions={
        <Link
          href="/products"
          className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:border-sky-400/30 hover:bg-sky-500/10"
        >
          Ürün kartlarına git
        </Link>
      }
    >
      <div className="space-y-5 text-slate-100">
        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-[1.4rem] border border-sky-500/20 bg-gradient-to-br from-sky-500/18 to-slate-950 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-sky-200/70">Toplam satış</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{totals.totalSales.toLocaleString('tr-TR')}</p>
                <p className="mt-2 text-sm text-slate-300">Kadeh bazlı canlı satış</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-sky-100">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </article>
          <article className="rounded-[1.4rem] border border-violet-500/20 bg-gradient-to-br from-violet-500/18 to-slate-950 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-violet-200/70">Toplam tüketim</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{totals.totalConsumptionCl.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</p>
                <p className="mt-2 text-sm text-slate-300">cl bazlı fiili tüketim</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-violet-100">
                <Layers3 className="h-5 w-5" />
              </div>
            </div>
          </article>
          <article className={`rounded-[1.4rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${totals.totalVarianceCl < -0.1 ? 'border-rose-500/25 bg-gradient-to-br from-rose-500/18 to-slate-950' : totals.totalVarianceCl > 0.1 ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/16 to-slate-950' : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/16 to-slate-950'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Varyans</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  {totals.totalVarianceCl > 0 ? '+' : ''}
                  {totals.totalVarianceCl.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                </p>
                <p className="mt-2 text-sm text-slate-300">Beklenen ve gerçek stok farkı</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-slate-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </article>
        </section>

        {alcoholItems.length === 0 ? (
          <section className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-6">
            <h2 className="text-xl font-semibold text-white">Takip edilecek alkol ürünü bulunamadı</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Dashboard yalnızca direkt stok ve şişe-kadeh modunda çalışan alkol ürünlerini gösterir.
              Ürün kartlarında alkol ürünlerini bu modda tanımladıktan sonra ekran otomatik dolar.
            </p>
            <Link
              href="/products"
              className="mt-4 inline-flex h-11 items-center rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
            >
              Ürün kartını aç
            </Link>
          </section>
        ) : (
          <>
            <section className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-white">Alkol kartları</h2>
                    <p className="mt-1 text-sm text-slate-400">Her ürün için açık şişe, kalan porsiyon ve alarm durumu.</p>
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Ürün ara"
                    className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40"
                  />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {filteredAlcoholItems.map((item) => {
                    const dominantAlert = item.alerts[0];
                    const isSelected = selectedItem?.product.id === item.product.id;

                    return (
                      <button
                        key={item.product.id}
                        type="button"
                        onClick={() => setSelectedProductId(item.product.id)}
                        className={`rounded-[1.25rem] border p-4 text-left transition ${isSelected ? 'border-sky-400/40 bg-sky-500/10 shadow-[0_18px_40px_rgba(14,165,233,0.12)]' : 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-slate-950/60'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.product.category}</p>
                            <h3 className="mt-2 text-lg font-semibold text-white">{item.product.name}</h3>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getStatusTone(dominantAlert.level)}`}>
                            {dominantAlert.title}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Açık şişe</p>
                            <p className="mt-2 text-xl font-semibold text-white">{item.openBottleCount}</p>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kalan porsiyon</p>
                            <p className="mt-2 text-xl font-semibold text-white">{formatPortions(item.remainingPortions)}</p>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Satış</p>
                            <p className="mt-2 text-sm font-semibold text-white">{item.salesGlasses.toLocaleString('tr-TR')} kadeh</p>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Tüketim</p>
                            <p className="mt-2 text-sm font-semibold text-white">{formatCl(item.totalConsumptionCl)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="space-y-4">
                <section className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Seçili alkol</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">{selectedItem?.product.name ?? '—'}</h2>
                      <p className="mt-1 text-sm text-slate-400">{selectedItem?.product.category ?? 'Tanım yok'}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100">
                      <Package className="h-5 w-5" />
                    </div>
                  </div>

                  {selectedItem ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kapalı şişe</p>
                          <p className="mt-2 text-lg font-semibold text-white">{selectedItem.sealedBottleCount}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Kalan stok</p>
                          <p className="mt-2 text-lg font-semibold text-white">{formatCl(mlToCl(selectedItem.actualRemainingMl))}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">1 şişe</p>
                          <p className="mt-2 text-lg font-semibold text-white">{selectedItem.portionsPerBottle.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kadeh</p>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 ${selectedItem.variance.status === 'critical' ? 'border-rose-400/30 bg-rose-500/10' : selectedItem.variance.status === 'warning' ? 'border-amber-400/30 bg-amber-500/10' : 'border-emerald-400/30 bg-emerald-500/10'}`}>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Varyans</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            {mlToCl(selectedItem.variance.varianceMl) > 0 ? '+' : ''}
                            {mlToCl(selectedItem.variance.varianceMl).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} cl
                          </p>
                        </div>
                      </div>

                      {feedback ? (
                        <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}`}>
                          {feedback.text}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Hızlı aksiyonlar</h2>
                      <p className="mt-1 text-sm text-slate-400">Anında müdahale için tek panel.</p>
                    </div>
                    <Sparkles className="h-5 w-5 text-sky-300" />
                  </div>

                  {selectedItem ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">Yeni şişe aç</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">Kapalı stoktan düşer ve açık şişe listesine eklenir.</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenBottle}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15"
                          >
                            <Plus className="h-4 w-4" />
                            Aç
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/40 p-4">
                        <p className="text-sm font-semibold text-white">Manuel düzeltme</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">Kapalı stok ve seçili açık şişe miktarını düzelt.</p>
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Kapalı şişe</span>
                            <input
                              value={manualSealedCount}
                              onChange={(event) => setManualSealedCount(event.target.value)}
                              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Açık şişe seç</span>
                            <select
                              value={selectedBottleId}
                              onChange={(event) => setSelectedBottleId(event.target.value)}
                              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm text-white outline-none focus:border-sky-400/40"
                            >
                              <option value="">Yeni açık şişe ekle</option>
                              {(selectedItem.product.openBottleSnapshots ?? []).map((bottle, index) => (
                                <option key={bottle.id} value={bottle.id}>
                                  {`Açık Şişe ${index + 1} • ${formatCl(mlToCl(bottle.remainingMl))}`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Kalan miktar (cl)</span>
                            <input
                              value={manualBottleRemainingCl}
                              onChange={(event) => setManualBottleRemainingCl(event.target.value)}
                              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleManualAdjustment}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                          >
                            <Save className="h-4 w-4" />
                            Manuel düzeltmeyi kaydet
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/40 p-4">
                        <p className="text-sm font-semibold text-white">Stok sayımı</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">Toplam fiziksel stok miktarını şişe karşılığı olarak gir.</p>
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Toplam şişe karşılığı</span>
                            <input
                              value={stockCheckInput}
                              onChange={(event) => setStockCheckInput(event.target.value)}
                              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/40"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleStockCheck}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            <CheckSquare className="h-4 w-4" />
                            Sayımı işle
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Uyarılar</h2>
                      <p className="mt-1 text-sm text-slate-400">Sorunlar renk koduyla öne çıkar.</p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {alertStream.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        Kritik alarm yok. Sistem dengede.
                      </div>
                    ) : (
                      alertStream.slice(0, 6).map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => setSelectedProductId(alert.productId)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left ${getStatusTone(alert.level)}`}
                        >
                          <p className="text-sm font-semibold">{alert.title}</p>
                          <p className="mt-1 text-xs leading-5 opacity-90">{alert.detail}</p>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-[#081120] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Açık şişeler</h2>
                  <p className="mt-1 text-sm text-slate-400">Tüm açık şişeler kalan miktar ile birlikte tek listede.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                  {allOpenBottles.length} kayıt
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {allOpenBottles.length === 0 ? (
                  <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-4 text-sm text-slate-400">
                    Açık şişe bulunmuyor.
                  </div>
                ) : (
                  allOpenBottles.map((item, index) => (
                    <button
                      key={item.bottle.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(item.productId);
                        setSelectedBottleId(item.bottle.id);
                      }}
                      className={`rounded-[1.2rem] border p-4 text-left transition ${selectedBottleId === item.bottle.id ? 'border-sky-400/40 bg-sky-500/10' : 'border-white/8 bg-slate-950/40 hover:border-white/15 hover:bg-slate-950/60'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Açık şişe #{index + 1}</p>
                          <h3 className="mt-2 text-base font-semibold text-white">{item.productName}</h3>
                          <p className="mt-1 text-sm text-slate-400">{item.category}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                          {formatCl(item.remainingCl)}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>Açılış: {formatDateTime(item.openedAt)}</span>
                        <span>Kalan: {formatCl(item.remainingCl)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
