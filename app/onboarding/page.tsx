'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, PackageCheck, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';

type TemplatePack = {
  id: string;
  name: string;
  restaurantType: string;
  scale: string;
  version: number;
  description?: string | null;
  defaults: Record<string, unknown>;
};
type Preview = {
  summary: {
    packs: number;
    products: number;
    recipes: number;
    recipeItems: number;
    stockItemsToCreate: number;
    stockMatches: number;
    duplicateImports: number;
  };
};

const TYPES = ['Cafe', 'Kebap', 'Meyhane', 'Balık', 'Fast Food', 'Restaurant'];
const SCALES = ['small', 'medium', 'large'];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [restaurantType, setRestaurantType] = useState('Cafe');
  const [scale, setScale] = useState('small');
  const [packs, setPacks] = useState<TemplatePack[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [branchName, setBranchName] = useState('Merkez Şube');
  const [takeawayEnabled, setTakeawayEnabled] = useState(true);
  const [serviceChargePercent, setServiceChargePercent] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ restaurantType, scale });
      const response = await fetch(`/api/templates/packs?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { packs?: TemplatePack[] } | null;
      setPacks(payload?.packs ?? []);
      setSelectedPacks([]);
      setPreview(null);
    }
    void load();
  }, [restaurantType, scale]);

  const selectedPackRows = useMemo(() => packs.filter((pack) => selectedPacks.includes(pack.id)), [packs, selectedPacks]);

  function togglePack(packId: string) {
    setSelectedPacks((current) => current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId]);
  }

  async function buildPreview() {
    setBusy(true);
    const response = await fetch('/api/templates/preview', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packIds: selectedPacks }),
    });
    const payload = await response.json().catch(() => null) as { preview?: Preview } | null;
    setPreview(payload?.preview ?? null);
    setBusy(false);
    setStep(4);
  }

  async function finishProvisioning() {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/templates/packs/import', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        packIds: selectedPacks,
        configuration: { branchName, takeawayEnabled, serviceChargePercent },
      }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (!response.ok || !payload?.ok) {
      setMessage(payload?.error ?? 'Kurulum tamamlanamadı.');
      return;
    }
    setMessage('Kurulum tamamlandı. Ürünler, reçeteler ve stok kartları tenant verinize aktarıldı.');
    setStep(6);
  }

  return (
    <AppShell
      title="Akıllı Restoran Kurulumu"
      subtitle="Boş tenant verinizi birkaç adımda operasyonel POS ortamına dönüştürün. Şablonlar yalnızca tenant-owned kopyalar üretir."
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-6">
          {['Tip', 'Ölçek', 'Paket', 'Önizleme', 'Ayarlar', 'Tamam'].map((label, index) => (
            <div key={label} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${step >= index + 1 ? 'border-accent bg-accentSoft text-accent' : 'border-line bg-panel text-muted'}`}>
              {index + 1}. {label}
            </div>
          ))}
        </div>

        {step === 1 ? (
          <section className="grid gap-3 md:grid-cols-3">
            {TYPES.map((type) => <button key={type} type="button" onClick={() => { setRestaurantType(type); setStep(2); }} className={`rounded-3xl border p-5 text-left ${restaurantType === type ? 'border-accent bg-accentSoft' : 'border-line bg-panel'}`}><Sparkles className="h-5 w-5 text-accent" /><p className="mt-4 text-lg font-semibold text-ink">{type}</p></button>)}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-3 md:grid-cols-3">
            {SCALES.map((item) => <button key={item} type="button" onClick={() => { setScale(item); setStep(3); }} className={`rounded-3xl border p-5 text-left ${scale === item ? 'border-accent bg-accentSoft' : 'border-line bg-panel'}`}><Building2 className="h-5 w-5 text-accent" /><p className="mt-4 text-lg font-semibold capitalize text-ink">{item}</p></button>)}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              {packs.map((pack) => {
                const active = selectedPacks.includes(pack.id);
                return <button key={pack.id} type="button" onClick={() => togglePack(pack.id)} className={`rounded-3xl border p-5 text-left ${active ? 'border-accent bg-accentSoft' : 'border-line bg-panel'}`}><div className="flex justify-between gap-3"><div><p className="text-lg font-semibold text-ink">{pack.name}</p><p className="mt-1 text-sm text-muted">{pack.description}</p></div>{active ? <CheckCircle2 className="h-5 w-5 text-accent" /> : null}</div><p className="mt-4 text-sm font-semibold text-ink">v{pack.version}</p></button>;
              })}
            </div>
            <button type="button" onClick={() => void buildPreview()} disabled={selectedPacks.length === 0 || busy} className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white disabled:opacity-50">Önizleme oluştur <ArrowRight className="h-4 w-4" /></button>
          </section>
        ) : null}

        {step === 4 && preview ? (
          <section className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['Paket', preview.summary.packs],
                ['Ürün', preview.summary.products],
                ['Reçete', preview.summary.recipes],
                ['Reçete satırı', preview.summary.recipeItems],
                ['Yeni stok kartı', preview.summary.stockItemsToCreate],
                ['Eşleşen stok', preview.summary.stockMatches],
              ].map(([label, value]) => <div key={String(label)} className="rounded-3xl border border-line bg-panel p-5"><p className="text-sm text-muted">{label}</p><p className="mt-3 text-3xl font-semibold text-ink">{value}</p></div>)}
            </div>
            <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">Duplicate import: {preview.summary.duplicateImports}</p>
            <button type="button" onClick={() => setStep(5)} className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white">Ayarları yapılandır <ArrowRight className="h-4 w-4" /></button>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="grid gap-4 rounded-3xl border border-line bg-panel p-5 md:max-w-xl">
            <input value={branchName} onChange={(event) => setBranchName(event.target.value)} className="h-12 rounded-2xl border border-line bg-canvas px-4" />
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-canvas px-4 py-3">Paket servis / takeaway <input type="checkbox" checked={takeawayEnabled} onChange={(event) => setTakeawayEnabled(event.target.checked)} /></label>
            <label className="grid gap-2 text-sm font-semibold">Servis bedeli %{serviceChargePercent}<input type="range" min="0" max="20" value={serviceChargePercent} onChange={(event) => setServiceChargePercent(Number(event.target.value))} /></label>
            <button type="button" onClick={() => void finishProvisioning()} disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white disabled:opacity-50"><PackageCheck className="h-4 w-4" /> Kurulumu tamamla</button>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="rounded-3xl border border-accent/30 bg-accentSoft p-6">
            <CheckCircle2 className="h-8 w-8 text-accent" />
            <h2 className="mt-4 text-2xl font-semibold text-ink">Restoran hazır</h2>
            <p className="mt-2 text-sm text-muted">{message}</p>
          </section>
        ) : null}

        {message && step !== 6 ? <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm">{message}</p> : null}
        {selectedPackRows.length ? <p className="text-sm text-muted">Seçili paketler: {selectedPackRows.map((pack) => pack.name).join(', ')}</p> : null}
      </div>
    </AppShell>
  );
}
