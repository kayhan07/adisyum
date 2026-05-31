'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

export type CompanyState = {
  tradeName: string;
  branchName: string;
  logoUrl: string;
  taxOffice: string;
  taxNumber: string;
  phone: string;
  email: string;
  address: string;
  receiptTitle: string;
  receiptPaperWidth: '58mm' | '80mm';
  receiptShowLogo: boolean;
  receiptShowBranch: boolean;
  receiptShowDate: boolean;
  receiptShowTable: boolean;
  receiptShowItemHeader: boolean;
  receiptHeaderScale: 1 | 2;
  receiptItemScale: 1 | 2;
  receiptTotalScale: 1 | 2;
  receiptFooter: string;
};

export type TenantCompanyProfile = {
  tradeName?: string | null;
  branchName?: string | null;
  logoUrl?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

const STORAGE_KEY = 'adisyon-company-state';
const EVENT_NAME = 'adisyon-company-state:changed';

export function getDefaultCompanyState(): CompanyState {
  return {
    tradeName: 'Aurelia Restaurant',
    branchName: 'Merkez Şube',
    logoUrl: '',
    taxOffice: '',
    taxNumber: '',
    phone: '',
    email: '',
    address: '',
    receiptTitle: 'ADİSYON',
    receiptPaperWidth: '80mm',
    receiptShowLogo: true,
    receiptShowBranch: true,
    receiptShowDate: true,
    receiptShowTable: true,
    receiptShowItemHeader: true,
    receiptHeaderScale: 2,
    receiptItemScale: 2,
    receiptTotalScale: 2,
    receiptFooter: 'Afiyet olsun.',
  };
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadCompanyState(): CompanyState {
  if (typeof window === 'undefined') {
    return getDefaultCompanyState();
  }

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return getDefaultCompanyState();
    return {
      ...getDefaultCompanyState(),
      ...(JSON.parse(raw) as Partial<CompanyState>),
    };
  } catch (error) {
    console.error('[business-flow] company state load failed', error);
    return getDefaultCompanyState();
  }
}

export function saveCompanyState(state: CompanyState) {
  if (typeof window === 'undefined') return;
  writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(state));
  emitChange();
}

export function hydrateCompanyStateFromTenantProfile(profile: TenantCompanyProfile | null | undefined) {
  if (typeof window === 'undefined' || !profile) return;
  const current = loadCompanyState();
  const defaults = getDefaultCompanyState();

  saveCompanyState({
    ...current,
    tradeName: profile.tradeName?.trim() || defaults.tradeName,
    branchName: profile.branchName?.trim() || defaults.branchName,
    logoUrl: profile.logoUrl?.trim() || '',
    taxOffice: profile.taxOffice?.trim() || '',
    taxNumber: profile.taxNumber?.trim() || '',
    phone: profile.phone?.trim() || '',
    email: profile.email?.trim() || '',
    address: profile.address?.trim() || '',
  });
}

export function subscribeToCompanyChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustom = () => callback();

  window.addEventListener(EVENT_NAME, handleCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);
  return () => {
    window.removeEventListener(EVENT_NAME, handleCustom);
    unsubscribeRuntime();
  };
}
