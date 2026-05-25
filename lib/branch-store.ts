'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

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
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<BranchState>;
    return {
      branches: Array.isArray(parsed.branches) ? parsed.branches : DEFAULT_STATE.branches,
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : DEFAULT_STATE.transfers,
    } satisfies BranchState;
  } catch (error) {
    console.error('[business-flow] branch state load failed', error);
    return DEFAULT_STATE;
  }
}

export function saveBranchState(state: BranchState) {
  if (typeof window === 'undefined') return;
  try {
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(state));
    emitChange();
  } catch (error) {
    console.error('[business-flow] branch state save failed', error);
  }
}

export function subscribeToBranchChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => callback();
  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}
