'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronLeft, Minus, Plus, Receipt, Search, ShoppingBag, Wallet } from 'lucide-react';
import Link from 'next/link';
import { loadTableLayoutState, subscribeToTableLayoutChanges, type StoredFloorTable } from '@/lib/table-layout-store';
import {
  formatQrCategoryLabel,
  getCategoryAccent,
  getPosCatalogSnapshot,
  getTableQrStatus,
  queueQrOrderForApproval,
  setTableWaiterRequested,
} from '@/lib/qr-menu-state';
import { setTablePaymentRequested, subscribeToPaymentRequestedChanges } from '@/lib/table-payment-state';

type QrCustomerMenuProps = {
  tableId: string;
};

type CartMap = Record<string, number>;

function formatMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

function getCartStorageKey(tableId: string) {
  return `aurelia-qr-cart:${tableId}`;
}

export function QrCustomerMenu({ tableId }: QrCustomerMenuProps) {
  const [tables, setTables] = useState<StoredFloorTable[]>([]);
  const table = useMemo(() => tables.find((item) => item.id === tableId) ?? null, [tableId, tables]);
  const [catalog, setCatalog] = useState(() => getPosCatalogSnapshot());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartMap>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [waiterRequested, setWaiterRequested] = useState(false);
  const [billRequested, setBillRequested] = useState(false);

  useEffect(() => {
    const refreshTables = () => {
      setTables(loadTableLayoutState().tables);
    };

    refreshTables();
    const unsubscribe = subscribeToTableLayoutChanges(refreshTables);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setCatalog(getPosCatalogSnapshot());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(getCartStorageKey(tableId));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        setCart(
          Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0),
          ),
        );
      }
    } catch {
      setCart({});
    }
  }, [tableId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getCartStorageKey(tableId), JSON.stringify(cart));
  }, [cart, tableId]);

  useEffect(() => {
    const refresh = () => {
      const status = getTableQrStatus(tableId);
      setWaiterRequested(Boolean(status.waiterRequestedAt));
      setBillRequested(status.billRequested);
    };

    refresh();
    const unsubscribe = subscribeToPaymentRequestedChanges(refresh);

    return () => {
      unsubscribe();
    };
  }, [tableId]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(catalog.map((item) => item.category)));
    return [
      { id: 'all', label: 'Tümü' },
      ...unique.map((category) => ({
        id: category,
        label: formatQrCategoryLabel(category),
      })),
    ];
  }, [catalog]);

  const deferredSearch = search.trim().toLocaleLowerCase('tr-TR');

  const filteredProducts = useMemo(
    () =>
      catalog.filter((product) => {
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        const matchesSearch =
          deferredSearch.length === 0 || product.name.toLocaleLowerCase('tr-TR').includes(deferredSearch);
        return matchesCategory && matchesSearch;
      }),
    [catalog, deferredSearch, selectedCategory],
  );

  const cartItems = useMemo(
    () =>
      catalog
        .filter((product) => (cart[product.id] ?? 0) > 0)
        .map((product) => ({
          ...product,
          qty: cart[product.id],
        })),
    [cart, catalog],
  );

  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.qty, 0), [cartItems]);
  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.qty * item.price, 0), [cartItems]);

  function changeQty(productId: string, delta: number) {
    setCart((current) => {
      const nextQty = Math.max(0, (current[productId] ?? 0) + delta);
      if (nextQty === 0) {
        const { [productId]: _, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [productId]: nextQty,
      };
    });
  }

  function sendOrder() {
    if (!table || cartItems.length === 0) {
      return;
    }

    queueQrOrderForApproval(
      table.id,
      cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        qty: item.qty,
      })),
    );

    setCart({});
    setNotice('Siparişiniz masaya iletildi.');
  }

  function requestWaiter() {
    if (!table) {
      return;
    }

    setTableWaiterRequested(table.id, true);
    setWaiterRequested(true);
    setNotice('Garson çağrısı gönderildi.');
  }

  function requestBill() {
    if (!table) {
      return;
    }

    setTablePaymentRequested(table.id, true);
    setBillRequested(true);
    setNotice('Hesap isteğiniz POS tarafına iletildi.');
  }

  if (!table) {
    return (
      <main className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
        <div className="mx-auto max-w-md rounded-[1.8rem] border border-white/10 bg-[#111827] p-6 text-center shadow-[0_24px_60px_rgba(8,15,30,0.36)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">QR Menü</p>
          <h1 className="mt-3 text-3xl font-semibold">Masa bulunamadı</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Bu QR bağlantısı tanımlı bir masaya bağlı görünmüyor.</p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Ana ekrana dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.2),_transparent_28%),linear-gradient(180deg,#08111f_0%,#0f172a_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-32 pt-5">
        <header className="rounded-[1.8rem] border border-white/10 bg-[#111827]/92 px-5 py-5 shadow-[0_22px_60px_rgba(8,15,30,0.38)] backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">QR Menü</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{table.name}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">Menüyü incele, sepetine ekle ve siparişi doğrudan masaya gönder.</p>
            </div>
            <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
              Masa aktif
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={requestWaiter}
              className={`rounded-[1.1rem] border px-3 py-3 text-left text-sm font-semibold transition ${
                waiterRequested
                  ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
                  : 'border-white/10 bg-slate-950/40 text-white hover:border-emerald-400/40'
              }`}
            >
              <Bell className="mb-2 h-4 w-4" />
              {waiterRequested ? 'Garson çağrıldı' : 'Garson çağır'}
            </button>
            <button
              type="button"
              onClick={requestBill}
              className={`rounded-[1.1rem] border px-3 py-3 text-left text-sm font-semibold transition ${
                billRequested
                  ? 'border-amber-400/30 bg-amber-500/15 text-amber-100'
                  : 'border-white/10 bg-slate-950/40 text-white hover:border-amber-400/40'
              }`}
            >
              <Receipt className="mb-2 h-4 w-4" />
              {billRequested ? 'Hesap istendi' : 'Hesap iste'}
            </button>
          </div>
        </header>

        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-[#111827]/92 p-3 shadow-[0_18px_48px_rgba(8,15,30,0.28)]">
          <label className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-slate-950/40 px-3 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Menüde ara"
              className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500"
            />
          </label>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition ${
                  selectedCategory === category.id
                    ? 'bg-sky-600 text-white shadow-[0_14px_28px_rgba(14,165,233,0.28)]'
                    : 'border border-white/10 bg-slate-950/40 text-slate-300'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-4 grid gap-3">
          {filteredProducts.map((product) => {
            const qty = cart[product.id] ?? 0;

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#111827]/96 shadow-[0_18px_48px_rgba(8,15,30,0.28)]"
              >
                <div className={`h-28 bg-gradient-to-br ${getCategoryAccent(product.category)} p-[1px]`}>
                  <div className="flex h-full items-end rounded-[1.55rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.14),rgba(15,23,42,0.68))] p-4">
                    <div>
                      <div className="inline-flex rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                        {formatQrCategoryLabel(product.category)}
                      </div>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{product.name}</h2>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fiyat</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatMoney(product.price)}</p>
                  </div>

                  {qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => changeQty(product.id, 1)}
                      className="rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(14,165,233,0.28)] transition hover:-translate-y-0.5 hover:bg-sky-500"
                    >
                      Sepete ekle
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-2 py-2">
                      <button
                        type="button"
                        onClick={() => changeQty(product.id, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-8 text-center text-base font-semibold text-white">{qty}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(product.id, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#08111f]/96 px-4 pb-5 pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          {notice ? (
            <div className="mb-3 rounded-[1rem] border border-emerald-400/30 bg-emerald-500/12 px-3 py-2 text-sm font-semibold text-emerald-100">
              {notice}
            </div>
          ) : null}

          <div className="rounded-[1.6rem] border border-white/10 bg-[#111827] p-4 shadow-[0_18px_48px_rgba(8,15,30,0.34)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sepet</p>
                <p className="mt-1 text-xl font-semibold text-white">{cartCount} ürün</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Toplam</p>
                <p className="mt-1 text-2xl font-semibold text-white">{formatMoney(cartTotal)}</p>
              </div>
            </div>

            {cartItems.length > 0 ? (
              <div className="mt-3 space-y-2">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.qty} x {formatMoney(item.price)}</p>
                    </div>
                    <p className="text-sm font-semibold text-white">{formatMoney(item.qty * item.price)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-[1rem] border border-dashed border-white/10 bg-slate-950/30 px-3 py-4 text-center text-sm text-slate-400">
                Henüz sepetine ürün eklemedin.
              </div>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={sendOrder}
                disabled={cartItems.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-[1rem] bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(16,185,129,0.24)] transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <ShoppingBag className="h-4 w-4" />
                Siparişi gönder
              </button>
              <button
                type="button"
                onClick={requestBill}
                className={`inline-flex items-center justify-center gap-2 rounded-[1rem] border px-4 py-3 text-sm font-semibold transition ${
                  billRequested
                    ? 'border-amber-400/30 bg-amber-500/15 text-amber-100'
                    : 'border-white/10 bg-slate-950/45 text-slate-200 hover:border-amber-400/40'
                }`}
              >
                <Wallet className="h-4 w-4" />
                {billRequested ? 'Hesap istendi' : 'Ödeme için hesap iste'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
