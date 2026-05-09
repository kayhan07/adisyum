'use client';

export type BranchRecord = {
  id: string;
  name: string;
  address: string;
  type: string;
};

export type BranchTransferRecord = {
  id: string;
  source: string;
  target: string;
  item: string;
  quantity: string;
  status: string;
};

type BranchState = {
  branches: BranchRecord[];
  transfers: BranchTransferRecord[];
};

const STORAGE_KEY = 'adisyon-branch-state';
const EVENT_NAME = 'adisyon-branch-state:changed';

const DEFAULT_STATE: BranchState = {
  branches: [
    { id: 'mrk', name: 'Merkez Şube', address: 'Nişantaşı, İstanbul', type: 'Genel merkez' },
    { id: 'kdy', name: 'Kadıköy Şubesi', address: 'Moda, İstanbul', type: 'İstanbul Anadolu' },
    { id: 'izm', name: 'İzmir Sahil Şubesi', address: 'Alsancak, İzmir', type: 'Ege bölgesi' },
  ],
  transfers: [
    { id: 'trf-1', source: 'Merkez Şube', target: 'Kadıköy Şubesi', item: 'Kahve Çekirdeği', quantity: '6 kg', status: 'Tamamlandı' },
    { id: 'trf-2', source: 'Merkez Şube', target: 'İzmir Sahil Şubesi', item: 'Burger Ekmeği', quantity: '120 adet', status: 'Yolda' },
  ],
};

export function getDefaultBranchState() {
  return DEFAULT_STATE;
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadBranchState() {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<BranchState>;
    return {
      branches: Array.isArray(parsed.branches) ? parsed.branches : DEFAULT_STATE.branches,
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : DEFAULT_STATE.transfers,
    } satisfies BranchState;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveBranchState(state: BranchState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emitChange();
  } catch {
    // ignore
  }
}

export function subscribeToBranchChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
