'use client';

import { readRuntimeItem, subscribeRuntimeScope, writeRuntimeItem } from '@/lib/client/runtime-state';

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  status: 'Aktif' | 'Pasif';
  limit: string;
  scopes: string;
};

export type ApiUsageLog = {
  id: string;
  method: string;
  path: string;
  status: number;
  actor: string;
  time: string;
};

export type WebhookEventRecord = {
  id: string;
  event: string;
  target: string;
  status: string;
};

export type PartnerIntegrationAuthType = 'basic' | 'bearer' | 'apiKey';
export type PartnerIntegrationMethod = 'GET' | 'POST';
export type PartnerIntegrationAuthFlow = 'direct' | 'oauthClientCredentials';

export type PartnerIntegrationRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  version: string;
  autoImport?: boolean;
  lastPullAt?: string;
  authFlow?: PartnerIntegrationAuthFlow;
  authType?: PartnerIntegrationAuthType;
  method?: PartnerIntegrationMethod;
  baseUrl?: string;
  ordersPath?: string;
  tokenUrl?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiSecret?: string;
  apiKeyHeader?: string;
  apiSecretHeader?: string;
  userAgent?: string;
  sellerId?: string;
  storeId?: string;
  chainId?: string;
  vendorId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  notes?: string;
};

export type PrinterDeviceType = 'receipt_printer' | 'kitchen_printer' | 'bar_printer' | 'fiscal_pos';

export type PrinterDeviceRecord = {
  id: string;
  name: string;
  role: string;
  deviceType?: PrinterDeviceType;
  connectionType?: 'usb' | 'network';
  systemName?: string;
  driverName?: string;
  portName?: string;
  ip: string;
  port: number;
  status: 'Aktif' | 'Yedek' | 'Pasif';
  queue: number;
  retry: string;
  backup: string;
  group: string;
};

export type TenantPrinterSettings = {
  defaultPrinter: string;
  kitchenPrinter: string;
  barPrinter: string;
  deviceType: Exclude<PrinterDeviceType, 'fiscal_pos'>;
};

export type PrinterMappingRecord = {
  id: string;
  category: string;
  printer: string;
  fallback: string;
  load: string;
};

export type PrintLogRecord = {
  id: string;
  order: string;
  printer: string;
  status: string;
  time: string;
  info: string;
};

export type IntegrationState = {
  apiKeys: ApiKeyRecord[];
  apiUsageLogs: ApiUsageLog[];
  webhookEvents: WebhookEventRecord[];
  partnerIntegrations: PartnerIntegrationRecord[];
  printerDevices: PrinterDeviceRecord[];
  printerSettings: TenantPrinterSettings;
  printerMappings: PrinterMappingRecord[];
  printLogs: PrintLogRecord[];
};

const STORAGE_KEY = 'adisyon-integrations-state';
const LOCAL_STORAGE_KEY = 'adisyum-local-integrations-state';
const EVENT_NAME = 'adisyon-integrations-state:changed';

const DEFAULT_STATE: IntegrationState = {
  apiKeys: [],
  apiUsageLogs: [],
  webhookEvents: [],
  partnerIntegrations: [],
  printerDevices: [
    { id: 'prt-mutfak-a', name: 'Sıcak Mutfak A', role: 'Mutfak', deviceType: 'kitchen_printer', ip: '192.168.1.210', port: 9100, status: 'Aktif', queue: 3, retry: '15 sn', backup: 'Sıcak Mutfak B', group: 'Mutfak hattı' },
    { id: 'prt-mutfak-b', name: 'Sıcak Mutfak B', role: 'Mutfak Yedek', deviceType: 'kitchen_printer', ip: '192.168.1.211', port: 9100, status: 'Yedek', queue: 1, retry: '15 sn', backup: 'Otomatik devralır', group: 'Mutfak hattı' },
    { id: 'prt-bar', name: 'Bar İstasyonu', role: 'Bar', deviceType: 'bar_printer', ip: '192.168.1.212', port: 9100, status: 'Aktif', queue: 2, retry: '20 sn', backup: 'Tatlı İstasyonu', group: 'İçecek hattı' },
    { id: 'prt-kasa', name: 'Kasa POS Yazıcısı', role: 'Kasa', deviceType: 'receipt_printer', ip: '192.168.1.213', port: 9100, status: 'Aktif', queue: 0, retry: '10 sn', backup: 'Ön Kasa Yedek', group: 'Kasa hattı' },
  ],
  printerSettings: {
    defaultPrinter: 'Kasa POS Yazıcısı',
    kitchenPrinter: 'Sıcak Mutfak A',
    barPrinter: 'Bar İstasyonu',
    deviceType: 'receipt_printer',
  },
  printerMappings: [
    { id: 'map-food', category: 'Yemek', printer: 'Sıcak Mutfak A', fallback: 'Sıcak Mutfak B', load: 'Mutfak A/B arasında paylaştırılır' },
    { id: 'map-drink', category: 'İçecek', printer: 'Bar İstasyonu', fallback: 'Tatlı İstasyonu', load: 'Bar hattı yoğunluğa göre yönlenir' },
    { id: 'map-dessert', category: 'Tatlı', printer: 'Tatlı İstasyonu', fallback: 'Bar İstasyonu', load: 'Tatlı kuyruğu bağımsız akar' },
  ],
  printLogs: [
    { id: 'pl-1', order: 'ORD-20260409193001', printer: 'Sıcak Mutfak A', status: 'Gönderildi', time: '19:30:05', info: 'Hazırlık fişi' },
    { id: 'pl-2', order: 'ORD-20260409193001', printer: 'Sıcak Mutfak B', status: 'Failover', time: '19:30:07', info: 'Ana yazıcı cevap vermedi' },
    { id: 'pl-3', order: 'ORD-20260409192844', printer: 'Bar İstasyonu', status: 'Bekliyor', time: '19:28:46', info: 'Bağlantı dönünce yazdırılacak' },
    { id: 'pl-4', order: 'ORD-20260409192718', printer: 'Kasa POS Yazıcısı', status: 'Gönderildi', time: '19:27:29', info: 'Kapanış fişi' },
  ],
};

function normalizePrinterDevices(devices: PrinterDeviceRecord[]) {
  const seen = new Map<string, number>();

  return devices.map((printer) => {
    const baseId = printer.id || `prt-${printer.name.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/gi, '-')}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);

    return {
      ...printer,
      deviceType: normalizePrinterDeviceType(printer.deviceType, printer.role),
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
    };
  });
}

function normalizePrinterDeviceType(
  deviceType: PrinterDeviceRecord['deviceType'],
  role: string,
): PrinterDeviceType {
  if (deviceType === 'receipt_printer' || deviceType === 'kitchen_printer' || deviceType === 'bar_printer' || deviceType === 'fiscal_pos') {
    return deviceType;
  }

  const normalizedRole = role.toLocaleLowerCase('tr-TR');
  if (normalizedRole.includes('fiscal') || normalizedRole.includes('yazar') || normalizedRole.includes('kasa pos')) return 'fiscal_pos';
  if (normalizedRole.includes('mutfak')) return 'kitchen_printer';
  if (normalizedRole.includes('bar') || normalizedRole.includes('içecek') || normalizedRole.includes('icecek')) return 'bar_printer';
  return 'receipt_printer';
}

function normalizePrinterSettings(input: Partial<TenantPrinterSettings> | undefined, devices: PrinterDeviceRecord[]): TenantPrinterSettings {
  const nonFiscal = devices.filter((device) => device.deviceType !== 'fiscal_pos');
  const firstReceipt = nonFiscal.find((device) => device.deviceType === 'receipt_printer')?.name ?? nonFiscal[0]?.name ?? '';
  const firstKitchen = nonFiscal.find((device) => device.deviceType === 'kitchen_printer')?.name ?? firstReceipt;
  const firstBar = nonFiscal.find((device) => device.deviceType === 'bar_printer')?.name ?? firstReceipt;
  const availableNames = new Set(nonFiscal.map((device) => device.name));

  const ensureExisting = (name: string | undefined, fallback: string) => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return fallback;
    return availableNames.has(trimmed) ? trimmed : fallback;
  };

  const deviceType = input?.deviceType === 'kitchen_printer' || input?.deviceType === 'bar_printer' || input?.deviceType === 'receipt_printer'
    ? input.deviceType
    : 'receipt_printer';

  return {
    defaultPrinter: ensureExisting(input?.defaultPrinter, firstReceipt),
    kitchenPrinter: ensureExisting(input?.kitchenPrinter, firstKitchen),
    barPrinter: ensureExisting(input?.barPrinter, firstBar),
    deviceType,
  };
}

function normalizePartnerIntegrations(partnerIntegrations: PartnerIntegrationRecord[]) {
  return partnerIntegrations
    .filter((integration) => integration.type?.toLocaleLowerCase('tr-TR').includes('yazıcı') || integration.type?.toLocaleLowerCase('tr-TR').includes('pos'))
    .map((integration) => ({
      ...integration,
      status: integration.status === 'Pasif' ? 'Pasif' : 'Aktif',
      autoImport: false,
      lastPullAt: '',
      username: '',
      password: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: '',
      ordersPath: '',
      authType: 'bearer',
      authFlow: 'direct',
      method: 'GET',
      tokenUrl: '',
      apiKeyHeader: 'Authorization',
      apiSecretHeader: '',
      userAgent: '',
      sellerId: '',
      storeId: '',
      chainId: '',
      vendorId: '',
      webhookUrl: '',
      webhookSecret: '',
      notes: '',
    } satisfies PartnerIntegrationRecord));
}

export function getDefaultIntegrationState() {
  return {
    ...DEFAULT_STATE,
    partnerIntegrations: normalizePartnerIntegrations(DEFAULT_STATE.partnerIntegrations),
  };
}

export function normalizePrinterCategoryKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getPrinterCategoryAliases(category: string) {
  const key = normalizePrinterCategoryKey(category);
  const aliases = new Set([key]);

  if (key === 'icecek' || key === 'soguk-icecek' || key.includes('icecek') || key.includes('su')) {
    aliases.add('icecek');
    aliases.add('soguk-icecek');
  }

  if (key === 'kahve' || key.includes('kahve')) aliases.add('kahve');
  if (key === 'tatli' || key.includes('tatli')) aliases.add('tatli');
  if (key === 'alkol' || key.includes('alkol')) aliases.add('alkol');

  if (
    key === 'mutfak'
    || key === 'yemek'
    || key.includes('burger')
    || key.includes('salata')
    || key.includes('et')
    || key.includes('balik')
    || key.includes('tavuk')
  ) {
    aliases.add('mutfak');
    aliases.add('yemek');
    aliases.add('burger');
    aliases.add('salata');
    aliases.add('et');
    aliases.add('balik');
    aliases.add('tavuk');
  }

  return aliases;
}

export function findPrinterMappingForCategory(category: string, mappings: PrinterMappingRecord[]) {
  const aliases = getPrinterCategoryAliases(category);

  return mappings.find((mapping) => aliases.has(normalizePrinterCategoryKey(mapping.category))) ?? null;
}

export function resolvePrinterNameForCategory(
  category: string,
  mappings: PrinterMappingRecord[],
  devices: PrinterDeviceRecord[] = [],
) {
  const mapping = findPrinterMappingForCategory(category, mappings);
  const printerName = mapping?.printer?.trim() || mapping?.fallback?.trim();
  if (!printerName) {
    const fallbackKey = normalizePrinterCategoryKey(category);
    if (fallbackKey.includes('kahve') || fallbackKey.includes('icecek') || fallbackKey.includes('alkol') || fallbackKey.includes('su')) return 'Bar yazıcısı';
    if (fallbackKey.includes('tatli')) return 'Tatlı yazıcısı';
    return 'Mutfak yazıcısı';
  }

  const device = devices.find((printer) => printer.name === printerName);
  if (device?.status === 'Pasif' && mapping?.fallback) return mapping.fallback;

  return printerName;
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function readLocalIntegrationState() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.error('[business-flow] local integration state read failed', error);
    return null;
  }
}

function writeLocalIntegrationState(value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
  } catch (error) {
    console.error('[business-flow] local integration state save failed', error);
  }
}

export function loadIntegrationState() {
  if (typeof window === 'undefined') return getDefaultIntegrationState();

  try {
    const raw = readLocalIntegrationState() ?? readRuntimeItem('tenant', STORAGE_KEY);
    if (!raw) return getDefaultIntegrationState();
    const parsed = JSON.parse(raw) as Partial<IntegrationState>;
    const printerDevices = normalizePrinterDevices(Array.isArray(parsed.printerDevices) ? parsed.printerDevices : DEFAULT_STATE.printerDevices);

    return {
      apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : DEFAULT_STATE.apiKeys,
      apiUsageLogs: Array.isArray(parsed.apiUsageLogs) ? parsed.apiUsageLogs : DEFAULT_STATE.apiUsageLogs,
      webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents : DEFAULT_STATE.webhookEvents,
      partnerIntegrations: normalizePartnerIntegrations(
        Array.isArray(parsed.partnerIntegrations) ? parsed.partnerIntegrations : DEFAULT_STATE.partnerIntegrations,
      ),
      printerDevices,
      printerSettings: normalizePrinterSettings(parsed.printerSettings, printerDevices),
      printerMappings: Array.isArray(parsed.printerMappings) ? parsed.printerMappings : DEFAULT_STATE.printerMappings,
      printLogs: Array.isArray(parsed.printLogs) ? parsed.printLogs : DEFAULT_STATE.printLogs,
    } satisfies IntegrationState;
  } catch (error) {
    console.error('[business-flow] integration state load failed', error);
    return getDefaultIntegrationState();
  }
}

export function saveIntegrationState(state: IntegrationState) {
  if (typeof window === 'undefined') return;
  try {
    const printerDevices = normalizePrinterDevices(state.printerDevices);
    const serialized = JSON.stringify({
      ...state,
      partnerIntegrations: normalizePartnerIntegrations(state.partnerIntegrations),
      printerDevices,
      printerSettings: normalizePrinterSettings(state.printerSettings, printerDevices),
    });

    writeLocalIntegrationState(serialized);
    writeRuntimeItem('tenant', STORAGE_KEY, serialized);
    emitChange();
  } catch (error) {
    console.error('[business-flow] integration state save failed', error);
  }
}

export function subscribeToIntegrationChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_STORAGE_KEY) callback();
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);
  const unsubscribeRuntime = subscribeRuntimeScope('tenant', callback);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
    unsubscribeRuntime();
  };
}
