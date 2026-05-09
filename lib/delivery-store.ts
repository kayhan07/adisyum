'use client';

export type DeliveryCompany = {
  id: string;
  name: string;
  commissionRate: number;
  invoicePeriod: 'daily' | 'weekly' | 'monthly';
};

export type DeliveryCourier = {
  id: string;
  name: string;
  phone: string;
  status: 'available' | 'busy' | 'offline';
  lastLocation: string;
};

export type DeliveryOrder = {
  id: string;
  companyId: string;
  sourceIntegrationId?: string;
  sourceOrderKey?: string;
  courierId?: string;
  customerName: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'online' | 'account';
  status: 'new' | 'preparing' | 'on_route' | 'delivered' | 'cancelled';
  createdAt: string;
};

export type DeliveryState = {
  companies: DeliveryCompany[];
  couriers: DeliveryCourier[];
  orders: DeliveryOrder[];
};

const STORAGE_KEY = 'adisyon-delivery-state';
const EVENT_NAME = 'adisyon-delivery-state:changed';

export function getDefaultDeliveryState(): DeliveryState {
  return {
    companies: [
      { id: 'trendyol', name: 'Trendyol Yemek', commissionRate: 12, invoicePeriod: 'monthly' },
      { id: 'getir', name: 'Getir Yemek', commissionRate: 10, invoicePeriod: 'monthly' },
      { id: 'yemeksepeti', name: 'Yemeksepeti', commissionRate: 13, invoicePeriod: 'monthly' },
    ],
    couriers: [
      { id: 'kurye-1', name: 'Ali Kurye', phone: '05xx xxx xx xx', status: 'available', lastLocation: 'Şubede' },
    ],
    orders: [],
  };
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function loadDeliveryState(): DeliveryState {
  if (typeof window === 'undefined') return getDefaultDeliveryState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultDeliveryState();
    const parsed = JSON.parse(raw) as Partial<DeliveryState>;
    return {
      companies: Array.isArray(parsed.companies) ? parsed.companies : getDefaultDeliveryState().companies,
      couriers: Array.isArray(parsed.couriers) ? parsed.couriers : getDefaultDeliveryState().couriers,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch {
    return getDefaultDeliveryState();
  }
}

export function saveDeliveryState(state: DeliveryState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emitChange();
}

export function subscribeToDeliveryChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
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
