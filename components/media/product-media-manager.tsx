'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AppShell } from '@/components/app-shell';
import { ImageUploader } from '@/components/media/image-uploader';
import { Images, Package, Tag, RefreshCw } from 'lucide-react';
import { loadStoredSaleProducts, saveStoredSaleProducts, type StoredSaleProduct } from '@/lib/sale-product-catalog';

type MediaAsset = {
  id: string;
  entityType: string;
  entityId: string;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  optimizedSizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

type MediaTab = 'products' | 'categories' | 'gallery';

export function ProductMediaManager() {
  const [products, setProducts] = useState<StoredSaleProduct[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [activeTab, setActiveTab] = useState<MediaTab>('products');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    setProducts(loadStoredSaleProducts() ?? []);
    void loadAssets();
  }, []);

  async function loadAssets() {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/media/list?entityType=product');
      if (res.ok) {
        const data = (await res.json()) as { assets: MediaAsset[] };
        setAssets(data.assets);
      }
    } catch { /* ignore */ }
    setLoadingAssets(false);
  }

  function getProductImage(productId: string) {
    return assets.find((a) => a.entityId === productId && a.entityType === 'product') ?? null;
  }

  function handleUploaded(productId: string, result: { url: string; thumbnailUrl: string }) {
    // Update local sale products store with new image
    const updated = products.map((p) =>
      p.id === productId ? { ...p, imageUrl: result.url, thumbnailUrl: result.thumbnailUrl } : p,
    );
    saveStoredSaleProducts(updated);
    setProducts(updated);
    void loadAssets();
  }

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const filtered = products
    .filter((p) =>
      search.trim() === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
    )
    .filter((p) => !onlyMissing || !getProductImage(p.id));

  const withImages = products.filter((p) => Boolean(p.imageUrl)).length;
  const coverage = products.length > 0 ? Math.round((withImages / products.length) * 100) : 0;

  const tabs: Array<{ id: MediaTab; label: string; icon: React.ReactNode }> = [
    { id: 'products', label: 'Ürün Görselleri', icon: <Package className="h-4 w-4" /> },
    { id: 'categories', label: 'Kategori Görselleri', icon: <Tag className="h-4 w-4" /> },
    { id: 'gallery', label: 'Medya Galerisi', icon: <Images className="h-4 w-4" /> },
  ];

  return (
    <AppShell title="Görsel Yönetimi" subtitle="Ürün ve kategori görsellerini yükle ve yönet" backHref="/app" backLabel="Ana menü">
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Görsel Yönetimi</h1>
            <p className="mt-1 text-sm text-slate-400">Ürün ve kategori görsellerini yükle, optimize et, yönet.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Görsel Kapsamı</p>
              <p className="mt-1 text-xl font-bold text-white">{coverage}%</p>
              <p className="text-[10px] text-slate-500">{withImages}/{products.length} ürün</p>
            </div>
            <div className="ml-4 h-14 w-14 rounded-full border-4 border-white/10" style={{ background: `conic-gradient(rgb(14 165 233) ${coverage * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-white/4 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-blue-600/30 text-blue-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
          <button type="button" onClick={() => void loadAssets()} className="ml-auto rounded-xl p-2 text-slate-400 hover:text-slate-200">
            <RefreshCw className={`h-4 w-4 ${loadingAssets ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {activeTab === 'products' && (
          <div className="grid gap-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün ara..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-sky-500" />
                Sadece görselsiz ürünler
              </label>
            </div>

            {/* Product grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => {
                const existingAsset = getProductImage(product.id);
                return (
                  <div key={product.id} className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
                    {/* Current image preview */}
                    {existingAsset ? (
                      <div className="relative h-32 bg-slate-900">
                        <Image src={existingAsset.thumbnailUrl ?? existingAsset.url} alt={product.name} fill className="object-cover" sizes="240px" />
                        <div className="absolute right-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                          {existingAsset.optimizedSizeBytes ? `${(existingAsset.optimizedSizeBytes / 1024).toFixed(0)}KB` : '✓'}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-slate-900/40">
                        <Package className="h-8 w-8 text-slate-700" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                      <p className="text-[11px] text-slate-500">{product.category}</p>
                      <div className="mt-2">
                        <ImageUploader
                          entityType="product"
                          entityId={product.id}
                          currentImageUrl={existingAsset?.url ?? null}
                          label=""
                          onUploaded={(res) => handleUploaded(product.id, res)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full rounded-2xl border border-white/8 bg-white/4 px-6 py-12 text-center text-sm text-slate-400">
                  {onlyMissing ? 'Tüm ürünlerin görseli mevcut!' : 'Ürün bulunamadı.'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const catAsset = assets.find((a) => a.entityId === cat && a.entityType === 'category');
              return (
                <div key={cat} className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden">
                  {catAsset ? (
                    <div className="relative h-24">
                      <Image src={catAsset.thumbnailUrl ?? catAsset.url} alt={cat} fill className="object-cover" sizes="320px" />
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-gradient-to-r from-slate-800 to-slate-900">
                      <Tag className="h-7 w-7 text-slate-600" />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-white">{cat}</p>
                    <p className="text-[11px] text-slate-500">{products.filter((p) => p.category === cat).length} ürün</p>
                    <div className="mt-2">
                      <ImageUploader
                        entityType="category"
                        entityId={cat}
                        currentImageUrl={catAsset?.url ?? null}
                        label=""
                        onUploaded={() => void loadAssets()}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'gallery' && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>{assets.length} medya dosyası</span>
              {assets.length > 0 && (
                <span className="ml-2 text-slate-500">
                  Toplam: {(assets.reduce((s, a) => s + a.sizeBytes, 0) / (1024 * 1024)).toFixed(1)} MB orijinal →{' '}
                  {(assets.reduce((s, a) => s + (a.optimizedSizeBytes ?? 0), 0) / (1024 * 1024)).toFixed(1)} MB optimize
                </span>
              )}
            </div>
            {assets.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/4 py-12 text-center text-sm text-slate-400">
                Henüz yüklenmiş görsel yok.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {assets.map((asset) => (
                  <div key={asset.id} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900">
                    <div className="relative h-28">
                      <Image src={asset.thumbnailUrl ?? asset.url} alt={asset.entityId} fill className="object-cover" sizes="200px" />
                    </div>
                    <div className="px-2 py-2">
                      <p className="truncate text-[10px] text-slate-400">{asset.entityType}/{asset.entityId.slice(0, 16)}</p>
                      <p className="text-[10px] text-slate-500">
                        {asset.width}×{asset.height} · {asset.optimizedSizeBytes ? (asset.optimizedSizeBytes / 1024).toFixed(0) + 'KB' : (asset.sizeBytes / 1024).toFixed(0) + 'KB'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
