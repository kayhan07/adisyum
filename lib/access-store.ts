'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

export type PermissionMatrixRow = {
  role: string;
  create: boolean;
  cancel: boolean;
  pricing: boolean;
  payment: boolean;
  reports: boolean;
};

export type CustomRole = {
  name: string;
  description: string;
  permissions: string[];
};

export type AccessUser = {
  id: string;
  name: string;
  username: string;
  password: string;
  role: string;
  branchId: string;
  active: boolean;
  permissions: string[];
};

export type AccessState = {
  currentPermissions: string[];
  permissionMatrix: PermissionMatrixRow[];
  customRoles: CustomRole[];
  users: AccessUser[];
};

const STORAGE_KEY = 'adisyon-access-state';
const EVENT_NAME = 'adisyon-access-state:changed';

const DEFAULT_STATE: AccessState = {
  currentPermissions: ['orders.create', 'orders.edit', 'payments.take', 'discount.apply'],
  permissionMatrix: [
    { role: 'Admin', create: true, cancel: true, pricing: true, payment: true, reports: true },
    { role: 'Yönetici', create: true, cancel: true, pricing: true, payment: true, reports: true },
    { role: 'Garson', create: true, cancel: false, pricing: false, payment: true, reports: false },
    { role: 'Muhasebe', create: false, cancel: false, pricing: false, payment: true, reports: true },
  ],
  customRoles: [
    { name: 'Kasa Operatörü', description: 'Ödeme alır ve rapor görür.', permissions: ['Ödeme alma', 'Rapor görme'] },
    { name: 'Servis Lideri', description: 'Sipariş yönetir, iptal edemez.', permissions: ['Sipariş oluşturma', 'Sipariş düzenleme', 'Ödeme alma'] },
  ],
  users: [
    {
      id: 'usr-admin',
      name: 'Admin',
      username: 'admin',
      password: '1234',
      role: 'Admin',
      branchId: 'mrk',
      active: true,
      permissions: ['orders.create', 'orders.edit', 'orders.cancel', 'pricing.manage', 'payments.take', 'reports.view'],
    },
    {
      id: 'usr-cashier',
      name: 'Kasa Kullanıcısı',
      username: 'kasiyer',
      password: '1234',
      role: 'Garson',
      branchId: 'mrk',
      active: true,
      permissions: ['orders.create', 'orders.edit', 'payments.take'],
    },
  ],
};

export function getDefaultAccessState() {
  return DEFAULT_STATE;
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadAccessState() {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  try {
    const raw = readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AccessState>;
    const storedUsers = Array.isArray(parsed.users) ? parsed.users : [];
    const users = [
      ...DEFAULT_STATE.users.filter((defaultUser) => !storedUsers.some((user) => user?.username === defaultUser.username)),
      ...storedUsers,
    ];
    return {
      currentPermissions: Array.isArray(parsed.currentPermissions) ? parsed.currentPermissions : DEFAULT_STATE.currentPermissions,
      permissionMatrix: Array.isArray(parsed.permissionMatrix) ? parsed.permissionMatrix : DEFAULT_STATE.permissionMatrix,
      customRoles: Array.isArray(parsed.customRoles) ? parsed.customRoles : DEFAULT_STATE.customRoles,
      users,
    } satisfies AccessState;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveAccessState(state: AccessState) {
  if (typeof window === 'undefined') return;
  try {
    writeRuntimeItem('tenant', STORAGE_KEY, JSON.stringify(state));
    emitChange();
  } catch {
    // ignore
  }
}

export function subscribeToAccessChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => callback();

  window.addEventListener(EVENT_NAME, onCustom);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    unsubscribeRuntime();
  };
}
