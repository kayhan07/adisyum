'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  History,
  Package,
  Plus,
  Search,
  Trash2,
  Warehouse as WarehouseIcon,
  X,
  XCircle,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { branchStocks, erpIngredients } from '@/lib/erp-engine';
import {
  MAIN_WAREHOUSE_ID,
  MAIN_WAREHOUSE,
  executeTransfer,
  getWarehouseStock,
  loadAllWarehouseStocks,
  loadTransferRecords,
  loadWarehouses,
  saveAllWarehouseStocks,
  saveTransferRecords,
  saveWarehouses,
  type RawUnit,
  type TransferRecord,
  type Warehouse as WarehouseModel,
  type WarehouseStockLine,
} from '@/lib/warehouse-store';

// ─── Seed Ana Depo from ERP branch stocks ─────────────────────────────────

function buildMainWarehouseSeededStock(): WarehouseStockLine[] {
  return branchStocks
    .filter((s) => s.branchId === 'mrk')
    .map((s) => {
      const ingredient = erpIngredients.find((i) => i.id === s.ingredientId);
      if (!ingredient) return null;
      // Normalize erp units to warehouse RawUnit
      let unit: RawUnit = 'adet';
      if (ingredient.unit === 'kg' || ingredient.unit === 'gr') unit = 'kg';
      else if (ingredient.unit === 'lt' || ingredient.unit === 'ml') unit = 'lt';
      else unit = 'adet';
      const quantity = ingredient.unit === 'gr' ? s.quantity / 1000 : ingredient.unit === 'ml' ? s.quantity / 1000 : s.quantity;
      return { ingredientId: s.ingredientId, ingredientName: ingredient.name, unit, quantity };
    })
    .filter((l): l is WarehouseStockLine => l !== null);
}

const SEEDED_MAIN_STOCK = buildMainWarehouseSeededStock();

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatQty(qty: number, unit: RawUnit) {
  return `${qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} ${unit}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Main Page ──────────────────────────────────────────────────────────────

type ActiveTab = 'stock' | 'history';

export default function WarehousePage() {
  // ── State ──────────────────────────────────────────────────────────────
  const [hydrated, setHydrated] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseModel[]>([MAIN_WAREHOUSE]);
  const [allStocks, setAllStocks] = useState<Record<string, WarehouseStockLine[]>>({});
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(MAIN_WAREHOUSE_ID);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock');
  const [stockSearch, setStockSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // New department form
  const [showNewDeptForm, setShowNewDeptForm] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const newDeptInputRef = useRef<HTMLInputElement>(null);

  // Transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [tfFrom, setTfFrom] = useState(MAIN_WAREHOUSE_ID);
  const [tfTo, setTfTo] = useState('');
  const [tfIngredientId, setTfIngredientId] = useState('');
  const [tfQty, setTfQty] = useState('');
  const [tfNote, setTfNote] = useState('');
  const [tfError, setTfError] = useState('');
  const [tfSuccess, setTfSuccess] = useState('');

  // Stock edit (add/update ingredient in Ana Depo)
  const [showStockEditModal, setShowStockEditModal] = useState(false);
  const [editIngredientId, setEditIngredientId] = useState('');
  const [editIngredientName, setEditIngredientName] = useState('');
  const [editUnit, setEditUnit] = useState<RawUnit>('kg');
  const [editQty, setEditQty] = useState('');
  const [editMode, setEditMode] = useState<'add' | 'set'>('set');

  // ── Hydration ──────────────────────────────────────────────────────────
  useEffect(() => {
    const storedWarehouses = loadWarehouses();
    const storedStocks = loadAllWarehouseStocks();
    const storedTransfers = loadTransferRecords();

    // Seed Ana Depo if empty
    const mainStock = storedStocks[MAIN_WAREHOUSE_ID];
    if (!mainStock || mainStock.length === 0) {
      storedStocks[MAIN_WAREHOUSE_ID] = SEEDED_MAIN_STOCK;
    }

    setWarehouses(storedWarehouses);
    setAllStocks(storedStocks);
    setTransfers(storedTransfers);
    setHydrated(true);
  }, []);

  // Persist warehouses
  useEffect(() => {
    if (!hydrated) return;
    saveWarehouses(warehouses);
  }, [warehouses, hydrated]);

  // Persist stocks
  useEffect(() => {
    if (!hydrated) return;
    saveAllWarehouseStocks(allStocks);
  }, [allStocks, hydrated]);

  // Persist transfers
  useEffect(() => {
    if (!hydrated) return;
    saveTransferRecords(transfers);
  }, [transfers, hydrated]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === selectedWarehouseId) ?? null,
    [warehouses, selectedWarehouseId],
  );

  const selectedStock = useMemo(
    () => getWarehouseStock(allStocks, selectedWarehouseId),
    [allStocks, selectedWarehouseId],
  );

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return selectedStock;
    return selectedStock.filter((l) => l.ingredientName.toLocaleLowerCase('tr-TR').includes(q));
  }, [selectedStock, stockSearch]);

  const selectedHistory = useMemo(
    () => transfers.filter((t) => t.fromWarehouseId === selectedWarehouseId || t.toWarehouseId === selectedWarehouseId),
    [transfers, selectedWarehouseId],
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return selectedHistory;
    return selectedHistory.filter(
      (t) =>
        t.ingredientName.toLocaleLowerCase('tr-TR').includes(q) ||
        t.fromWarehouseName.toLocaleLowerCase('tr-TR').includes(q) ||
        t.toWarehouseName.toLocaleLowerCase('tr-TR').includes(q) ||
        (t.note ?? '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [selectedHistory, historySearch]);

  // Source ingredients for transfer form
  const tfSourceStock = useMemo(() => getWarehouseStock(allStocks, tfFrom), [allStocks, tfFrom]);

  const tfSelectedLine = useMemo(
    () => tfSourceStock.find((l) => l.ingredientId === tfIngredientId) ?? null,
    [tfSourceStock, tfIngredientId],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAddDepartment() {
    const name = newDeptName.trim();
    if (!name) return;
    const id = `dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newWarehouse: WarehouseModel = {
      id,
      name,
      type: 'department',
      description: newDeptDesc.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    setWarehouses((prev) => [...prev, newWarehouse]);
    setNewDeptName('');
    setNewDeptDesc('');
    setShowNewDeptForm(false);
    setSelectedWarehouseId(id);
  }

  function handleDeleteWarehouse(id: string) {
    if (id === MAIN_WAREHOUSE_ID) return;
    setWarehouses((prev) => prev.filter((w) => w.id !== id));
    setAllStocks((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    if (selectedWarehouseId === id) setSelectedWarehouseId(MAIN_WAREHOUSE_ID);
  }

  function openTransferForm() {
    setTfFrom(MAIN_WAREHOUSE_ID);
    setTfTo(warehouses.find((w) => w.id !== MAIN_WAREHOUSE_ID)?.id ?? '');
    setTfIngredientId('');
    setTfQty('');
    setTfNote('');
    setTfError('');
    setTfSuccess('');
    setShowTransferForm(true);
  }

  function handleExecuteTransfer() {
    setTfError('');
    setTfSuccess('');
    const qty = parseFloat(String(tfQty).replace(',', '.'));
    const result = executeTransfer({
      allStocks,
      warehouses,
      fromWarehouseId: tfFrom,
      toWarehouseId: tfTo,
      ingredientId: tfIngredientId,
      ingredientName: tfSelectedLine?.ingredientName ?? tfIngredientId,
      unit: tfSelectedLine?.unit ?? 'adet',
      quantity: qty,
      note: tfNote,
    });

    if (!result.ok) {
      setTfError(result.error);
      return;
    }

    setAllStocks(result.updatedStocks);
    setTransfers((prev) => [result.record, ...prev]);
    setTfSuccess(`${result.record.ingredientName} — ${formatQty(result.record.quantity, result.record.unit)} aktarıldı.`);
    setTfIngredientId('');
    setTfQty('');
    setTfNote('');
  }

  function openStockEdit(line?: WarehouseStockLine) {
    if (line) {
      setEditIngredientId(line.ingredientId);
      setEditIngredientName(line.ingredientName);
      setEditUnit(line.unit);
      setEditQty(line.quantity.toString());
    } else {
      setEditIngredientId('');
      setEditIngredientName('');
      setEditUnit('kg');
      setEditQty('');
    }
    setEditMode('set');
    setShowStockEditModal(true);
  }

  function handleSaveStockEdit() {
    const qty = parseFloat(String(editQty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0) return;
    const name = editIngredientName.trim();
    if (!name) return;
    const id = editIngredientId.trim() || `custom-${Date.now()}`;

    setAllStocks((prev) => {
      const items = [...(prev[selectedWarehouseId] ?? [])];
      const idx = items.findIndex((l) => l.ingredientId === id);
      const newQty = editMode === 'add' ? (idx >= 0 ? items[idx].quantity + qty : qty) : qty;
      if (idx >= 0) {
        items[idx] = { ...items[idx], quantity: newQty };
      } else {
        items.push({ ingredientId: id, ingredientName: name, unit: editUnit, quantity: newQty });
      }
      return { ...prev, [selectedWarehouseId]: items };
    });
    setShowStockEditModal(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <AppShell title="Depo Yönetimi" subtitle="Yükleniyor…" backHref="/" backLabel="Modüller">
        <div className="flex h-64 items-center justify-center text-[#6B7280]">Yükleniyor…</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Depo Yönetimi"
      subtitle="Ana depo ve departman depoları arasında stok ve transfer yönetimi"
      backHref="/"
      backLabel="Modüller"
      actions={
        <button
          type="button"
          onClick={openTransferForm}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-95"
        >
          <ArrowRight className="h-4 w-4" />
          Yeni Transfer
        </button>
      }
    >
      <div className="flex min-h-0 gap-4">
        {/* ── Left: Depo listesi ──────────────────────────────────────── */}
        <aside className="flex w-60 shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Depolar</span>
            <button
              type="button"
              onClick={() => { setShowNewDeptForm(true); setTimeout(() => newDeptInputRef.current?.focus(), 60); }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-400 transition hover:bg-blue-500/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Departman
            </button>
          </div>

          {/* New dept form */}
          {showNewDeptForm && (
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <input
                ref={newDeptInputRef}
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddDepartment(); if (e.key === 'Escape') setShowNewDeptForm(false); }}
                placeholder="Departman adı (Bar1, Mutfak…)"
                className="mb-2 w-full rounded-lg border border-white/10 bg-[#0B1220] px-3 py-1.5 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500"
              />
              <input
                value={newDeptDesc}
                onChange={(e) => setNewDeptDesc(e.target.value)}
                placeholder="Açıklama (opsiyonel)"
                className="mb-2 w-full rounded-lg border border-white/10 bg-[#0B1220] px-3 py-1.5 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleAddDepartment} className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">
                  Ekle
                </button>
                <button type="button" onClick={() => setShowNewDeptForm(false)} className="flex-1 rounded-lg bg-white/6 py-1.5 text-xs font-medium text-[#9CA3AF] hover:bg-white/10">
                  İptal
                </button>
              </div>
            </div>
          )}

          <ul className="flex flex-col gap-1">
            {warehouses.map((wh) => {
              const stockItems = getWarehouseStock(allStocks, wh.id);
              const isSelected = selectedWarehouseId === wh.id;
              return (
                <li key={wh.id}>
                  <div
                    className={`group flex w-full items-start gap-2.5 rounded-xl transition ${
                      isSelected ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedWarehouseId(wh.id)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left"
                    >
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${wh.type === 'main' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                        {wh.type === 'main' ? <WarehouseIcon className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-sm font-semibold ${isSelected ? 'text-white' : 'text-[#E5E7EB]'}`}>
                            {wh.name}
                          </span>
                          {wh.type === 'main' && (
                            <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                              Ana
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#6B7280]">
                          {stockItems.length} kalem stok
                        </div>
                      </div>
                    </button>
                    {wh.type !== 'main' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteWarehouse(wh.id)}
                        className="mt-3 mr-2 hidden rounded p-0.5 text-[#6B7280] transition hover:text-red-400 group-hover:inline-flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {warehouses.length === 1 && (
            <p className="px-2 text-xs text-[#4B5563]">Henüz departman eklenmedi. Yukarıdan ekleyin.</p>
          )}
        </aside>

        {/* ── Right: Depo detayı ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {selectedWarehouse ? (
            <>
              {/* Depo başlığı */}
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${selectedWarehouse.type === 'main' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                  {selectedWarehouse.type === 'main' ? <WarehouseIcon className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{selectedWarehouse.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${selectedWarehouse.type === 'main' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                      {selectedWarehouse.type === 'main' ? 'Ana Depo' : 'Departman'}
                    </span>
                  </div>
                  {selectedWarehouse.description && (
                    <p className="text-xs text-[#6B7280]">{selectedWarehouse.description}</p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {selectedWarehouse.type === 'main' && (
                    <button
                      type="button"
                      onClick={() => openStockEdit()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[#9CA3AF] transition hover:border-white/20 hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Stok Ekle
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-white/8 pb-0">
                {(['stock', 'history'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition ${
                      activeTab === tab
                        ? 'border-b-2 border-blue-500 text-blue-400'
                        : 'text-[#6B7280] hover:text-[#9CA3AF]'
                    }`}
                  >
                    {tab === 'stock' ? <Package className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                    {tab === 'stock' ? 'Stok' : 'Transfer Geçmişi'}
                    <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF]">
                      {tab === 'stock' ? selectedStock.length : selectedHistory.length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab contents */}
              {activeTab === 'stock' && (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B5563]" />
                    <input
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Ürün ara…"
                      className="w-full rounded-xl border border-white/8 bg-[#111827] py-2.5 pl-9 pr-4 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500/60"
                    />
                  </div>

                  {filteredStock.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
                      <Package className="h-10 w-10 text-[#374151]" />
                      <div>
                        <p className="font-semibold text-[#6B7280]">Bu depoda stok yok</p>
                        {selectedWarehouse.type === 'department' && (
                          <p className="mt-1 text-xs text-[#4B5563]">Ana depodan transfer yaparak stok ekleyin.</p>
                        )}
                      </div>
                      {selectedWarehouse.type === 'department' && (
                        <button
                          type="button"
                          onClick={openTransferForm}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600/20 px-4 py-2 text-sm font-medium text-blue-400 transition hover:bg-blue-600/30"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Transfer Yap
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#111827]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/8">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Ürün</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Birim</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Miktar</th>
                            {selectedWarehouse.type === 'main' && (
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#6B7280]">İşlem</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStock.map((line, idx) => (
                            <tr
                              key={line.ingredientId}
                              className={`transition hover:bg-white/3 ${idx !== filteredStock.length - 1 ? 'border-b border-white/5' : ''}`}
                            >
                              <td className="px-4 py-3 font-medium text-[#E5E7EB]">{line.ingredientName}</td>
                              <td className="px-4 py-3 text-right text-[#9CA3AF]">{line.unit}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-white">
                                {line.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                              </td>
                              {selectedWarehouse.type === 'main' && (
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openStockEdit(line)}
                                    className="rounded-lg px-2 py-1 text-xs font-medium text-[#6B7280] transition hover:bg-white/8 hover:text-white"
                                  >
                                    Düzenle
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B5563]" />
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Transfer ara…"
                      className="w-full rounded-xl border border-white/8 bg-[#111827] py-2.5 pl-9 pr-4 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500/60"
                    />
                  </div>

                  {filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 py-16 text-center">
                      <History className="h-10 w-10 text-[#374151]" />
                      <p className="font-semibold text-[#6B7280]">Henüz transfer yok</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#111827]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/8">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Tarih</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Ürün</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Gönderen</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Alan</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Miktar</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Not</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHistory.map((t, idx) => {
                            const isOutgoing = t.fromWarehouseId === selectedWarehouseId;
                            return (
                              <tr
                                key={t.id}
                                className={`transition hover:bg-white/3 ${idx !== filteredHistory.length - 1 ? 'border-b border-white/5' : ''}`}
                              >
                                <td className="px-4 py-3 text-[11px] text-[#6B7280]">{formatDate(t.transferredAt)}</td>
                                <td className="px-4 py-3 font-medium text-[#E5E7EB]">{t.ingredientName}</td>
                                <td className="px-4 py-3 text-[#9CA3AF]">
                                  <span className={t.fromWarehouseId === selectedWarehouseId ? 'font-semibold text-red-400' : ''}>
                                    {t.fromWarehouseName}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-[#9CA3AF]">
                                  <span className={t.toWarehouseId === selectedWarehouseId ? 'font-semibold text-green-400' : ''}>
                                    {t.toWarehouseName}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`font-semibold tabular-nums ${isOutgoing ? 'text-red-400' : 'text-green-400'}`}>
                                    {isOutgoing ? '−' : '+'}{formatQty(t.quantity, t.unit)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-[#6B7280]">{t.note ?? '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-24 text-[#6B7280]">
              Soldan bir depo seçin.
            </div>
          )}
        </div>
      </div>

      {/* ── Transfer Modal ─────────────────────────────────────────────────── */}
      {showTransferForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F1623] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Depo Transferi</h3>
              <button type="button" onClick={() => setShowTransferForm(false)} className="rounded-lg p-1.5 text-[#6B7280] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {tfSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-500/15 px-4 py-3 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {tfSuccess}
              </div>
            )}

            {tfError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-400">
                <XCircle className="h-4 w-4 shrink-0" />
                {tfError}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {/* From / To */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Gönderen</label>
                  <select
                    value={tfFrom}
                    onChange={(e) => { setTfFrom(e.target.value); setTfIngredientId(''); setTfError(''); setTfSuccess(''); }}
                    className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-[#4B5563]" />
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Alan</label>
                  <select
                    value={tfTo}
                    onChange={(e) => { setTfTo(e.target.value); setTfError(''); setTfSuccess(''); }}
                    className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="">— Seçin —</option>
                    {warehouses.filter((w) => w.id !== tfFrom).map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ingredient */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Ürün</label>
                <select
                  value={tfIngredientId}
                  onChange={(e) => { setTfIngredientId(e.target.value); setTfError(''); setTfSuccess(''); }}
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">— Seçin —</option>
                  {tfSourceStock.map((l) => (
                    <option key={l.ingredientId} value={l.ingredientId}>
                      {l.ingredientName} — Mevcut: {formatQty(l.quantity, l.unit)}
                    </option>
                  ))}
                </select>
                {tfSourceStock.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-500">Seçilen kaynak depoda stok yok.</p>
                )}
              </div>

              {/* Qty */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">
                  Miktar {tfSelectedLine && <span className="text-[#6B7280]">({tfSelectedLine.unit})</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={tfQty}
                  onChange={(e) => { setTfQty(e.target.value); setTfError(''); setTfSuccess(''); }}
                  placeholder="0"
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500"
                />
                {tfSelectedLine && (
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Mevcut stok: <span className="font-semibold text-[#9CA3AF]">{formatQty(tfSelectedLine.quantity, tfSelectedLine.unit)}</span>
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Not (opsiyonel)</label>
                <input
                  value={tfNote}
                  onChange={(e) => setTfNote(e.target.value)}
                  placeholder="Servis teslimi, sabah açılış…"
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={!tfIngredientId || !tfTo || !tfQty}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Transfer Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Edit Modal ────────────────────────────────────────────────── */}
      {showStockEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0F1623] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editIngredientId ? 'Stok Güncelle' : 'Stok Ekle'}
              </h3>
              <button type="button" onClick={() => setShowStockEditModal(false)} className="rounded-lg p-1.5 text-[#6B7280] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Ürün Adı</label>
                <input
                  value={editIngredientName}
                  onChange={(e) => setEditIngredientName(e.target.value)}
                  disabled={!!editIngredientId}
                  placeholder="Ürün adı"
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">Birim</label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value as RawUnit)}
                  disabled={!!editIngredientId}
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  <option value="kg">kg</option>
                  <option value="lt">lt</option>
                  <option value="adet">adet</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">İşlem</label>
                <div className="flex gap-2">
                  {(['set', 'add'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditMode(m)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${editMode === m ? 'bg-blue-600 text-white' : 'bg-white/6 text-[#9CA3AF] hover:bg-white/10'}`}
                    >
                      {m === 'set' ? 'Yeni Değer' : 'Üstüne Ekle'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#9CA3AF]">
                  Miktar ({editUnit})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white placeholder-[#4B5563] outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveStockEdit}
                disabled={!editIngredientName.trim() || !editQty}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
