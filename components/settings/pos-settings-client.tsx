'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, FileText, Loader2, Network, RefreshCw, Receipt, Save, Settings2, Shuffle, TerminalSquare, Wifi } from 'lucide-react';
import { DEFAULT_SALE_PRODUCT_BASE, loadStoredSaleProducts, subscribeToStoredSaleProductsChanges } from '@/lib/sale-product-catalog';
import { AppShell } from '@/components/app-shell';

type PosTab = 'device' | 'mapping' | 'test' | 'logs';
type DeviceType = 'ESC_POS' | 'SDK_DLL' | 'ANDROID_API' | 'JSON_HTTP';
type ConnectionType = 'network' | 'usb' | 'serial' | 'android';
type MappingUnit = 'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'dozen';

type PosDevice = {
  id: string;
  name: string;
  device_type: DeviceType;
  protocol: string;
  ip_address?: string | null;
  port?: number | null;
  com_port?: string | null;
  baud_rate?: string | null;
  device_path?: string | null;
  android_ip?: string | null;
  timeout_seconds?: number | null;
  status?: string | null;
  last_status?: string | null;
  last_heartbeat?: string | null;
  metadata?: Record<string, unknown> | null;
  is_active?: boolean;
  auto_retry?: boolean;
  queued_orders_count?: number;
  transaction_logs_count?: number;
};

type PosLog = {
  id: string;
  type: string;
  status: string;
  error_details?: string | null;
  response_time_ms?: number | null;
  logged_at?: string | null;
  pos_device_id?: string;
  pos_device?: { name?: string | null } | null;
  request_data?: string | null;
  response_data?: string | null;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number | string | null;
  vat_rate?: number | string | null;
  is_active?: boolean;
};

type ProductMapping = {
  id: string;
  product_id: string;
  pos_plu_code: string;
  pos_name?: string | null;
  pos_price?: number | string | null;
  vat_rate: number | string;
  unit_type: MappingUnit;
  mapping_status?: string | null;
  verified_at?: string | null;
};

type Coverage = {
  total_products: number;
  mapped_products: number;
  unmapped_products: number;
  coverage_percentage: number;
};

type QueueStats = {
  total?: number;
  pending?: number;
  processing?: number;
  sent?: number;
  failed?: number;
  completed?: number;
};

type OverviewPayload = {
  backendAvailable: boolean;
  backendErrors: string[];
  devices: PosDevice[];
  queue: QueueStats | null;
  agentsOnline: number;
  logs: PosLog[];
  products: Product[];
  mappings: ProductMapping[];
  coverage: Coverage | null;
};

type MappingDraft = {
  product_id: string;
  pos_plu_code: string;
  pos_name: string;
  pos_price: number;
  vat_rate: number;
  unit_type: MappingUnit;
};

type DeviceFormState = {
  id?: string;
  name: string;
  brand: string;
  deviceType: DeviceType;
  connectionType: ConnectionType;
  ipAddress: string;
  port: string;
  comPort: string;
  baudRate: string;
  devicePath: string;
  timeoutSeconds: string;
  autoRetry: boolean;
  isActive: boolean;
  notes: string;
};

type RequestState = {
  type: 'success' | 'error';
  text: string;
};

const tabs: Array<{ id: PosTab; label: string; icon: typeof Settings2 }> = [
  { id: 'device', label: 'Device Settings', icon: Settings2 },
  { id: 'mapping', label: 'Product Mapping', icon: Shuffle },
  { id: 'test', label: 'Test & Connection', icon: Wifi },
  { id: 'logs', label: 'Logs', icon: FileText },
];

const brandOptions = [
  { value: 'ingenico', label: 'Ingenico', deviceType: 'SDK_DLL' as DeviceType },
  { value: 'verifone', label: 'Verifone', deviceType: 'JSON_HTTP' as DeviceType },
  { value: 'pax', label: 'PAX', deviceType: 'ANDROID_API' as DeviceType },
];

const unitOptions: MappingUnit[] = ['piece', 'kg', 'liter', 'meter', 'box', 'dozen'];

function createEmptyDeviceForm(): DeviceFormState {
  return {
    name: '',
    brand: 'ingenico',
    deviceType: 'SDK_DLL',
    connectionType: 'network',
    ipAddress: '',
    port: '3001',
    comPort: 'COM1',
    baudRate: '9600',
    devicePath: '',
    timeoutSeconds: '15',
    autoRetry: true,
    isActive: true,
    notes: '',
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR');
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function parseLogPayload(payload?: string | null): Record<string, unknown> | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractLogProduct(log: PosLog): string {
  const requestPayload = parseLogPayload(log.request_data);
  const items = requestPayload?.items;

  if (Array.isArray(items) && items.length > 0) {
    const firstItem = items[0] as Record<string, unknown>;
    if (typeof firstItem.product_name === 'string' && firstItem.product_name.trim()) {
      return firstItem.product_name;
    }
  }

  if (typeof requestPayload?.device_name === 'string' && requestPayload.device_name.trim()) {
    return requestPayload.device_name;
  }

  return log.pos_device?.name || 'Unknown Product';
}

function displayLogStatus(status?: string | null) {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'success') return 'OK';
  if (normalized === 'failure') return 'ERROR';
  if (normalized === 'timeout') return 'TIMEOUT';
  return status || 'ERROR';
}

function getDeviceLastTransaction(logs: PosLog[], deviceId: string) {
  const byDevice = logs
    .filter((log) => log.pos_device_id === deviceId)
    .sort((a, b) => new Date(b.logged_at ?? 0).getTime() - new Date(a.logged_at ?? 0).getTime());

  return byDevice[0] ?? null;
}

function getDeviceLastError(logs: PosLog[], deviceId: string) {
  const byDevice = logs
    .filter((log) => log.pos_device_id === deviceId && (log.status ?? '').toLowerCase() !== 'success')
    .sort((a, b) => new Date(b.logged_at ?? 0).getTime() - new Date(a.logged_at ?? 0).getTime());

  return byDevice[0] ?? null;
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function suggestPlu(product: Product, index: number) {
  const barcode = (product.barcode ?? '').trim();
  if (barcode) return barcode.slice(0, 32);

  const sku = (product.sku ?? '').trim();
  if (sku) return sku.slice(0, 32);

  return `PLU-${normalizeText(product.name).slice(0, 20).toUpperCase() || index + 1}`;
}

function createMappingDraft(product: Product, mapping?: ProductMapping): MappingDraft {
  return {
    product_id: product.id,
    pos_plu_code: mapping?.pos_plu_code ?? '',
    pos_name: mapping?.pos_name ?? product.name,
    pos_price: Number(mapping?.pos_price ?? product.price ?? 0),
    vat_rate: Number(mapping?.vat_rate ?? product.vat_rate ?? 0),
    unit_type: mapping?.unit_type ?? 'piece',
  };
}

function buildDevicePayload(form: DeviceFormState) {
  return {
    name: form.name.trim(),
    device_type: form.deviceType,
    protocol: form.connectionType === 'network'
      ? 'TCP'
      : form.connectionType === 'usb'
        ? 'USB'
        : form.connectionType === 'serial'
          ? 'COM_PORT'
          : 'ANDROID',
    ip_address: form.ipAddress.trim() || null,
    port: Number(form.port) || 3001,
    com_port: form.connectionType === 'serial' ? form.comPort.trim() || null : null,
    baud_rate: form.connectionType === 'serial' ? form.baudRate.trim() || null : null,
    device_path: form.connectionType === 'usb' ? form.devicePath.trim() || null : null,
    android_ip: form.connectionType === 'android' ? form.ipAddress.trim() || null : null,
    timeout_seconds: Number(form.timeoutSeconds) || 15,
    auto_retry: form.autoRetry,
    is_active: form.isActive,
    metadata: {
      brand: form.brand,
      connection_type: form.connectionType,
      notes: form.notes.trim() || null,
    },
  };
}

function inferConnectionType(device: PosDevice): ConnectionType {
  const metadataConnection = typeof device.metadata?.connection_type === 'string' ? device.metadata.connection_type : '';
  if (metadataConnection === 'usb' || metadataConnection === 'serial' || metadataConnection === 'android' || metadataConnection === 'network') {
    return metadataConnection;
  }

  const protocol = (device.protocol ?? '').toUpperCase();
  if (protocol.includes('COM')) return 'serial';
  if (protocol.includes('USB')) return 'usb';
  if (protocol.includes('ANDROID')) return 'android';
  return 'network';
}

function toDeviceForm(device: PosDevice): DeviceFormState {
  const brand = typeof device.metadata?.brand === 'string' ? device.metadata.brand : 'other';
  const notes = typeof device.metadata?.notes === 'string' ? device.metadata.notes : '';
  return {
    id: device.id,
    name: device.name,
    brand,
    deviceType: device.device_type,
    connectionType: inferConnectionType(device),
    ipAddress: device.ip_address ?? device.android_ip ?? '',
    port: String(device.port ?? 3001),
    comPort: device.com_port ?? 'COM1',
    baudRate: device.baud_rate ?? '9600',
    devicePath: device.device_path ?? '',
    timeoutSeconds: String(device.timeout_seconds ?? 15),
    autoRetry: Boolean(device.auto_retry),
    isActive: Boolean(device.is_active ?? true),
    notes,
  };
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

export function PosSettingsClient() {
  const [activeTab, setActiveTab] = useState<PosTab>('device');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [notice, setNotice] = useState<RequestState | null>(null);
  const [data, setData] = useState<OverviewPayload>({
    backendAvailable: false,
    backendErrors: [],
    devices: [],
    queue: null,
    agentsOnline: 0,
    logs: [],
    products: [],
    mappings: [],
    coverage: null,
  });
  const [deviceForm, setDeviceForm] = useState<DeviceFormState>(() => createEmptyDeviceForm());
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [editedMappings, setEditedMappings] = useState<Record<string, MappingDraft>>({});
  const [mappingFilter, setMappingFilter] = useState<'all' | 'unmapped' | 'dirty'>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failure' | 'timeout'>('all');
  const [localProducts, setLocalProducts] = useState<Product[]>([]);

  const loadOverview = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/settings/pos/overview', { cache: 'no-store' });
      const payload = await response.json() as OverviewPayload;
      setData(payload);
      setNotice(payload.backendErrors.length > 0
        ? { type: 'error', text: payload.backendErrors[0] }
        : null);
    } catch {
      setNotice({ type: 'error', text: 'POS ayarları yüklenemedi.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedDeviceId && data.devices[0]) {
      setSelectedDeviceId(data.devices[0].id);
      setDeviceForm(toDeviceForm(data.devices[0]));
    }
  }, [data.devices, selectedDeviceId]);

  useEffect(() => {
    const syncLocalProducts = () => {
      const stored = loadStoredSaleProducts();
      const source = stored && stored.length > 0
        ? stored.map((product) => ({
            id: product.id,
            name: product.name,
            price: Number(product.salePrice || 0),
            vat_rate: Number(product.vatRate || 0),
            is_active: true,
          }))
        : DEFAULT_SALE_PRODUCT_BASE.map((product) => ({
            id: product.id,
            name: product.name,
            price: Number(product.salePrice || 0),
            vat_rate: Number(product.vatRate || 0),
            is_active: true,
          }));

      setLocalProducts(source);
    };

    syncLocalProducts();
    const unsubscribe = subscribeToStoredSaleProductsChanges(syncLocalProducts);

    return () => {
      unsubscribe();
    };
  }, []);

  const effectiveProducts = useMemo(() => {
    const merged = new Map<string, Product>();

    data.products.forEach((product) => {
      const key = normalizeText(product.name || product.id);
      merged.set(key, product);
    });

    localProducts.forEach((product) => {
      const key = normalizeText(product.name || product.id);
      if (!merged.has(key)) {
        merged.set(key, product);
      }
    });

    return Array.from(merged.values());
  }, [data.products, localProducts]);

  const mappingIndex = useMemo(() => new Map(data.mappings.map((mapping) => [mapping.product_id, mapping])), [data.mappings]);

  const productRows = useMemo(() => effectiveProducts.map((product) => {
    const mapping = mappingIndex.get(product.id);
    const draft = editedMappings[product.id];
    return {
      product,
      mapping,
      draft: draft ?? createMappingDraft(product, mapping),
      dirty: Boolean(draft),
      mapped: Boolean(mapping?.pos_plu_code || draft?.pos_plu_code),
    };
  }), [effectiveProducts, editedMappings, mappingIndex]);

  const filteredProductRows = useMemo(() => productRows.filter((row) => {
    if (mappingFilter === 'unmapped') return !row.mapped;
    if (mappingFilter === 'dirty') return row.dirty;
    return true;
  }), [mappingFilter, productRows]);

  const filteredLogs = useMemo(() => data.logs.filter((log) => {
    if (logStatusFilter === 'all') return true;
    return (log.status ?? '').toLowerCase() === logStatusFilter;
  }), [data.logs, logStatusFilter]);

  const selectedDevice = useMemo(
    () => data.devices.find((device) => device.id === selectedDeviceId) ?? null,
    [data.devices, selectedDeviceId],
  );

  const mappedCount = productRows.filter((row) => row.mapped).length;
  const totalProductCount = productRows.length;
  const missingMappings = Math.max(totalProductCount - mappedCount, 0);
  const coveragePercentage = totalProductCount > 0 ? Math.round((mappedCount / totalProductCount) * 100) : 0;
  const dirtyCount = Object.keys(editedMappings).length;

  function setMappingField(product: Product, key: keyof MappingDraft, value: string) {
    const current = editedMappings[product.id] ?? createMappingDraft(product, mappingIndex.get(product.id));
    setEditedMappings((existing) => ({
      ...existing,
      [product.id]: {
        ...current,
        [key]: key === 'pos_price' || key === 'vat_rate' ? Number(value) : value,
      },
    }));
  }

  async function saveDevice() {
    const payload = buildDevicePayload(deviceForm);

    if (!payload.name) {
      setNotice({ type: 'error', text: 'Cihaz adı zorunlu.' });
      return;
    }

    setSavingDevice(true);
    try {
      const response = await fetch('/api/pos/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceForm.id ? { id: deviceForm.id, ...payload } : payload),
      });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Cihaz kaydedilemedi.');
      }

      setNotice({ type: 'success', text: deviceForm.id ? 'POS cihazı güncellendi.' : 'POS cihazı oluşturuldu.' });
      setDeviceForm(createEmptyDeviceForm());
      setSelectedDeviceId('');
      await loadOverview(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Cihaz kaydedilemedi.' });
    } finally {
      setSavingDevice(false);
    }
  }

  async function saveBulkMappings() {
    const mappings = Object.values(editedMappings).filter((item) => item.pos_plu_code.trim());

    if (mappings.length === 0) {
      setNotice({ type: 'error', text: 'Kaydedilecek toplu eşleştirme bulunamadı.' });
      return;
    }

    setSavingMappings(true);
    try {
      const response = await fetch('/api/pos/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Toplu eşleştirme kaydedilemedi.');
      }

      setEditedMappings({});
      setNotice({ type: 'success', text: `${mappings.length} ürün POS eşleştirmesi kaydedildi.` });
      await loadOverview(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Toplu eşleştirme kaydedilemedi.' });
    } finally {
      setSavingMappings(false);
    }
  }

  function autoMatch() {
    let generated = 0;
    const nextDrafts: Record<string, MappingDraft> = { ...editedMappings };

    effectiveProducts.forEach((product, index) => {
      const existingMapping = mappingIndex.get(product.id);
      const existingDraft = nextDrafts[product.id];
      if (existingMapping?.pos_plu_code || existingDraft?.pos_plu_code) {
        return;
      }

      nextDrafts[product.id] = {
        ...createMappingDraft(product, existingMapping),
        pos_plu_code: suggestPlu(product, index),
      };
      generated += 1;
    });

    setEditedMappings(nextDrafts);
    setNotice({
      type: generated > 0 ? 'success' : 'error',
      text: generated > 0 ? `${generated} ürün için otomatik PLU önerisi hazırlandı.` : 'Otomatik eşleşecek boş ürün bulunamadı.',
    });
  }

  async function runConnectionTest() {
    if (!selectedDevice) {
      setNotice({ type: 'error', text: 'Önce test edilecek POS cihazını seçin.' });
      return;
    }

    setTestingConnection(true);
    try {
      const response = await fetch('/api/pos/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: selectedDevice.id, action: 'connection' }),
      });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Bağlantı testi başarısız oldu.');
      }

      setNotice({
        type: body?.connected ? 'success' : 'error',
        text: body?.connected ? `${selectedDevice.name} bağlantısı başarılı.` : (typeof body?.error === 'string' ? body.error : 'Cihaz çevrimdışı.'),
      });
      await loadOverview(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Bağlantı testi başarısız oldu.' });
    } finally {
      setTestingConnection(false);
    }
  }

  async function printTestReceipt() {
    if (!selectedDevice) {
      setNotice({ type: 'error', text: 'Önce test fişi gönderilecek POS cihazını seçin.' });
      return;
    }

    setPrintingTest(true);
    try {
      const sampleReceipt = [
        'Adisyum Test Fişi',
        'Masa: TEST-01',
        `Tarih/Saat: ${new Date().toLocaleString('tr-TR')}`,
        '------------------------------',
        '1 x Test Ürün',
        '2 x Örnek İçecek',
        '------------------------------',
      ].join('\n');

      const response = await fetch('http://127.0.0.1:3001/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerName: selectedDevice.name,
          text: sampleReceipt,
        }),
      });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Test fişi gönderilemedi. Local agent çalışmıyor olabilir.');
      }

      setNotice({
        type: 'success',
        text: `${selectedDevice.name} için test fişi gönderildi.`,
      });
      await loadOverview(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Test fişi gönderilemedi.' });
    } finally {
      setPrintingTest(false);
    }
  }

  async function retryQueue() {
    setRetryingQueue(true);
    try {
      const response = await fetch('/api/settings/pos/retry', { method: 'POST' });
      const body = await readJson(response);

      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : 'Kuyruk yeniden denenemedi.');
      }

      const succeeded = typeof body?.succeeded === 'number' ? body.succeeded : 0;
      const failed = typeof body?.failed === 'number' ? body.failed : 0;
      setNotice({ type: succeeded > 0 && failed === 0 ? 'success' : 'error', text: `Tekrar deneme tamamlandı. Başarılı: ${succeeded}, başarısız: ${failed}.` });
      await loadOverview(true);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Kuyruk yeniden denenemedi.' });
    } finally {
      setRetryingQueue(false);
    }
  }

  const queue = data.queue ?? {};

  return (
    <AppShell
      title="Fiscal POS Integration"
      subtitle="Professional POS integration settings panel with device setup, product mapping, connection test, and logs."
      backHref="/settings?tab=integrations"
      backLabel="Ayarlar entegrasyonlarına dön"
      actions={
        <button
          type="button"
          onClick={() => void loadOverview(true)}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      }
    >
      <div className="space-y-5">
        {notice ? (
          <div className={`flex items-start gap-3 rounded-[1.25rem] border px-4 py-3 shadow-soft ${notice.type === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700' : 'border-rose-500/25 bg-rose-500/10 text-rose-700'}`}>
            {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <AlertTriangle className="mt-0.5 h-5 w-5" />}
            <p className="text-sm font-semibold">{notice.text}</p>
          </div>
        ) : null}

        {missingMappings > 0 ? (
          <div className="rounded-[1.5rem] border border-amber-400/30 bg-amber-500/10 p-5 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Zorunlu eşleştirme uyarısı</p>
                <h2 className="mt-2 text-xl font-semibold text-amber-900">{missingMappings} ürün henüz POS tarafına eşlenmedi</h2>
                <p className="mt-1 text-sm text-amber-800">Eksik eşleştirme varken siparişlerin POS'a gönderimi engellenir. Tüm aktif ürünler için PLU kodu girin.</p>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-white/60 px-4 py-3 text-sm font-semibold text-amber-900">
                Kapsama oranı %{coveragePercentage}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-emerald-500/25 bg-emerald-500/10 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <p className="text-sm font-semibold text-emerald-800">Tüm aktif ürünlerde POS eşleştirmesi tamam. Sipariş gönderimi hazır.</p>
            </div>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="POS cihazı" value={String(data.devices.length)} helper="Tanımlı yazarkasa / agent" icon={Cpu} />
          <SummaryCard label="Çevrimiçi ajan" value={String(data.agentsOnline)} helper="Son heartbeat alan" icon={Network} />
          <SummaryCard label="Eşleştirme kapsamı" value={`%${coveragePercentage}`} helper={`${mappedCount}/${totalProductCount} ürün`} icon={Shuffle} />
          <SummaryCard label="Başarısız log" value={String(data.logs.filter((log) => (log.status ?? '').toLowerCase() === 'failure').length)} helper="Son 100 işlem" icon={TerminalSquare} />
        </section>

        <section className="rounded-[1.5rem] border border-line bg-panel p-2 shadow-soft">
          <div className="grid gap-2 md:grid-cols-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 rounded-[1.15rem] px-4 py-3 text-left transition ${active ? 'bg-accent text-white shadow-soft' : 'text-ink hover:bg-canvas'}`}
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-white/15' : 'bg-accentSoft text-accent'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[1.5rem] border border-line bg-panel">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : null}

        {!loading && activeTab === 'device' ? (
          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Fiscal device setup</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">Device Settings</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeviceId('');
                    setDeviceForm(createEmptyDeviceForm());
                  }}
                  className="rounded-2xl border border-line bg-canvas px-4 py-2 text-sm font-semibold text-ink"
                >
                  Yeni cihaz
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Cihaz adı" value={deviceForm.name} onChange={(value) => setDeviceForm((current) => ({ ...current, name: value }))} placeholder="Örn: Ön Kasa POS" />
                <label className="space-y-2 text-sm text-muted">
                  <span>POS brand</span>
                  <select
                    value={deviceForm.brand}
                    onChange={(event) => {
                      const option = brandOptions.find((item) => item.value === event.target.value);
                      setDeviceForm((current) => ({
                        ...current,
                        brand: event.target.value,
                        deviceType: option?.deviceType ?? current.deviceType,
                      }));
                    }}
                    className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  >
                    {brandOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-muted">
                  <span>Connection type</span>
                  <select value={deviceForm.connectionType} onChange={(event) => setDeviceForm((current) => ({ ...current, connectionType: event.target.value as ConnectionType }))} className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                    <option value="network">TCP / Network</option>
                    <option value="usb">USB</option>
                    <option value="serial">Serial</option>
                    <option value="android">Android Agent</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-muted">
                  <span>Device type</span>
                  <select value={deviceForm.deviceType} onChange={(event) => setDeviceForm((current) => ({ ...current, deviceType: event.target.value as DeviceType }))} className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                    <option value="ESC_POS">ESC/POS</option>
                    <option value="SDK_DLL">SDK / DLL</option>
                    <option value="ANDROID_API">Android API</option>
                    <option value="JSON_HTTP">JSON HTTP</option>
                  </select>
                </label>
                <Field label="IP address" value={deviceForm.ipAddress} onChange={(value) => setDeviceForm((current) => ({ ...current, ipAddress: value }))} placeholder="192.168.1.50" />
                <Field label="Port" value={deviceForm.port} onChange={(value) => setDeviceForm((current) => ({ ...current, port: value.replace(/[^0-9]/g, '') }))} placeholder="3001" />
                {deviceForm.connectionType === 'serial' ? (
                  <>
                    <Field label="COM port" value={deviceForm.comPort} onChange={(value) => setDeviceForm((current) => ({ ...current, comPort: value }))} placeholder="COM3" />
                    <Field label="Baud rate" value={deviceForm.baudRate} onChange={(value) => setDeviceForm((current) => ({ ...current, baudRate: value }))} placeholder="9600" />
                  </>
                ) : null}
                {deviceForm.connectionType === 'usb' ? (
                  <Field label="Device path / kuyruk adı" value={deviceForm.devicePath} onChange={(value) => setDeviceForm((current) => ({ ...current, devicePath: value }))} placeholder="Windows queue veya DLL yolu" />
                ) : null}
                <Field label="Agent status" value={selectedDevice ? ((selectedDevice.status ?? '').toLowerCase() === 'connected' ? 'Active' : 'Inactive') : 'Active'} onChange={() => undefined} placeholder="Active" />
                <Field label="Timeout (sec)" value={deviceForm.timeoutSeconds} onChange={(value) => setDeviceForm((current) => ({ ...current, timeoutSeconds: value.replace(/[^0-9]/g, '') }))} placeholder="15" />
                <label className="space-y-2 text-sm text-muted md:col-span-2">
                  <span>Operasyon notu</span>
                  <textarea value={deviceForm.notes} onChange={(event) => setDeviceForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-[92px] w-full rounded-2xl border border-line bg-canvas px-4 py-3 font-semibold text-ink outline-none" placeholder="Şube, yazar kasa no veya saha notu" />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Toggle label="Aktif cihaz" checked={deviceForm.isActive} onChange={(checked) => setDeviceForm((current) => ({ ...current, isActive: checked }))} />
                <Toggle label="Oto retry" checked={deviceForm.autoRetry} onChange={(checked) => setDeviceForm((current) => ({ ...current, autoRetry: checked }))} />
              </div>

              <button type="button" onClick={() => void saveDevice()} disabled={savingDevice} className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
                {savingDevice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
              </button>
            </article>

            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Connected fiscal devices</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">Agent status</h2>
                </div>
                <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{data.devices.length} cihaz</span>
              </div>
              <div className="mt-5 space-y-3">
                {data.devices.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-line bg-canvas p-6 text-sm font-semibold text-muted">Henüz POS cihazı tanımlanmadı.</div>
                ) : data.devices.map((device) => {
                  const online = (device.status ?? '').toLowerCase() === 'connected';
                  const lastTransaction = getDeviceLastTransaction(data.logs, device.id);
                  const lastError = getDeviceLastError(data.logs, device.id);
                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeviceId(device.id);
                        setDeviceForm(toDeviceForm(device));
                      }}
                      className={`w-full rounded-3xl border px-4 py-4 text-left transition ${selectedDeviceId === device.id ? 'border-accent bg-accent/5' : 'border-line bg-canvas hover:border-accent/30'}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-ink">{device.name}</p>
                          <p className="mt-1 text-sm text-muted">{String(device.metadata?.brand ?? 'other').toUpperCase()} · {inferConnectionType(device).toUpperCase()} · {device.ip_address || device.android_ip || 'Yerel agent'}:{device.port ?? 3001}</p>
                          <p className="mt-2 text-xs text-muted">Son heartbeat: {formatDateTime(device.last_heartbeat)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>{online ? 'Active' : 'Inactive'}</span>
                          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-ink">Kuyruk {device.queued_orders_count ?? 0}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <p className="text-xs text-muted">Last transaction: {lastTransaction ? `${formatDateTime(lastTransaction.logged_at)} · ${displayLogStatus(lastTransaction.status)}` : '—'}</p>
                        <p className="text-xs text-muted">Last error: {lastError?.error_details || device.last_status || '—'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
        ) : null}

        {!loading && activeTab === 'mapping' ? (
          <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Product Mapping</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Map products to fiscal PLU codes</h2>
                <p className="mt-1 text-sm text-muted">Every product must have a PLU code. Missing rows are highlighted for operations.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={autoMatch} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold text-ink"><Shuffle className="h-4 w-4" /> Auto Match</button>
                <button type="button" onClick={() => void saveBulkMappings()} disabled={savingMappings} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">{savingMappings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Toplu kaydet</button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {(['all', 'unmapped', 'dirty'] as const).map((filter) => (
                <button key={filter} type="button" onClick={() => setMappingFilter(filter)} className={`rounded-full px-4 py-2 text-sm font-semibold ${mappingFilter === filter ? 'bg-accent text-white' : 'border border-line bg-canvas text-ink'}`}>
                  {filter === 'all' ? `Tümü (${productRows.length})` : filter === 'unmapped' ? `Eksik (${missingMappings})` : `Taslak (${dirtyCount})`}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {filteredProductRows.map(({ product, mapping, draft, mapped, dirty }) => (
                <div key={product.id} className={`rounded-3xl border p-4 shadow-soft ${mapped ? 'border-line bg-canvas' : 'border-amber-400/35 bg-amber-500/10'}`}>
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr_0.7fr] lg:items-center">
                    <div>
                      <p className="text-base font-semibold text-ink">{product.name}</p>
                      <p className="mt-1 text-sm text-muted">{product.name} → fiscal mapping</p>
                      {!mapped ? <p className="mt-2 text-xs font-semibold text-amber-800">Warning: mapping missing</p> : null}
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">PLU Code</label>
                      <input value={draft.pos_plu_code} onChange={(event) => setMappingField(product, 'pos_plu_code', event.target.value)} className="h-12 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none" placeholder="Adana Kebap → PLU input" />
                    </div>
                    <div className="flex items-center gap-2 lg:justify-end">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${mapped ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>{mapped ? 'Mapped' : 'Missing'}</span>
                      <span className="text-xs text-muted">{dirty ? 'Unsaved' : mapping?.verified_at ? 'Verified' : 'Pending'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === 'test' ? (
          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Connection actions</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Test & Connection</h2>
              </div>

              <label className="mt-5 block space-y-2 text-sm text-muted">
                <span>Test cihazı</span>
                <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                  <option value="">Cihaz seçin</option>
                  {data.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                </select>
              </label>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void runConnectionTest()} disabled={testingConnection || !selectedDevice} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">{testingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Test Connection</button>
                <button type="button" onClick={() => void printTestReceipt()} disabled={printingTest || !selectedDevice} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60">{printingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Print Test Receipt</button>
                <button type="button" onClick={() => void retryQueue()} disabled={retryingQueue} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60 sm:col-span-2">{retryingQueue ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Başarısız işlemleri yeniden dene</button>
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Operasyon özeti</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Canlı durum</h2>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MiniStat label="Bekleyen" value={String(queue.pending ?? 0)} />
                <MiniStat label="İşlenen" value={String(queue.processing ?? 0)} />
                <MiniStat label="Başarısız" value={String(queue.failed ?? 0)} />
                <MiniStat label="Tamamlanan" value={String(queue.completed ?? 0)} />
                <MiniStat label="Gönderilen" value={String(queue.sent ?? 0)} />
                <MiniStat label="Toplam" value={String(queue.total ?? 0)} />
              </div>

              {selectedDevice ? (
                <div className="mt-5 rounded-3xl border border-line bg-canvas p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{selectedDevice.name}</p>
                      <p className="mt-1 text-sm text-muted">{selectedDevice.ip_address || selectedDevice.android_ip || 'Yerel agent'}:{selectedDevice.port ?? 3001}</p>
                    </div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${(selectedDevice.status ?? '').toLowerCase() === 'connected' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>{(selectedDevice.status ?? 'disconnected').toUpperCase()}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <InfoRow label="Son heartbeat" value={formatDateTime(selectedDevice.last_heartbeat)} />
                    <InfoRow label="Son durum" value={selectedDevice.last_status || '—'} />
                    <InfoRow label="Device type" value={selectedDevice.device_type} />
                    <InfoRow label="Protocol" value={selectedDevice.protocol} />
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-line bg-canvas p-6 text-sm font-semibold text-muted">Durum görmek için bir cihaz seçin.</div>
              )}
            </article>
          </section>
        ) : null}

        {!loading && activeTab === 'logs' ? (
          <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Operation history</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Logs</h2>
                <p className="mt-1 text-sm text-muted">Review success and error operations with time and product context.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'success', 'failure', 'timeout'] as const).map((status) => (
                  <button key={status} type="button" onClick={() => setLogStatusFilter(status)} className={`rounded-full px-4 py-2 text-sm font-semibold ${logStatusFilter === status ? 'bg-accent text-white' : 'border border-line bg-canvas text-ink'}`}>
                    {status === 'all' ? 'Tümü' : status}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredLogs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-line bg-canvas p-6 text-sm font-semibold text-muted">Seçili filtre için log bulunamadı.</div>
              ) : filteredLogs.map((log) => (
                <div key={log.id} className="rounded-3xl border border-line bg-canvas p-4 shadow-soft">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{formatTime(log.logged_at)} → {extractLogProduct(log)} → {displayLogStatus(log.status)}</p>
                      <p className="mt-1 text-xs text-muted">{log.type} · {log.pos_device?.name || 'POS Device'} · {log.response_time_ms ?? 0} ms</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${(log.status ?? '').toLowerCase() === 'success' ? 'bg-emerald-500/10 text-emerald-700' : (log.status ?? '').toLowerCase() === 'timeout' ? 'bg-amber-500/10 text-amber-700' : 'bg-rose-500/10 text-rose-700'}`}>{displayLogStatus(log.status)}</span>
                      {log.error_details ? <span className="text-xs font-semibold text-rose-700">{log.error_details}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Cpu }) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-panel p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
          <p className="mt-1 text-sm text-muted">{helper}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accentSoft text-accent">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="space-y-2 text-sm text-muted">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-3 text-sm font-semibold text-ink">
      <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? 'bg-accent' : 'bg-slate-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      {label}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
