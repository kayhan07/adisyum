'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChefHat,
  GitBranch,
  History,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Tags,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { compileCanonicalPosCatalog } from '@/lib/canonical-pos-catalog';
import { erpSnapshot, formatTRY, productRecipes } from '@/lib/erp-engine';
import {
  DEFAULT_SALE_PRODUCT_BASE,
  buildPosCatalogFromStored,
  loadStoredSaleProducts,
  normalizeStoredSaleProduct,
  subscribeToStoredSaleProductsChanges,
  type StoredSaleProduct,
} from '@/lib/sale-product-catalog';
import { loadStoredRawIngredients, type StoredRawIngredient } from '@/lib/raw-ingredient-store';
import {
  PRODUCT_OPERATION_DOMAIN_LABELS,
  buildProductOperationRows,
  buildRecipeUsageGraph,
  simulateProductOperationImpact,
  summarizeProductOperations,
  type ProductOperationDomain,
  type ProductOperationInput,
  type ProductOperationRow,
} from '@/lib/product-operations';

type AuditEntry = {
  id: string;
  at: string;
  action: string;
  actor: string;
  detail: string;
};

type KpiCard = [label: string, value: string | number, Icon: LucideIcon, tone: string];

const DOMAINS: ProductOperationDomain[] = [
  'sale_products',
  'stock_items',
  'semi_products',
  'combo_products',
  'modifier_groups',
  'variants',
];

const DEFAULT_PRINTER_ROUTES: Record<string, string> = {
  Kahve: 'Bar',
  kahve: 'Bar',
  Burger: 'Mutfak',
  Mutfak: 'Mutfak',
  Salata: 'Mutfak',
  Tatlı: 'Pastane',
  Alkol: 'Bar',
};

function buildDefaultSaleProducts() {
  return DEFAULT_SALE_PRODUCT_BASE.map((product) => normalizeStoredSaleProduct({
    ...product,
    salePrice1: product.salePrice,
    salePrice2: product.salePrice,
    salePrice3: product.salePrice,
    salesUnit: 'portion',
    source: 'seeded',
    recipeLines: [],
    salesCount: 0,
  }));
}

function buildIngredientCosts(rawIngredients: StoredRawIngredient[]) {
  const costs: Record<string, number> = {};
  erpSnapshot.invoiceStockResult.stocks.forEach((stock) => {
    costs[stock.ingredientId] = stock.averageCost;
  });
  rawIngredients.forEach((item) => {
    costs[item.id] = Number(String(item.purchasePrice).replace(',', '.')) || costs[item.id] || 0;
  });
  return costs;
}

function buildRecipeFallbacks() {
  return Object.fromEntries(
    productRecipes.map((recipe) => [
      recipe.productName,
      recipe.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        unit: 'kg',
      })),
    ]),
  );
}

function toProductInputs(saleProducts: StoredSaleProduct[], rawIngredients: StoredRawIngredient[]): ProductOperationInput[] {
  const saleInputs = saleProducts.map((product) => ({
    id: product.id,
    posKey: product.posKey,
    sku: product.sku,
    barcode: product.barcode,
    externalId: product.externalId,
    legacyKey: product.legacyKey,
    revision: product.revision,
    lifecycleStatus: product.lifecycleStatus,
    publishStatus: product.publishStatus,
    deletedAt: product.deletedAt,
    name: product.name,
    category: product.category,
    productType: product.productType,
    salePrice: product.salePrice1 || product.salePrice,
    vatRate: product.vatRate,
    recipeLines: product.recipeLines?.map((line) => ({
      ingredientId: line.ingredientId,
      qty: line.quantity,
      unit: line.unit,
    })),
    source: 'catalog',
  }));

  const rawInputs = rawIngredients.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.productType === 'semi_product' ? 'Yarı Mamül' : 'Hammadde',
    productType: item.productType ?? 'stock_item',
    purchasePrice: item.purchasePrice,
    currentQuantity: item.currentQuantity,
    minimumQuantity: item.minimumQuantity,
    vatRate: item.vatRate,
    source: 'inventory',
  }));

  return [...saleInputs, ...rawInputs];
}

function severityClass(row: ProductOperationRow) {
  if (row.severity === 'critical') return 'border-rose-400/35 bg-rose-500/10 text-rose-100';
  if (row.severity === 'warning') return 'border-amber-400/35 bg-amber-500/10 text-amber-100';
  return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
}

export function ProductOperationsCenter() {
  const [saleProducts, setSaleProducts] = useState<StoredSaleProduct[]>([]);
  const [rawIngredients, setRawIngredients] = useState<StoredRawIngredient[]>([]);
  const [activeDomain, setActiveDomain] = useState<ProductOperationDomain>('sale_products');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([
    {
      id: 'audit-initial',
      at: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      action: 'Katalog doğrulandı',
      actor: 'Product Operations',
      detail: 'POS kataloğu yalnızca satış ürünü ve combo ürün tipleriyle sınırlandırıldı.',
    },
  ]);

  useEffect(() => {
    const refresh = () => {
      setSaleProducts(loadStoredSaleProducts() ?? buildDefaultSaleProducts());
      setRawIngredients(loadStoredRawIngredients());
    };
    refresh();
    const unsubscribe = subscribeToStoredSaleProductsChanges(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const rows = useMemo(() => buildProductOperationRows(toProductInputs(saleProducts, rawIngredients), {
    ingredientCosts: buildIngredientCosts(rawIngredients),
    recipeFallbacks: buildRecipeFallbacks(),
    printerRoutes: DEFAULT_PRINTER_ROUTES,
    nowVersion: 3,
  }), [rawIngredients, saleProducts]);

  const summary = useMemo(() => summarizeProductOperations(rows), [rows]);
  const runtimeCatalog = useMemo(() => compileCanonicalPosCatalog(buildPosCatalogFromStored(saleProducts), {
    channel: 'pos',
    deviceSync: [
      { deviceId: 'cashier-main', catalogRevision: 'CAT-LOCAL', lastSeenAt: new Date().toISOString(), status: 'stale', syncLagMs: 2400 },
    ],
  }), [saleProducts]);
  const usageGraph = useMemo(() => buildRecipeUsageGraph(rows), [rows]);
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
    return rows
      .filter((row) => row.domain === activeDomain)
      .filter((row) => !normalizedQuery || `${row.name} ${row.category} ${row.productType} ${row.posKey ?? ''} ${row.sku ?? ''} ${row.barcode ?? ''}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
  }, [activeDomain, query, rows]);

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? visibleRows[0] ?? null;
  const selectedImpact = selectedRow ? simulateProductOperationImpact(selectedRow, rows) : null;
  const incidents = rows.flatMap((row) => row.issues
    .filter((issue) => issue.severity === 'critical')
    .map((issue) => ({ row, issue })));

  function appendAudit(action: string, detail: string) {
    setAuditEntries((current) => [{
      id: `audit-${Date.now()}`,
      at: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      action,
      actor: 'Operasyon kullanıcısı',
      detail,
    }, ...current].slice(0, 8));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function runBulkAction(label: string) {
    appendAudit(label, `${selectedIds.length || visibleRows.length} kayıt için işlem simüle edildi; yayın öncesi etki analizi hazırlandı.`);
  }

  return (
    <AppShell
      title="Ürün Operasyon Merkezi"
      subtitle="Satış ürünü, hammadde, reçete, maliyet, şube görünürlüğü ve POS güvenliğini tek operasyon yüzeyinde yönetin."
      actions={(
        <a href="/products" className="inline-flex h-10 items-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
          Product Studio
        </a>
      )}
    >
      <div className="grid gap-6">
        <section className="grid gap-3 xl:grid-cols-5">
          {([
            ['Ortalama sağlık', `%${summary.averageHealth}`, PackageCheck, 'text-emerald-200'],
            ['Kritik kayıt', summary.critical, ShieldAlert, 'text-rose-200'],
            ['Reçetesiz satış', summary.missingRecipes, ChefHat, 'text-amber-200'],
            ['Düşük marj', summary.lowMargin, BarChart3, 'text-blue-200'],
            ['POS sızıntısı', summary.posLeakage, AlertTriangle, summary.posLeakage ? 'text-rose-200' : 'text-emerald-200'],
            ['Katalog revizyon', runtimeCatalog.catalogRevision, GitBranch, 'text-cyan-200'],
          ] satisfies KpiCard[]).map(([label, value, Icon, tone]) => (
            <article key={String(label)} className="rounded-2xl border border-line bg-panel p-4 shadow-soft">
              <Icon className={`h-5 w-5 ${tone}`} />
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-3xl border border-line bg-panel p-5 shadow-soft">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-ink">Operasyon Kataloğu</h2>
                <p className="mt-1 text-sm text-muted">Domain ayrımı, maliyet, reçete ve runtime güvenliği aynı tabloda izlenir.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[240px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Ürün, kategori veya tip ara"
                    className="h-11 w-full rounded-2xl border border-line bg-canvas pl-10 pr-3 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <button type="button" onClick={() => runBulkAction('Runtime katalog yenileme')} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-line px-4 text-sm font-semibold text-ink">
                  <RefreshCw className="h-4 w-4" />
                  Katalog Yenile
                </button>
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {DOMAINS.map((domain) => {
                const count = rows.filter((row) => row.domain === domain).length;
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => {
                      setActiveDomain(domain);
                      setSelectedIds([]);
                    }}
                    className={`whitespace-nowrap rounded-2xl border px-4 py-2 text-sm font-semibold transition ${activeDomain === domain ? 'border-accent bg-accent text-white' : 'border-line bg-canvas text-muted hover:text-ink'}`}
                  >
                    {PRODUCT_OPERATION_DOMAIN_LABELS[domain]} ({count})
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-line bg-canvas p-3 md:grid-cols-4">
              {[
                ['Toplu fiyat güncelle', 'Seçili ürünlerde oranlı fiyat değişimi'],
                ['Şube görünürlüğü', 'Şube bazlı aktif/pasif yönetimi'],
                ['Yazıcı rotası', 'Mutfak/bar grubu toplu atama'],
                ['QR görünürlüğü', 'QR ve online sipariş yayın kontrolü'],
              ].map(([title, detail]) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => runBulkAction(title)}
                  className="rounded-2xl border border-line bg-panel p-3 text-left transition hover:border-accent"
                >
                  <SlidersHorizontal className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-line">
              <div className="grid min-w-[960px] grid-cols-[44px_1.35fr_0.8fr_0.75fr_0.75fr_0.7fr_0.7fr_0.8fr] bg-canvas px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                <span />
                <span>Ürün</span>
                <span>Domain</span>
                <span>Sağlık</span>
                <span>Maliyet</span>
                <span>Marj</span>
                <span>Şube</span>
                <span>Runtime</span>
              </div>
              <div className="max-h-[560px] min-w-[960px] overflow-y-auto">
                {visibleRows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted">Bu domain için kayıt bulunamadı.</div>
                ) : visibleRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRowId(row.id)}
                    className={`grid w-full grid-cols-[44px_1.35fr_0.8fr_0.75fr_0.75fr_0.7fr_0.7fr_0.8fr] items-center border-t border-line px-4 py-3 text-left text-sm transition hover:bg-canvas/70 ${selectedRow?.id === row.id ? 'bg-accent/8' : 'bg-panel'}`}
                  >
                    <span onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        className="h-4 w-4 rounded border-line"
                        aria-label={`${row.name} seç`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{row.name}</span>
                      <span className="mt-1 block truncate text-xs text-muted">{row.category} · {row.posKey ?? 'POS key bekliyor'} · v{row.version}</span>
                    </span>
                    <span className="text-muted">{row.productType}</span>
                    <span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClass(row)}`}>
                        %{row.healthScore}
                      </span>
                    </span>
                    <span className="font-semibold text-ink">{row.cost > 0 ? formatTRY(row.cost) : '-'}</span>
                    <span className={row.marginPercent !== null && row.marginPercent < 35 ? 'font-semibold text-amber-200' : 'font-semibold text-emerald-200'}>
                      {row.marginPercent === null ? '-' : `%${Math.round(row.marginPercent)}`}
                    </span>
                    <span className="text-muted">{row.branchVisibility.filter((branch) => branch.enabled).length} şube</span>
                    <span className={row.posVisible ? 'text-emerald-200' : 'text-slate-400'}>
                      {row.posVisible ? 'POS açık' : 'Stok alanı'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Etki Simülasyonu</p>
                  <h3 className="mt-2 text-lg font-semibold text-ink">{selectedRow?.name ?? 'Ürün seçin'}</h3>
                </div>
                <UploadCloud className="h-5 w-5 text-accent" />
              </div>
              {selectedRow && selectedImpact ? (
                <div className="mt-4 grid gap-3 text-sm">
                  <p className="rounded-2xl bg-canvas p-3 text-muted">Yayın etkisi: {selectedImpact.runtimePropagation}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-canvas p-3">
                      <p className="text-xs text-muted">Etkilenen reçete</p>
                      <p className="mt-1 text-xl font-semibold text-ink">{selectedImpact.affectedRecipes}</p>
                    </div>
                    <div className="rounded-2xl bg-canvas p-3">
                      <p className="text-xs text-muted">Etkilenen şube</p>
                      <p className="mt-1 text-xl font-semibold text-ink">{selectedImpact.affectedBranches}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedImpact.cacheTargets.map((target) => (
                      <span key={target} className="rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold text-muted">{target}</span>
                    ))}
                  </div>
                  <button type="button" onClick={() => appendAudit('Yayın simülasyonu', `${selectedRow.name} için runtime-safe ürün yayını simüle edildi.`)} className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent text-sm font-semibold text-white">
                    Yayın Öncesi Kontrol
                  </button>
                </div>
              ) : null}
            </article>

            <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><ChefHat className="h-5 w-5 text-accent" /> Reçete Grafiği</h3>
              <div className="mt-4 grid gap-3">
                {selectedRow?.costLines.length ? selectedRow.costLines.map((line) => {
                  const dependents = usageGraph.get(line.ingredientId) ?? [];
                  return (
                    <div key={line.ingredientId} className="rounded-2xl border border-line bg-canvas p-3">
                      <p className="font-semibold text-ink">{line.ingredientId}</p>
                      <p className="mt-1 text-xs text-muted">{line.quantity.toLocaleString('tr-TR')} {line.unit ?? 'birim'} · {formatTRY(line.lineCost)} · {dependents.length} üründe kullanılıyor</p>
                    </div>
                  );
                }) : <p className="text-sm text-muted">Seçili kayıt için reçete bağı bulunmuyor.</p>}
              </div>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><ShieldAlert className="h-5 w-5 text-rose-300" /> Ürün Olayları</h3>
              <div className="mt-4 grid gap-3">
                {incidents.length === 0 ? (
                  <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">Kritik ürün olayı yok.</p>
                ) : incidents.slice(0, 4).map(({ row, issue }) => (
                  <div key={`${row.id}-${issue.code}`} className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3">
                    <p className="font-semibold text-rose-100">{issue.title}</p>
                    <p className="mt-1 text-sm text-rose-100/70">{row.name}: {issue.detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><BrainCircuit className="h-5 w-5 text-blue-300" /> AI Operasyon İçgörüleri</h3>
              <div className="mt-4 grid gap-3 text-sm">
                <p className="rounded-2xl bg-canvas p-3 text-muted">Düşük marjlı {summary.lowMargin} ürün için fiyat/reçete revizyonu önerilir.</p>
                <p className="rounded-2xl bg-canvas p-3 text-muted">{summary.missingRecipes} satış ürününde stok düşümü ve maliyet doğruluğu eksik.</p>
                <p className="rounded-2xl bg-canvas p-3 text-muted">POS sızıntı alarmı {summary.posLeakage === 0 ? 'temiz' : 'kritik'} durumda.</p>
              </div>
            </article>
          </aside>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><GitBranch className="h-5 w-5 text-accent" /> Şube Kontrolü</h3>
            <div className="mt-4 grid gap-3">
              {(selectedRow?.branchVisibility ?? []).map((branch) => (
                <div key={branch.branchId} className="flex items-center justify-between rounded-2xl border border-line bg-canvas p-3">
                  <div>
                    <p className="font-semibold text-ink">{branch.label}</p>
                    <p className="text-xs text-muted">{branch.priceOverride ? `Yerel fiyat ${formatTRY(branch.priceOverride)}` : 'Genel fiyat kullanılır'}</p>
                  </div>
                  <span className={branch.enabled ? 'text-emerald-200' : 'text-slate-500'}>{branch.enabled ? 'Açık' : 'Kapalı'}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><History className="h-5 w-5 text-accent" /> Audit Zaman Çizgisi</h3>
            <div className="mt-4 grid gap-3">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-line bg-canvas p-3">
                  <p className="text-xs text-muted">{entry.at} · {entry.actor}</p>
                  <p className="mt-1 font-semibold text-ink">{entry.action}</p>
                  <p className="mt-1 text-sm text-muted">{entry.detail}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink"><Sparkles className="h-5 w-5 text-accent" /> Runtime Güvenli Yayın</h3>
            <div className="mt-4 grid gap-3">
              {[
                ['POS cache invalidation', 'Katalog anahtarı ve offline paket versiyonu artırılır.'],
                ['Websocket bildirim', 'Tenant cihazları ürün kataloğunu yeniden çeker.'],
                ['Offline güvenlik', 'Geçersiz domain ürünleri offline pakete yazılmaz.'],
                ['Versiyon geri alma', 'Önceki reçete/fiyat revizyonuna dönülebilir.'],
                ['Lifecycle güvenliği', `${selectedRow?.lifecycleStatus ?? 'active'} / ${selectedRow?.publishStatus ?? 'published'} durumuna göre arşiv-silme kararı verilir.`],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-line bg-canvas p-3">
                  <p className="flex items-center gap-2 font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> {title}</p>
                  <p className="mt-1 text-sm text-muted">{detail}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
