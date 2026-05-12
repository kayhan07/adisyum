'use client';

export type CompanyState = {
  tradeName: string;
  branchName: string;
  logoUrl: string;
  taxOffice: string;
  taxNumber: string;
  phone: string;
  email: string;
  address: string;
  receiptFooter: string;
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultCompanyState();
    return {
      ...getDefaultCompanyState(),
      ...(JSON.parse(raw) as Partial<CompanyState>),
    };
  } catch {
    return getDefaultCompanyState();
  }
}

export function saveCompanyState(state: CompanyState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emitChange();
}

export function subscribeToCompanyChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const handleCustom = () => callback();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(EVENT_NAME, handleCustom);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(EVENT_NAME, handleCustom);
  };
}
