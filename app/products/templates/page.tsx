'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Search, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';

type ProductTemplate = {
  id: string;
  key: string;
  name: string;
  restaurantType: string;
  defaultPrice: string | number;
  printerGroupName?: string | null;
  preparationGroup?: string | null;
};

const RESTAURANT_TYPES = ['Tümü', 'Cafe', 'Kebap', 'Meyhane', 'Balık', 'Fast Food', 'Restaurant'];

export default function ProductTemplatesPage() {
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [restaurantType, setRestaurantType] = useState('Tümü');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (restaurantType !== 'Tümü') params.set('restaurantType', restaurantType);
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/templates/products?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { templates?: ProductTemplate[] } | null;
      if (!cancelled) {
        setTemplates(payload?.templates ?? []);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [query, restaurantType]);

  const selectedCount = selected.length;
  const grouped = useMemo(() => templates.reduce<Record<string, ProductTemplate[]>>((acc, template) => {
    (acc[template.restaurantType] ??= []).push(template);
    return acc;
  }, {}), [templates]);

  function toggle(templateId: string) {
    setSelected((current) => current.includes(templateId)
      ? current.filter((id) => id !== templateId)
      : [...current, templateId]);
  }

  async function importSelected() {
    if (selected.length === 0 || importing) return;
    setImporting(true);
    setMessage('');
    const response = await fetch('/api/templates/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateIds: selected }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; results?: Array<{ status: string }> ; error?: string } | null;
    setImporting(false);
    if (!response.ok || !payload?.ok) {
      setMessage(payload?.error ?? 'Şablon içe aktarma başarısız.');
      return;
    }
    const imported = payload.results?.filter((item) => item.status === 'imported').length ?? 0;
    const skipped = payload.results?.filter((item) => item.status === 'already_imported').length ?? 0;
    setMessage(`${imported} şablon tenant verisine kopyalandı${skipped ? `, ${skipped} kayıt zaten vardı` : ''}.`);
    setSelected([]);
  }

  return (
    <AppShell
      title="Ürün/Reçete Havuzu"
      subtitle="Şablonlar yalnızca başlangıç blueprint'idir. İçe aktardığınız anda ürün, reçete, stok kartı ve kategori kayıtları tenant'ınıza ait bağımsız kopyalara dönüşür."
      actions={(
        <button type="button" onClick={() => void importSelected()} disabled={selectedCount === 0 || importing} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          <Download className="h-4 w-4" />
          {importing ? 'İçe aktarılıyor' : `${selectedCount} şablonu içe aktar`}
        </button>
      )}
    >
      <section className="grid gap-5">
        <div className="grid gap-3 rounded-3xl border border-line bg-panel p-4 md:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-canvas px-4">
            <Search className="h-4 w-4 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Şablon ara" className="h-12 w-full bg-transparent text-sm outline-none" />
          </label>
          <select value={restaurantType} onChange={(event) => setRestaurantType(event.target.value)} className="h-12 rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold">
            {RESTAURANT_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>

        {message ? <p className="rounded-2xl border border-accent/20 bg-accentSoft px-4 py-3 text-sm font-semibold text-accent">{message}</p> : null}

        {loading ? <p className="text-sm text-muted">Şablon havuzu yükleniyor...</p> : Object.entries(grouped).map(([type, items]) => (
          <section key={type} className="grid gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 className="text-lg font-semibold text-ink">{type}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((template) => {
                const active = selected.includes(template.id);
                return (
                  <button key={template.id} type="button" onClick={() => toggle(template.id)} className={`rounded-3xl border p-4 text-left transition ${active ? 'border-accent bg-accentSoft' : 'border-line bg-panel hover:border-accent/40'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{template.name}</p>
                        <p className="mt-1 text-sm text-muted">{template.preparationGroup ?? 'Hazırlık'} · {template.printerGroupName ?? 'Yazıcı grubu'}</p>
                      </div>
                      {active ? <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" /> : null}
                    </div>
                    <p className="mt-4 text-sm font-semibold text-ink">Varsayılan fiyat: ₺{Number(template.defaultPrice).toLocaleString('tr-TR')}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </section>
    </AppShell>
  );
}
