'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  ChefHat,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  Package2,
  QrCode,
  SlidersHorizontal,
  Store,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { canPackageAccessModule, loadAuthToken } from '@/lib/saas-store';
import { secureLogout } from '@/lib/client/secure-logout';

type PackageType = 'mini' | 'gold' | 'premium';

type ModuleCard = {
  moduleId: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  accent: string;
  tone: string;
};

const packageTypes = new Set(['mini', 'gold', 'premium']);

function normalizePackageType(value: unknown): PackageType {
  return typeof value === 'string' && packageTypes.has(value) ? value as PackageType : 'premium';
}

function canOpenModule(packageType: PackageType, moduleId: string, packageId?: string) {
  try {
    return canPackageAccessModule(packageType, moduleId, packageId);
  } catch (error) {
    console.error('[module-center] package access check failed', { packageType, moduleId, packageId, error });
    return false;
  }
}

const modules: ModuleCard[] = [
  { moduleId: 'floor', href: '/floor', label: 'Masalar', description: 'Salon yerleşimi ve masa içinden adisyon geçişi', icon: Grid2x2, color: 'from-[#2563EB] to-[#1D4ED8]', accent: 'shadow-[0_18px_38px_rgba(37,99,235,0.24)]', tone: 'blue' },
  { moduleId: 'qr-menu', href: '/qr-menu', label: 'QR Menü', description: 'Masa QR menüsü ve dijital sipariş akışı', icon: QrCode, color: 'from-[#0EA5E9] to-[#0369A1]', accent: 'shadow-[0_18px_38px_rgba(14,165,233,0.22)]', tone: 'sky' },
  { moduleId: 'products', href: '/products', label: 'Ürünler', description: 'Satış ürünleri, hammaddeler ve reçete', icon: Package2, color: 'from-[#F97316] to-[#EA580C]', accent: 'shadow-[0_18px_38px_rgba(249,115,22,0.22)]', tone: 'orange' },
  { moduleId: 'finance', href: '/finance', label: 'Finans', description: 'Cari, fatura, kasa ve tahsilat', icon: CreditCard, color: 'from-[#10B981] to-[#059669]', accent: 'shadow-[0_18px_38px_rgba(16,185,129,0.22)]', tone: 'green' },
  { moduleId: 'delivery', href: '/delivery', label: 'Paket Servis', description: 'Firma, kurye ve teslimat takibi', icon: Truck, color: 'from-[#0F766E] to-[#115E59]', accent: 'shadow-[0_18px_38px_rgba(15,118,110,0.22)]', tone: 'delivery' },
  { moduleId: 'kds', href: '/kds', label: 'KDS', description: 'Mutfak ve bar bilet yönetimi', icon: ChefHat, color: 'from-[#8B5CF6] to-[#7C3AED]', accent: 'shadow-[0_18px_38px_rgba(139,92,246,0.22)]', tone: 'violet' },
  { moduleId: 'branches', href: '/branches', label: 'Şubeler', description: 'Şube operasyonları ve transferler', icon: Building2, color: 'from-[#14B8A6] to-[#0F766E]', accent: 'shadow-[0_18px_38px_rgba(20,184,166,0.22)]', tone: 'teal' },
  { moduleId: 'reports', href: '/reports', label: 'Raporlar', description: 'Kar zarar ve performans raporları', icon: BarChart3, color: 'from-[#F59E0B] to-[#D97706]', accent: 'shadow-[0_18px_38px_rgba(245,158,11,0.22)]', tone: 'amber' },
  { moduleId: 'settings', href: '/settings', label: 'Ayarlar', description: 'Firma, yetki, entegrasyon ve teknik ayarlar', icon: SlidersHorizontal, color: 'from-[#475569] to-[#1E293B]', accent: 'shadow-[0_18px_38px_rgba(71,85,105,0.24)]', tone: 'settings' },
  { moduleId: 'saas', href: '/saas', label: 'SaaS', description: 'Lisans ve abonelik takibi', icon: Store, color: 'from-[#DC2626] to-[#B91C1C]', accent: 'shadow-[0_18px_38px_rgba(220,38,38,0.22)]', tone: 'rose' },
  { moduleId: 'overview', href: '/overview', label: 'Genel Görünüm', description: 'Tüm sistem için merkez ekran', icon: LayoutDashboard, color: 'from-[#6366F1] to-[#4338CA]', accent: 'shadow-[0_18px_38px_rgba(99,102,241,0.22)]', tone: 'indigo' },
];

export function ModuleCenter() {
  const [blockedMessage, setBlockedMessage] = useState('');
  const [packageType, setPackageType] = useState<PackageType>('premium');
  const [packageId, setPackageId] = useState<string | undefined>(undefined);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    try {
      const token = loadAuthToken();
      setPackageType(normalizePackageType(token?.package_type));
      setPackageId(typeof token?.package_id === 'string' ? token.package_id : undefined);
    } catch {
      console.error('[module-center] auth context load failed');
      setPackageType('premium');
      setPackageId(undefined);
    }
  }, []);

  const packageLabel = useMemo(() => packageType.toUpperCase(), [packageType]);

  async function handleSecureLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await secureLogout({ reason: 'manual', scope: 'current', redirect: true });
    setLoggingOut(false);
  }

  return (
    <AppShell
      title="Modül merkezi"
      subtitle={`Aktif paket: ${packageLabel}. Doğrudan modül seçip ilgili ekrana geçin.`}
      actions={(
        <button
          type="button"
          onClick={() => void handleSecureLogout()}
          disabled={loggingOut}
          className="app-chip border border-rose-300/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
        >
          {loggingOut ? 'Çıkılıyor...' : 'Güvenli Çıkış'}
        </button>
      )}
    >
      {blockedMessage ? (
        <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
          {blockedMessage}
        </div>
      ) : null}
      <section className="grid w-full gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {modules.map((module) => {
          const Icon = module.icon;
          const allowed = canOpenModule(packageType, module.moduleId, packageId);
          const className = `module-card group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-br ${module.color} p-6 text-white transition duration-200 ${allowed ? `hover:-translate-y-1 hover:scale-[1.01] ${module.accent}` : 'grayscale opacity-60'}`;
          const content = (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_26%)] opacity-90" />
              <div className="relative flex h-full min-h-[178px] flex-col justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-sm">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-[1.8rem] font-semibold tracking-tight">{module.label}</h3>
                  <p className="mt-2 max-w-[22rem] text-sm leading-5 text-white/82">{module.description}</p>
                  <div className="module-card-badge mt-4 inline-flex items-center rounded-full bg-black/18 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
                    {allowed ? 'Modülü aç' : 'Paket gerekli'}
                  </div>
                </div>
              </div>
            </>
          );

          return allowed ? (
            <Link key={`${module.href}-${module.label}`} href={module.href} prefetch={false} data-tone={module.tone} className={className}>
              {content}
            </Link>
          ) : (
            <button
              key={`${module.href}-${module.label}`}
              type="button"
              data-tone={module.tone}
              onClick={() => setBlockedMessage('Bu paketi kullanım izniniz yok')}
              className={`${className} text-left`}
            >
              {content}
            </button>
          );
        })}
      </section>
    </AppShell>
  );
}
