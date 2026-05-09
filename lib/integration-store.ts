'use client';

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

export type PrinterDeviceRecord = {
  id: string;
  name: string;
  role: string;
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
  printerMappings: PrinterMappingRecord[];
  printLogs: PrintLogRecord[];
};

const STORAGE_KEY = 'adisyon-integrations-state';
const EVENT_NAME = 'adisyon-integrations-state:changed';

const DEFAULT_STATE: IntegrationState = {
  apiKeys: [
    { id: 'api-ys', name: 'Yemeksepeti Senkron', prefix: 'ark_A1B2C3D4', status: 'Aktif', limit: '120/dk', scopes: 'orders:read, products:read' },
    { id: 'api-getir', name: 'Getir Menü Push', prefix: 'ark_E5F6G7H8', status: 'Aktif', limit: '90/dk', scopes: 'products:read' },
    { id: 'api-trendyol', name: 'Trendyol Sipariş Pull', prefix: 'ark_J9K0L1M2', status: 'Pasif', limit: '60/dk', scopes: 'orders:read' },
  ],
  apiUsageLogs: [
    { id: 'log-1', method: 'GET', path: '/api/v2/external/orders', status: 200, actor: 'Yemeksepeti Senkron', time: '120 ms' },
    { id: 'log-2', method: 'GET', path: '/api/v2/external/products', status: 200, actor: 'Getir Menü Push', time: '96 ms' },
    { id: 'log-3', method: 'POST', path: '/api/v1/developer/webhooks/test', status: 201, actor: 'Merkez Admin', time: '141 ms' },
  ],
  webhookEvents: [
    { id: 'wh-1', event: 'order.created', target: 'https://hooks.partner.local/orders', status: 'Kuyruklandı' },
    { id: 'wh-2', event: 'payment.completed', target: 'https://hooks.partner.local/payments', status: 'Kuyruklandı' },
    { id: 'wh-3', event: 'stock.updated', target: 'https://hooks.partner.local/stocks', status: 'Kuyruklandı' },
  ],
  partnerIntegrations: [
    { id: 'int-ys', name: 'Yemeksepeti', type: 'Sipariş pazaryeri', status: 'Hazır adaptör', version: 'v2' },
    { id: 'int-getir', name: 'Getir', type: 'Hızlı teslimat', status: 'Hazır adaptör', version: 'v2' },
    { id: 'int-trendyol', name: 'Trendyol', type: 'Marketplace', status: 'Hazır adaptör', version: 'v2' },
  ],
  printerDevices: [
    { id: 'prt-mutfak-a', name: 'Sıcak Mutfak A', role: 'Mutfak', ip: '192.168.1.210', port: 9100, status: 'Aktif', queue: 3, retry: '15 sn', backup: 'Sıcak Mutfak B', group: 'Mutfak hattı' },
    { id: 'prt-mutfak-b', name: 'Sıcak Mutfak B', role: 'Mutfak Yedek', ip: '192.168.1.211', port: 9100, status: 'Yedek', queue: 1, retry: '15 sn', backup: 'Otomatik devralır', group: 'Mutfak hattı' },
    { id: 'prt-bar', name: 'Bar İstasyonu', role: 'Bar', ip: '192.168.1.212', port: 9100, status: 'Aktif', queue: 2, retry: '20 sn', backup: 'Tatlı İstasyonu', group: 'İçecek hattı' },
    { id: 'prt-kasa', name: 'Kasa POS Yazıcısı', role: 'Kasa', ip: '192.168.1.213', port: 9100, status: 'Aktif', queue: 0, retry: '10 sn', backup: 'Ön Kasa Yedek', group: 'Kasa hattı' },
  ],
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
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
    };
  });
}

function getPartnerIntegrationDefaults(id: string): Partial<PartnerIntegrationRecord> {
  switch (id) {
    case 'int-trendyol':
      return {
        authFlow: 'direct',
        authType: 'basic',
        method: 'GET',
        baseUrl: 'https://apigw.trendyol.com',
        ordersPath: '/integration/order/sellers/{sellerId}/orders',
        apiKeyHeader: 'Authorization',
        apiSecretHeader: '',
        userAgent: '{sellerId} - SelfIntegration',
        notes: 'Trendyol için API Key, API Secret, sellerId ve zorunlu User-Agent kullanılır.',
      };
    case 'int-getir':
      return {
        authFlow: 'direct',
        authType: 'bearer',
        method: 'GET',
        baseUrl: '',
        ordersPath: '',
        apiKeyHeader: 'Authorization',
        apiSecretHeader: '',
        notes: 'Getir tarafında resmi açık sipariş dokümanı doğrulanamadı. Partner panelinden verilen endpoint ve token bilgilerini kullanın.',
      };
    case 'int-ys':
      return {
        authFlow: 'oauthClientCredentials',
        authType: 'bearer',
        method: 'GET',
        baseUrl: 'https://yemeksepeti.partner.deliveryhero.io',
        ordersPath: '/v2/chains/{chainId}/vendors/{vendorId}/orders',
        tokenUrl: 'https://yemeksepeti.partner.deliveryhero.io/v2/oauth/token',
        apiKeyHeader: 'Authorization',
        apiSecretHeader: '',
        notes: 'Yemeksepeti için client_id, client_secret, chain_id, vendor_id ve opsiyonel webhook bilgisi gerekir.',
      };
    default:
      return {
        authFlow: 'direct',
        authType: 'bearer',
        method: 'GET',
        baseUrl: '',
        ordersPath: '',
        apiKeyHeader: 'Authorization',
        apiSecretHeader: '',
      };
  }
}

function normalizePartnerIntegrations(partnerIntegrations: PartnerIntegrationRecord[]) {
  return partnerIntegrations.map((integration) => {
    const defaults = getPartnerIntegrationDefaults(integration.id);
    return {
      ...defaults,
      ...integration,
      status: integration.status === 'Pasif' ? 'Pasif' : 'Aktif',
      autoImport: integration.autoImport ?? true,
      lastPullAt: integration.lastPullAt ?? '',
      username: integration.username ?? '',
      password: integration.password ?? '',
      apiKey: integration.apiKey ?? '',
      apiSecret: integration.apiSecret ?? '',
      baseUrl: integration.baseUrl ?? defaults.baseUrl ?? '',
      ordersPath: integration.ordersPath ?? defaults.ordersPath ?? '',
      authType: integration.authType ?? defaults.authType ?? 'bearer',
      authFlow: integration.authFlow ?? defaults.authFlow ?? 'direct',
      method: integration.method ?? defaults.method ?? 'GET',
      tokenUrl: integration.tokenUrl ?? defaults.tokenUrl ?? '',
      apiKeyHeader: integration.apiKeyHeader ?? defaults.apiKeyHeader ?? 'Authorization',
      apiSecretHeader: integration.apiSecretHeader ?? defaults.apiSecretHeader ?? '',
      userAgent: integration.userAgent ?? defaults.userAgent ?? '',
      sellerId: integration.sellerId ?? '',
      storeId: integration.storeId ?? '',
      chainId: integration.chainId ?? '',
      vendorId: integration.vendorId ?? '',
      webhookUrl: integration.webhookUrl ?? '',
      webhookSecret: integration.webhookSecret ?? '',
      notes: integration.notes ?? defaults.notes ?? '',
    } satisfies PartnerIntegrationRecord;
  });
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

export function loadIntegrationState() {
  if (typeof window === 'undefined') return getDefaultIntegrationState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultIntegrationState();
    const parsed = JSON.parse(raw) as Partial<IntegrationState>;
    return {
      apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : DEFAULT_STATE.apiKeys,
      apiUsageLogs: Array.isArray(parsed.apiUsageLogs) ? parsed.apiUsageLogs : DEFAULT_STATE.apiUsageLogs,
      webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents : DEFAULT_STATE.webhookEvents,
      partnerIntegrations: normalizePartnerIntegrations(
        Array.isArray(parsed.partnerIntegrations) ? parsed.partnerIntegrations : DEFAULT_STATE.partnerIntegrations,
      ),
      printerDevices: normalizePrinterDevices(Array.isArray(parsed.printerDevices) ? parsed.printerDevices : DEFAULT_STATE.printerDevices),
      printerMappings: Array.isArray(parsed.printerMappings) ? parsed.printerMappings : DEFAULT_STATE.printerMappings,
      printLogs: Array.isArray(parsed.printLogs) ? parsed.printLogs : DEFAULT_STATE.printLogs,
    } satisfies IntegrationState;
  } catch {
    return getDefaultIntegrationState();
  }
}

export function saveIntegrationState(state: IntegrationState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      partnerIntegrations: normalizePartnerIntegrations(state.partnerIntegrations),
      printerDevices: normalizePrinterDevices(state.printerDevices),
    }));
    emitChange();
  } catch {
    // ignore
  }
}

export function subscribeToIntegrationChanges(callback: () => void) {
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
