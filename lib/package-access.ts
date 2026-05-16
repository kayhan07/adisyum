'use client';

export {
  DEFAULT_PACKAGE_MODULES,
  getDefaultModulesForPackageType,
  sanitizePackageModules,
  type PackageModuleKey,
} from '@/lib/package-access-core';
import type { PackageModuleKey } from '@/lib/package-access-core';

export const PACKAGE_MODULE_OPTIONS: Array<{ key: PackageModuleKey; label: string; description: string }> = [
  { key: 'floor', label: 'Masalar', description: 'Salon yerleşimi ve masa akışı' },
  { key: 'orders', label: 'Siparişler', description: 'Sipariş operasyonları ve takip' },
  { key: 'qr', label: 'QR Sipariş', description: 'QR sipariş ekranları' },
  { key: 'qr-menu', label: 'QR Menü', description: 'Dijital menü ve masa QR akışı' },
  { key: 'products', label: 'Ürünler', description: 'Ürün, reçete ve stok kartları' },
  { key: 'finance', label: 'Finans', description: 'Kasa, cari ve tahsilat yönetimi' },
  { key: 'delivery', label: 'Paket Servis', description: 'Kurye ve teslimat operasyonu' },
  { key: 'kds', label: 'KDS', description: 'Mutfak ekran ve ticket akışı' },
  { key: 'branches', label: 'Şubeler', description: 'Çok şube ve merkez yönetimi' },
  { key: 'reports', label: 'Raporlar', description: 'Performans ve finans raporları' },
  { key: 'settings', label: 'Ayarlar', description: 'Firma, entegrasyon ve yetki ayarları' },
  { key: 'overview', label: 'Genel Görünüm', description: 'Merkez panel ve özet ekranlar' },
  { key: 'warehouse', label: 'Depo', description: 'Depo ve transfer işlemleri' },
  { key: 'bar-control', label: 'Bar Kontrol', description: 'Bar operasyon ve kontrol ekranı' },
  { key: 'saas', label: 'SaaS', description: 'Lisans ve abonelik ekranı' },
];

