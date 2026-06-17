'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, CheckCircle2, Code2, Download, KeyRound, LifeBuoy, PlugZap, Printer, RefreshCw, Save, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { fetchLocalAgentJson, getLocalAgentBaseHint } from '@/lib/local-agent';
import { getDefaultCompanyState, loadCompanyState, saveCompanyState, subscribeToCompanyChanges, type CompanyState } from '@/lib/company-store';
import { formatReceiptPreviewText } from '@/lib/receipt-formatter';
import { getDefaultAccessState, loadAccessState, saveAccessState, subscribeToAccessChanges, type AccessUser } from '@/lib/access-store';
import {
  getDefaultIntegrationState,
  loadIntegrationState,
  saveIntegrationState,
  subscribeToIntegrationChanges,
  type PrinterDeviceType,
  type PartnerIntegrationRecord,
  type PrintLogRecord,
} from '@/lib/integration-store';
import { getDefaultSessionState, loadSessionState, updateSessionUser } from '@/lib/session-store';

type SettingsTab = 'company' | 'integrations' | 'access' | 'developer';
type PrinterConnectionType = 'usb' | 'network';
type SystemPrinter = {
  name: string;
  driverName?: string;
  portName?: string;
  status?: string;
  shared?: boolean;
  connectionType: PrinterConnectionType;
  ip: string;
  default?: boolean;
  online?: boolean;
};

type AgentStatus = 'checking' | 'online' | 'offline' | 'missing';
type AgentDiagnostic = {
  code?: string;
  message?: string;
  tenantId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  agentVersion?: string | null;
  lastSeenAt?: string | null;
  printerCount?: number;
  spoolerStatus?: string | null;
  lastError?: string | null;
};

type LocalAgentHealthPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  deviceId?: string;
  version?: string;
  spooler?: { status?: string };
  printerCount?: number;
  installedPrinters?: Array<string | { Name?: string; name?: string; driver?: string; driverName?: string; portName?: string; status?: string; shared?: boolean; connectionType?: string; ip?: string; default?: boolean; online?: boolean }>;
  printers?: Array<string | { Name?: string; name?: string; driver?: string; driverName?: string; portName?: string; status?: string; shared?: boolean; connectionType?: string; ip?: string; default?: boolean; online?: boolean }>;
  agent?: AgentDiagnostic & { version?: string };
};

type PrintableDeviceType = Exclude<PrinterDeviceType, 'fiscal_pos'>;

const deviceTypeLabels: Record<PrinterDeviceType, string> = {
  receipt_printer: 'Fiş yazıcı',
  kitchen_printer: 'Mutfak yazıcı',
  bar_printer: 'Bar yazıcı',
  daily_report_printer: 'Günlük rapor yazıcı',
  fiscal_pos: 'Yazar kasa POS',
};

const printableDeviceTypeOptions: PrintableDeviceType[] = ['receipt_printer', 'kitchen_printer', 'bar_printer', 'daily_report_printer'];
const AGENT_STATUS_RETRY_COUNT = 3;
const AGENT_STATUS_RETRY_DELAY_MS = 500;
const AGENT_HEARTBEAT_MS = 6000;
const PRINTER_BRIDGE_LATEST_URL = 'https://adisyum.com/downloads/windows/latest/PrinterBridgeSetup.exe?v=windows-1781714257228';
const CURRENT_PRINTER_BRIDGE_VERSION = '0.1.7';

function isPrintableDeviceType(value: string): value is PrintableDeviceType {
  return value === 'receipt_printer' || value === 'kitchen_printer' || value === 'bar_printer' || value === 'daily_report_printer';
}

function isPrinterDeviceType(value: string): value is PrinterDeviceType {
  return value === 'receipt_printer' || value === 'kitchen_printer' || value === 'bar_printer' || value === 'daily_report_printer' || value === 'fiscal_pos';
};
type PrinterDraft = {
  name: string;
  role: string;
  ip: string;
  port: string;
  group: string;
  deviceType: PrinterDeviceType;
};

type UserDraft = {
  name: string;
  username: string;
  password: string;
  role: string;
  branchId: string;
};

const permissionOptions = [
  { id: 'orders.create', label: 'Sipariş açma' },
  { id: 'orders.edit', label: 'Sipariş düzenleme' },
  { id: 'orders.cancel', label: 'Sipariş iptal' },
  { id: 'pricing.manage', label: 'Fiyat yönetimi' },
  { id: 'payments.take', label: 'Tahsilat alma' },
  { id: 'reports.view', label: 'Rapor görme' },
  { id: 'settings.manage', label: 'Ayar yönetimi' },
];

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Building2 }> = [
  { id: 'company', label: 'Firma', icon: Building2 },
  { id: 'integrations', label: 'Entegrasyonlar', icon: PlugZap },
  { id: 'access', label: 'Yetkiler', icon: ShieldCheck },
];

function buildApiPrefix() {
  return `ark_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function formatNow() {
  return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function compareSemver(left: string, right: string) {
  const parse = (value: string) => {
    const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isLegacyPrinterBridgeVersion(version?: string | null) {
  if (!version) return false;
  return compareSemver(version, CURRENT_PRINTER_BRIDGE_VERSION) < 0;
}

function resolveAgentActionMessage(status: AgentStatus, diagnostic: AgentDiagnostic) {
  const spoolerStatus = diagnostic.spoolerStatus?.toLocaleLowerCase('tr-TR') ?? '';
  if (spoolerStatus && spoolerStatus !== 'healthy') {
    return 'Windows Yazdırma Biriktiricisi kapalı. Windows Hizmetler’den Print Spooler’ı başlatın.';
  }
  if (isLegacyPrinterBridgeVersion(diagnostic.agentVersion)) {
    return 'Printer Bridge eski sürüm. Güncel sürümü indirip kurun.';
  }
  if (diagnostic.code === 'agent_device_required' || (!diagnostic.deviceId && status === 'online')) {
    return 'Bu bilgisayarın agent kimliği alınamadı. Printer Bridge’i yeniden başlatın.';
  }
  if (diagnostic.code === 'local_agent_port_closed') {
    return 'Printer Bridge portu kapalı. Servisin çalıştığını ve 127.0.0.1:4891/health adresinin JSON döndürdüğünü kontrol edin.';
  }
  if (diagnostic.code === 'local_agent_csp_or_cors_blocked') {
    return 'Tarayıcı Printer Bridge bağlantısını engelliyor. CSP/CORS izni veya localhost erişimi engellenmiş olabilir.';
  }
  if (diagnostic.code === 'local_agent_timeout') {
    return 'Printer Bridge yanıt vermiyor. Servis çalışıyor olabilir ama health yanıtı 5 saniye içinde gelmedi.';
  }
  if (status === 'offline' || status === 'missing') {
    return 'Bu bilgisayarda Printer Bridge çalışmıyor. Yazıcıları görebilmek için Printer Bridge’i kurup açın.';
  }
  if ((diagnostic.printerCount ?? 0) === 0) {
    return 'Yazıcı köprüsü bağlı fakat bu bilgisayarda kurulu yazıcı yok.';
  }
  return diagnostic.message || 'Bağlantı bilgisi bekleniyor.';
}

function normalizeAgentDiagnostic(payload: LocalAgentHealthPayload): AgentDiagnostic {
  return {
    ...(payload.agent ?? {}),
    code: payload.code,
    message: payload.message,
    deviceId: payload.agent?.deviceId ?? payload.deviceId ?? null,
    agentVersion: payload.agent?.agentVersion ?? payload.agent?.version ?? payload.version ?? null,
    spoolerStatus: payload.agent?.spoolerStatus ?? payload.spooler?.status ?? null,
    printerCount: payload.agent?.printerCount ?? payload.printerCount ?? payload.installedPrinters?.length ?? payload.printers?.length ?? 0,
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [company, setCompany] = useState<CompanyState>(() => getDefaultCompanyState());
  const [companySaving, setCompanySaving] = useState(false);
  const [accessState, setAccessState] = useState(() => getDefaultAccessState());
  const [integrationState, setIntegrationState] = useState(() => getDefaultIntegrationState());
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDraft, setUserDraft] = useState<UserDraft>({
    name: '',
    username: '',
    password: '',
    role: 'Servis',
    branchId: 'mrk',
  });
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [selectedSystemPrinterName, setSelectedSystemPrinterName] = useState('');
  const [printerScanLoading, setPrinterScanLoading] = useState(false);
  const [printerAutoScanned, setPrinterAutoScanned] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('checking');
  const [agentDiagnostic, setAgentDiagnostic] = useState<AgentDiagnostic>({});
  const [printerDraft, setPrinterDraft] = useState<PrinterDraft>({
    name: '',
    role: 'Kasa',
    ip: '',
    port: '9100',
    group: 'Kasa hattı',
    deviceType: 'receipt_printer',
  });
  const [message, setMessage] = useState('');
  const integrationStateRef = useRef(integrationState);
  const systemPrintersRef = useRef<SystemPrinter[]>([]);
  const agentStatusCheckInFlightRef = useRef<Promise<boolean> | null>(null);
  const printerScanInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'integrations' || tab === 'access' || tab === 'company') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const refresh = () => {
      setCompany(loadCompanyState());
      setAccessState(loadAccessState());
      setIntegrationState(loadIntegrationState());
    };

    refresh();

    const unsubscribeCompany = subscribeToCompanyChanges(refresh);
    const unsubscribeAccess = subscribeToAccessChanges(refresh);
    const unsubscribeIntegration = subscribeToIntegrationChanges(refresh);

    return () => {
      unsubscribeCompany();
      unsubscribeAccess();
      unsubscribeIntegration();
    };
  }, []);

  useEffect(() => {
    integrationStateRef.current = integrationState;
  }, [integrationState]);

  useEffect(() => {
    systemPrintersRef.current = systemPrinters;
  }, [systemPrinters]);

  useEffect(() => {
    const persistBeforeUnload = () => {
      saveIntegrationState(integrationStateRef.current);
    };

    window.addEventListener('beforeunload', persistBeforeUnload);
    window.addEventListener('pagehide', persistBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', persistBeforeUnload);
      window.removeEventListener('pagehide', persistBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!selectedPrinterId && integrationState.printerDevices[0]) {
      setSelectedPrinterId(integrationState.printerDevices[0].id);
    }
  }, [integrationState.printerDevices, selectedPrinterId]);

  useEffect(() => {
    if (!selectedUserId && accessState.users[0]) {
      setSelectedUserId(accessState.users[0].id);
    }
  }, [accessState.users, selectedUserId]);

  useEffect(() => {
    if (activeTab !== 'integrations' || printerAutoScanned) return;
    setPrinterAutoScanned(true);
    void scanSystemPrinters();
  }, [activeTab, printerAutoScanned]);

  useEffect(() => {
    if (activeTab !== 'company') return;
    let cancelled = false;

    fetch('/api/settings/company', { cache: 'no-store' })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (cancelled || !response.ok || payload?.ok === false || !payload?.company) return;
        const nextCompany = { ...loadCompanyState(), ...payload.company };
        setCompany(nextCompany);
        saveCompanyState(nextCompany);
      })
      .catch((error) => {
        console.error('[settings] company profile load failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'integrations') return;

    let stopped = false;
    let hadOnline = false;

    const pollAgent = async () => {
      if (stopped) return;
      const isOnline = await checkAgentStatus({ quiet: true, retries: 1 });
      if (isOnline && !hadOnline) {
        hadOnline = true;
        if (systemPrintersRef.current.length === 0) {
          await scanSystemPrinters({ skipStatusCheck: true });
        }
        return;
      }
      if (!isOnline) {
        hadOnline = false;
      }
    };

    void pollAgent();
    const timer = window.setInterval(() => {
      void pollAgent();
    }, AGENT_HEARTBEAT_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeTab]);

  const availablePrinterDevices = useMemo(
    () => integrationState.printerDevices.filter((printer) => printer.deviceType !== 'fiscal_pos'),
    [integrationState.printerDevices],
  );

  const queueSummary = useMemo(() => {
    const waiting = integrationState.printLogs.filter((log) => log.status === 'Bekliyor').length;
    const failed = integrationState.printLogs.filter((log) => log.status === 'Failover' || log.status === 'Hata').length;
    const sent = integrationState.printLogs.filter((log) => log.status === 'Gönderildi').length;
    return { waiting, failed, sent };
  }, [integrationState.printLogs]);

  const branchOptions = useMemo(() => getDefaultSessionState().branches.filter((branch) => branch.id !== 'all'), []);
  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    accessState.permissionMatrix.forEach((row) => roles.add(row.role));
    accessState.customRoles.forEach((role) => roles.add(role.name));
    return Array.from(roles);
  }, [accessState.customRoles, accessState.permissionMatrix]);
  const selectedUser = useMemo(
    () => accessState.users.find((user) => user.id === selectedUserId) ?? accessState.users[0] ?? null,
    [accessState.users, selectedUserId],
  );

  const selectedSystemPrinter = useMemo(
    () => systemPrinters.find((printer) => printer.name === selectedSystemPrinterName) ?? null,
    [selectedSystemPrinterName, systemPrinters],
  );
  const agentActionMessage = useMemo(
    () => resolveAgentActionMessage(agentStatus, agentDiagnostic),
    [agentDiagnostic, agentStatus],
  );
  const spoolerStatus = agentDiagnostic.spoolerStatus?.toLocaleLowerCase('tr-TR') ?? '';
  const agentNeedsAction = agentStatus !== 'online'
    || agentDiagnostic.code === 'agent_device_required'
    || isLegacyPrinterBridgeVersion(agentDiagnostic.agentVersion)
    || Boolean(spoolerStatus && spoolerStatus !== 'healthy')
    || (!printerScanLoading && systemPrinters.length === 0);

  const receiptPreviewOrder = useMemo(
    () => ({
      id: 'AD-20260615-0042',
      table: 'Salon 4',
      staffName: 'Garson Ayşe',
      createdAt: new Date('2026-05-31T20:45:00'),
      discount: 15,
      serviceCharge: 25,
      taxTotal: 0,
      items: [
        { id: 'preview-1', name: 'Izgara köfte porsiyon uzun ürün adı kontrolü', qty: 2, price: 285 },
        { id: 'preview-2', name: 'Çoban salata', qty: 1, price: 95 },
        { id: 'preview-3', name: 'Türk kahvesi', qty: 2, price: 65 },
      ],
    }),
    [],
  );

  const receiptPreviewText = useMemo(
    () => formatReceiptPreviewText(receiptPreviewOrder, {
      restaurantName: company.tradeName || 'Adisyum',
      branchName: company.branchName || '',
      logoUrl: company.logoUrl || '',
      footerText: company.receiptFooter || 'Afiyet olsun',
      paperWidth: company.receiptPaperWidth || '80mm',
      receiptTitle: company.receiptTitle || 'ADİSYON',
      showLogo: company.receiptShowLogo,
      showBranch: company.receiptShowBranch,
      showDate: company.receiptShowDate,
      showTable: company.receiptShowTable,
      showItemHeader: company.receiptShowItemHeader,
      headerScale: company.receiptHeaderScale,
      itemScale: company.receiptItemScale,
      totalScale: company.receiptTotalScale,
      usdRate: company.receiptUsdRate,
      eurRate: company.receiptEurRate,
    }),
    [company, receiptPreviewOrder],
  );

  function changeTab(tab: SettingsTab) {
    saveIntegrationState(integrationState);
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`);
  }

  async function saveCompany() {
    if (companySaving) return;
    setCompanySaving(true);
    try {
      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; company?: Partial<CompanyState> } | null;
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Firma bilgileri kaydedilemedi (${response.status}).`);
      }

      const nextCompany = payload?.company ? { ...company, ...payload.company } : company;
      setCompany(nextCompany);
      saveCompanyState(nextCompany);
      setMessage('Firma bilgileri kaydedildi.');
    } catch (error) {
      console.error('[settings] company save failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setMessage(error instanceof Error ? error.message : 'Firma bilgileri kaydedilemedi.');
    } finally {
      setCompanySaving(false);
    }
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setMessage('Logo yüklenemedi. Lütfen tekrar deneyin.');
        return;
      }

      setCompany((current) => ({ ...current, logoUrl: result }));
      setMessage('Logo yüklendi. Kaydet ile kalıcı hale getirin.');
    };

    reader.onerror = () => {
      setMessage('Logo okunamadı. Farklı bir dosya deneyin.');
    };

    reader.readAsDataURL(file);
  }

  function persistAccess(nextState: ReturnType<typeof loadAccessState>) {
    saveAccessState(nextState);
    setAccessState(nextState);
  }

  function persistIntegration(nextState: ReturnType<typeof loadIntegrationState>) {
    saveIntegrationState(nextState);
    setIntegrationState(nextState);
  }

  async function scanSystemPrinters(options: { skipStatusCheck?: boolean } = {}) {
    if (printerScanInFlightRef.current) {
      return printerScanInFlightRef.current;
    }

    const run = (async () => {
      const scanStartedAt = Date.now();
      setPrinterScanLoading(true);
      setMessage('');

      try {
        const isOnline = options.skipStatusCheck === true
          ? true
          : await checkAgentStatus({ retries: AGENT_STATUS_RETRY_COUNT });
        if (!isOnline) {
          setSystemPrinters([]);
          setSelectedSystemPrinterName('');
          setMessage(agentDiagnostic.message || 'Bu bilgisayarda Printer Bridge çalışmıyor. Yazıcıları görebilmek için Printer Bridge’i kurup açın.');
          return;
        }

        const localAgentResult = await scanLocalAgentPrinters();
        if (localAgentResult.agent) {
          const registeredDevice = await registerLocalAgentDevice(localAgentResult.printers, localAgentResult.agent);
          setAgentDiagnostic((current) => ({
            ...current,
            ...localAgentResult.agent,
            tenantId: registeredDevice?.tenantId ?? current.tenantId ?? null,
            branchId: registeredDevice?.branchId ?? localAgentResult.agent?.branchId ?? current.branchId ?? null,
          }));
        }
        setSystemPrinters(localAgentResult.printers);
        setSelectedSystemPrinterName(localAgentResult.printers[0]?.name ?? '');
        console.info('[business-flow] system printer scan completed', {
          printerCount: localAgentResult.printers.length,
          durationMs: Date.now() - scanStartedAt,
          source: 'local-agent',
          timestamp: new Date().toISOString(),
        });
        if (localAgentResult.printers.length > 0) {
          setMessage(`${localAgentResult.printers.length} yazıcı local agent üzerinden bulundu.`);
          return;
        }

        const spoolerStatus = agentDiagnostic.spoolerStatus?.toLocaleLowerCase('tr-TR') ?? '';
        setMessage(spoolerStatus && spoolerStatus !== 'healthy'
          ? 'Windows spooler kapalı veya sorunlu görünüyor. Yazdırma biriktiricisini kontrol edin.'
          : 'Yazıcı köprüsü bağlı fakat bu bilgisayarda kurulu yazıcı yok.');
      } catch (error) {
        console.error('[business-flow] system printer scan failed', {
          durationMs: Date.now() - scanStartedAt,
          timestamp: new Date().toISOString(),
          error,
        });
        setMessage(`Yazıcılar okunamadı. Yazıcı köprüsü çalışmıyor olabilir. Printer Bridge uygulamasını açın ve ${getLocalAgentBaseHint()} erişimini kontrol edin.`);
      } finally {
        setPrinterScanLoading(false);
      }
    })();

    printerScanInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (printerScanInFlightRef.current === run) {
        printerScanInFlightRef.current = null;
      }
    }
  }

  async function checkAgentStatus(options: { quiet?: boolean; retries?: number } = {}) {
    if (agentStatusCheckInFlightRef.current) {
      return agentStatusCheckInFlightRef.current;
    }

    const retries = options.retries ?? 1;
    if (!options.quiet) {
      setAgentStatus('checking');
    }

    const run = (async () => {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        const attemptStartedAt = Date.now();
        try {
          const { data } = await fetchLocalAgentJson<LocalAgentHealthPayload>('/health');
          setAgentStatus('online');
          setAgentDiagnostic(normalizeAgentDiagnostic(data));
          if (!options.quiet) {
            console.info('[business-flow] local agent status check completed', {
              attempt,
              retries,
              durationMs: Date.now() - attemptStartedAt,
              timestamp: new Date().toISOString(),
            });
          }
          return true;
        } catch (error) {
          const diagnosticError = error as Error & { code?: string; payload?: { message?: string; agent?: AgentDiagnostic } };
          setAgentDiagnostic({ ...(diagnosticError.payload?.agent ?? {}), code: diagnosticError.code, message: diagnosticError.payload?.message ?? diagnosticError.message });
          if (diagnosticError.code === 'agent_not_found') {
            setAgentStatus('missing');
            return false;
          }
          console.warn('[business-flow] local agent status check failed', {
            attempt,
            retries,
            durationMs: Date.now() - attemptStartedAt,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
          if (attempt < retries) {
            await new Promise((resolve) => window.setTimeout(resolve, AGENT_STATUS_RETRY_DELAY_MS));
          }
        }
      }

      setAgentStatus('offline');
      return false;
    })();

    agentStatusCheckInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (agentStatusCheckInFlightRef.current === run) {
        agentStatusCheckInFlightRef.current = null;
      }
    }
  }

  async function registerLocalAgentDevice(printers: SystemPrinter[], diagnostic: AgentDiagnostic) {
    if (!diagnostic.deviceId) return null;
    const session = loadSessionState();
    const response = await fetch('/api/devices/registry', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: diagnostic.deviceId,
        branchId: diagnostic.branchId || session.activeBranchId || 'mrk',
        hostname: diagnostic.deviceName || undefined,
        bridgeVersion: diagnostic.agentVersion || undefined,
        printers,
        spoolerHealth: diagnostic.spoolerStatus || 'unknown',
        metadata: { source: 'settings-printer-scan' },
      }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; device?: { tenantId?: string; branchId?: string } } | null;
    if (!response.ok || !payload?.ok) return null;
    return payload.device ?? null;
  }

  async function scanLocalAgentPrinters(): Promise<{ printers: SystemPrinter[]; agent?: AgentDiagnostic; error?: string }> {
    const scanStartedAt = Date.now();
    try {
      const { data: health } = await fetchLocalAgentJson<LocalAgentHealthPayload>('/health');
      const healthAgent = normalizeAgentDiagnostic(health);
      const { data } = await fetchLocalAgentJson<
        Array<string | { Name?: string; name?: string; driver?: string; driverName?: string; portName?: string; status?: string; shared?: boolean; connectionType?: string; ip?: string; default?: boolean; online?: boolean }>
        | LocalAgentHealthPayload
      >('/printers');
      if (!Array.isArray(data)) {
        setAgentDiagnostic({ ...healthAgent, ...normalizeAgentDiagnostic(data), code: data.code ?? healthAgent.code, message: data.message ?? healthAgent.message });
      }
      const rawPrinters = Array.isArray(data)
        ? data
        : Array.isArray(data.printers)
          ? data.printers
          : Array.isArray(data.installedPrinters)
            ? data.installedPrinters
          : [];
      const printers: SystemPrinter[] = Array.isArray(rawPrinters)
        ? rawPrinters
            .flatMap((item) => {
              const name = typeof item === 'string' ? item : (item.Name ?? item.name ?? '');
              if (!name.trim()) return [];
              const connectionType = typeof item === 'string' || item.connectionType !== 'network' ? 'usb' : 'network';
              return [{
                name: name.trim(),
                driverName: typeof item === 'string' ? '' : item.driverName ?? item.driver ?? '',
                portName: typeof item === 'string' ? '' : item.portName ?? '',
                status: typeof item === 'string' ? '' : item.status ?? '',
                shared: typeof item === 'string' ? false : Boolean(item.shared),
                connectionType: connectionType as PrinterConnectionType,
                ip: typeof item === 'string' ? '' : item.ip ?? '',
                default: typeof item === 'string' ? false : Boolean(item.default),
                online: typeof item === 'string' ? true : item.online !== false,
              }];
            })
        : [];

      return {
        printers,
        agent: healthAgent,
      };
    } catch (error) {
      console.error('[business-flow] local agent printer scan failed', {
        durationMs: Date.now() - scanStartedAt,
        timestamp: new Date().toISOString(),
        error,
      });
      return {
        printers: [] as SystemPrinter[],
        error: error instanceof Error ? error.message : 'Local agent erişilemedi.',
      };
    }
  }

  function addPrinterDevice(device: {
    name: string;
    role: string;
    connectionType: PrinterConnectionType;
    deviceType: PrinterDeviceType;
    ip?: string;
    port?: number;
    group: string;
    systemName?: string;
    driverName?: string;
    portName?: string;
    agentDeviceId?: string;
    agentTenantId?: string;
    agentBranchId?: string;
  }) {
    const trimmedName = device.name.trim();
    if (!trimmedName) return;

    const nextPrinter = {
      id: `prt-${slugify(trimmedName) || Date.now()}-${Date.now()}`,
      name: trimmedName,
      role: device.role.trim() || 'POS Yazıcısı',
      deviceType: device.deviceType,
      connectionType: device.connectionType,
      systemName: device.systemName,
      driverName: device.driverName,
      portName: device.portName,
      agentDeviceId: device.agentDeviceId,
      agentTenantId: device.agentTenantId,
      agentBranchId: device.agentBranchId,
      ip: device.connectionType === 'network' ? device.ip ?? '' : '',
      port: device.connectionType === 'network' ? device.port ?? 9100 : 0,
      status: 'Aktif' as const,
      queue: 0,
      retry: '10 sn',
      backup: 'Yok',
      group: device.group.trim() || 'POS hattı',
    };

    const samePrinterRegistration = (printer: typeof nextPrinter) => {
      if (printer.connectionType !== nextPrinter.connectionType) {
        return false;
      }

      if (nextPrinter.connectionType === 'network') {
        return Boolean(nextPrinter.ip)
          && printer.ip === nextPrinter.ip
          && Number(printer.port || 9100) === Number(nextPrinter.port || 9100);
      }

      const currentSystemName = (printer.systemName || printer.name || '').trim();
      const nextSystemName = (nextPrinter.systemName || nextPrinter.name || '').trim();
      return Boolean(nextSystemName) && currentSystemName === nextSystemName;
    };

    persistIntegration({
      ...integrationState,
      printerDevices: [
        nextPrinter,
        ...integrationState.printerDevices.filter((printer) => !samePrinterRegistration(printer as typeof nextPrinter)),
      ],
    });
    setSelectedPrinterId(nextPrinter.id);
    setMessage(`${nextPrinter.name} POS yazıcısı olarak eklendi.`);
  }

  function addSelectedSystemPrinter() {
    if (!selectedSystemPrinter) {
      setMessage('Önce sistemden bulunan bir yazıcı seçin.');
      return;
    }

    const inferredType: PrintableDeviceType = printerDraft.deviceType === 'kitchen_printer' || printerDraft.deviceType === 'bar_printer'
      ? printerDraft.deviceType
      : printerDraft.deviceType === 'daily_report_printer'
        ? 'daily_report_printer'
      : 'receipt_printer';

    addPrinterDevice({
      name: selectedSystemPrinter.name,
      role: inferredType === 'kitchen_printer' ? 'Mutfak'
        : inferredType === 'bar_printer' ? 'Bar'
          : inferredType === 'daily_report_printer' ? 'Günlük rapor'
          : 'Kasa',
      connectionType: selectedSystemPrinter.connectionType,
      deviceType: inferredType,
      ip: selectedSystemPrinter.ip,
      port: 9100,
      group: inferredType === 'kitchen_printer' ? 'Mutfak hattı'
        : inferredType === 'bar_printer' ? 'Bar hattı'
          : inferredType === 'daily_report_printer' ? 'Günlük rapor hattı'
          : 'Kasa hattı',
      systemName: selectedSystemPrinter.name,
      driverName: selectedSystemPrinter.driverName,
      portName: selectedSystemPrinter.portName,
      agentDeviceId: agentDiagnostic.deviceId ?? undefined,
      agentTenantId: agentDiagnostic.tenantId ?? undefined,
      agentBranchId: agentDiagnostic.branchId ?? undefined,
    });
  }

  function addManualNetworkPrinter() {
    if (!printerDraft.name.trim() || !printerDraft.ip.trim()) {
      setMessage('IP yazıcı için yazıcı adı ve IP adresi zorunlu.');
      return;
    }

    addPrinterDevice({
      name: printerDraft.name,
      role: printerDraft.role,
      connectionType: 'network',
      deviceType: printerDraft.deviceType,
      ip: printerDraft.ip,
      port: Number(printerDraft.port) || 9100,
      group: printerDraft.group,
    });
    setPrinterDraft((current) => ({ ...current, name: '', ip: '', port: '9100', deviceType: current.deviceType }));
  }

  function setPrinterDeviceType(printerId: string, deviceType: PrinterDeviceType) {
    persistIntegration({
      ...integrationState,
      printerDevices: integrationState.printerDevices.map((printer) =>
        printer.id === printerId
          ? {
              ...printer,
              deviceType,
            }
          : printer,
      ),
    });
    setMessage('Yazıcı tipi güncellendi.');
  }

  function saveTenantPrinterSelections() {
    if (availablePrinterDevices.length === 0) {
      setMessage('Önce en az bir yazıcı ekleyin.');
      return;
    }

    const fallback = availablePrinterDevices[0]?.name ?? '';

    persistIntegration({
      ...integrationState,
      printerSettings: {
        defaultPrinter: integrationState.printerSettings.defaultPrinter || fallback,
        kitchenPrinter: integrationState.printerSettings.kitchenPrinter || fallback,
        barPrinter: integrationState.printerSettings.barPrinter || fallback,
        deviceType: isPrintableDeviceType(integrationState.printerSettings.deviceType)
          ? integrationState.printerSettings.deviceType
          : 'receipt_printer',
      },
    });
    setMessage('Tenant yazıcı seçimleri kaydedildi.');
  }

  function removePrinterDevice(printerId: string) {
    const printer = integrationState.printerDevices.find((item) => item.id === printerId);
    if (!printer) return;

    const nextPrinters = integrationState.printerDevices.filter((item) => item.id !== printerId);
    persistIntegration({
      ...integrationState,
      printerDevices: nextPrinters,
      printerMappings: integrationState.printerMappings.map((mapping) => ({
        ...mapping,
        printer: mapping.printer === printer.name ? '' : mapping.printer,
        fallback: mapping.fallback === printer.name ? '' : mapping.fallback,
      })),
    });
    setSelectedPrinterId(nextPrinters[0]?.id ?? '');
    setMessage(`${printer.name} kayıtlı POS yazıcılarından kaldırıldı.`);
  }

  function togglePrinterDeviceStatus(printerId: string) {
    const printer = integrationState.printerDevices.find((item) => item.id === printerId);
    if (!printer) return;

    const nextStatus = printer.status === 'Pasif' ? 'Aktif' : 'Pasif';
    persistIntegration({
      ...integrationState,
      printerDevices: integrationState.printerDevices.map((item) =>
        item.id === printerId ? { ...item, status: nextStatus } : item,
      ),
    });
    setMessage(`${printer.name} ${nextStatus.toLocaleLowerCase('tr-TR')} duruma alındı.`);
  }

  function addRole() {
    if (!roleName.trim()) return;

    persistAccess({
      ...accessState,
      customRoles: [
        {
          name: roleName.trim(),
          description: roleDescription.trim() || 'Özel operasyon rolü',
          permissions: ['Sipariş oluşturma', 'Sipariş düzenleme'],
        },
        ...accessState.customRoles,
      ],
    });
    setRoleName('');
    setRoleDescription('');
    setMessage('Yeni rol kaydedildi.');
  }

  function addUser() {
    const trimmedName = userDraft.name.trim();
    const trimmedUsername = userDraft.username.trim();
    const trimmedPassword = userDraft.password.trim();

    if (!trimmedName || !trimmedUsername || !trimmedPassword) {
      setMessage('Kullanıcı oluşturmak için ad, kullanıcı adı ve şifre zorunlu.');
      return;
    }

    if (accessState.users.some((user) => user.username.toLocaleLowerCase('tr-TR') === trimmedUsername.toLocaleLowerCase('tr-TR'))) {
      setMessage('Bu kullanıcı adı zaten kullanılıyor.');
      return;
    }

    const role = roleOptions.includes(userDraft.role) ? userDraft.role : roleOptions[0] ?? 'Servis';
    const nextUser: AccessUser = {
      id: `usr-${Date.now()}`,
      name: trimmedName,
      username: trimmedUsername,
      password: trimmedPassword,
      role,
      branchId: userDraft.branchId || branchOptions[0]?.id || 'mrk',
      active: true,
      permissions: permissionsFromRole(role),
    };

    persistAccess({
      ...accessState,
      users: [nextUser, ...accessState.users],
    });
    setSelectedUserId(nextUser.id);
    setUserDraft({
      name: '',
      username: '',
      password: '',
      role: 'Servis',
      branchId: branchOptions[0]?.id ?? 'mrk',
    });
    setMessage(`${nextUser.name} kullanıcısı oluşturuldu.`);
  }

  function patchUser(userId: string, patch: Partial<AccessUser>) {
    const nextUsers = accessState.users.map((user) => {
      if (user.id !== userId) return user;
      const nextRole = patch.role ?? user.role;
      return {
        ...user,
        ...patch,
        permissions: patch.role && !patch.permissions ? permissionsFromRole(nextRole) : (patch.permissions ?? user.permissions),
      };
    });

    persistAccess({ ...accessState, users: nextUsers });
  }

  function deleteUser(userId: string) {
    const target = accessState.users.find((user) => user.id === userId);
    if (!target) return;
    if (target.role === 'Admin' && accessState.users.filter((user) => user.role === 'Admin').length <= 1) {
      setMessage('Son admin kullanıcısı silinemez.');
      return;
    }

    const nextUsers = accessState.users.filter((user) => user.id !== userId);
    persistAccess({ ...accessState, users: nextUsers });
    setSelectedUserId(nextUsers[0]?.id ?? '');
    setMessage(`${target.name} kullanıcısı silindi.`);
  }

  function toggleUserPermission(userId: string, permissionId: string) {
    const target = accessState.users.find((user) => user.id === userId);
    if (!target) return;

    patchUser(userId, {
      permissions: target.permissions.includes(permissionId)
        ? target.permissions.filter((permission) => permission !== permissionId)
        : [...target.permissions, permissionId],
    });
  }

  function switchUserRole(role: string) {
    updateSessionUser({ role });
    setMessage(`Aktif kullanıcı rolü ${role} yapıldı.`);
  }

  function permissionsFromRole(role: string) {
    const matrix = accessState.permissionMatrix.find((row) => row.role === role);
    if (!matrix) {
      const customRole = accessState.customRoles.find((item) => item.name === role);
      return customRole?.permissions ?? [];
    }

    return [
      matrix.create ? 'orders.create' : '',
      matrix.create ? 'orders.edit' : '',
      matrix.cancel ? 'orders.cancel' : '',
      matrix.pricing ? 'pricing.manage' : '',
      matrix.payment ? 'payments.take' : '',
      matrix.reports ? 'reports.view' : '',
    ].filter(Boolean);
  }

  function retryFailedJobs() {
    const nextLogs = integrationState.printLogs.map((log) =>
      log.status === 'Failover' || log.status === 'Bekliyor'
        ? { ...log, status: 'Gönderildi', info: 'Ayarlar panelinden yeniden işlendi', time: formatNow() }
        : log,
    );
    persistIntegration({ ...integrationState, printLogs: nextLogs });
    setMessage('Bekleyen ve hatalı yazdırma işleri tekrar işlendi.');
  }

  async function manualReprint() {
    const printer = integrationState.printerDevices.find((item) => item.id === selectedPrinterId);
    if (!printer) return;

    if (printer.deviceType === 'fiscal_pos') {
      setMessage('Yazar kasa POS ayrı sistemdir. Local agent ile test yazdırma yapılmaz.');
      return;
    }

    try {
      const sampleText = [
        company.tradeName,
        'Test Yazdır',
        `Tarih/Saat: ${new Date().toLocaleString('tr-TR')}`,
        '------------------------------',
        '1 x Deneme Ürünü',
      ].join('\n');
      const bytesBase64 = btoa(unescape(encodeURIComponent(sampleText)));

      await fetchLocalAgentJson('/print', {
        method: 'POST',
        body: {
          printerName: printer.name,
          bytesBase64,
          source: 'settings:manualReprint',
        },
      });
    } catch {
      setMessage('Test Yazdır başarısız. Local agent çalışmıyor olabilir.');
      return;
    }

    const log: PrintLogRecord = {
      id: `manual-${Date.now()}`,
      order: `MANUAL-${Date.now()}`,
      printer: printer.name,
      status: 'Gönderildi',
      time: formatNow(),
      info: 'Ayarlar panelinden manuel yazdırıldı',
    };
    persistIntegration({ ...integrationState, printLogs: [log, ...integrationState.printLogs] });
    setMessage(`${printer.name} için Test Yazdır gönderildi.`);
  }

  function rotateKey(id: string) {
    persistIntegration({
      ...integrationState,
      apiKeys: integrationState.apiKeys.map((key) => key.id === id ? { ...key, prefix: buildApiPrefix(), status: 'Aktif' } : key),
      apiUsageLogs: [
        { id: `log-${Date.now()}`, method: 'POST', path: '/api/v2/keys/rotate', status: 201, actor: 'Admin', time: '88 ms' },
        ...integrationState.apiUsageLogs,
      ],
    });
    setMessage('API anahtarı yenilendi.');
  }

  function queueWebhookTest() {
    persistIntegration({
      ...integrationState,
      webhookEvents: [
        { id: `wh-${Date.now()}`, event: 'developer.test', target: 'https://hooks.partner.local/test', status: 'Kuyruklandı' },
        ...integrationState.webhookEvents,
      ],
    });
    setMessage('Test webhook kuyruğa alındı.');
  }

  return (
    <AppShell
      title="Ayarlar"
      subtitle="Firma, entegrasyon, yetki ve geliştirici ayarlarını tek merkezden yönetin."
    >
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                className={`flex items-center gap-3 rounded-[1.1rem] border px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                  active ? 'border-blue-400/45 bg-blue-600 text-white shadow-[0_18px_36px_rgba(37,99,235,0.22)]' : 'border-line bg-panel text-ink hover:border-accent/25'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </section>

        {message ? (
          <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
            {message}
          </section>
        ) : null}

        {activeTab === 'company' ? (
          <>
          <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Firma kartı</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">İşletme bilgileri</h2>
              </div>
              <button type="button" onClick={() => void saveCompany()} disabled={companySaving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="h-4 w-4" /> {companySaving ? 'Kaydediliyor' : 'Kaydet'}
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ['tradeName', 'Firma ünvanı'],
                ['branchName', 'Şube adı'],
                ['taxOffice', 'Vergi dairesi'],
                ['taxNumber', 'Vergi no'],
                ['phone', 'Telefon'],
                ['email', 'E-posta'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium text-muted">{label}</span>
                  <input
                    value={String(company[key as keyof CompanyState] ?? '')}
                    onChange={(event) => setCompany((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  />
                </label>
              ))}
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-muted">Adres</span>
                <textarea value={company.address} onChange={(event) => setCompany((current) => ({ ...current, address: event.target.value }))} className="mt-2 min-h-[96px] w-full rounded-2xl border border-line bg-canvas px-4 py-3 font-semibold text-ink outline-none" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-muted">Fiş alt yazısı</span>
                <input value={company.receiptFooter} onChange={(event) => setCompany((current) => ({ ...current, receiptFooter: event.target.value }))} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-muted">Logo Yükle</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="mt-2 block w-full rounded-2xl border border-line bg-canvas px-4 py-3 font-semibold text-ink outline-none file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
                {company.logoUrl ? (
                  <div className="mt-3 rounded-2xl border border-line bg-canvas p-3">
                    <img src={company.logoUrl} alt="Firma logosu" className="h-14 w-auto object-contain" />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Logo tanımlı değil. Fişte logo görünmesi için görsel yükleyin.</p>
                )}
              </label>
            </div>
          </section>

          <section className="grid gap-5 rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft xl:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Adisyon şablonu</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">Yazıcı çıktısı ön izleme</h2>
                  <p className="mt-1 text-sm text-muted">Müşteriye verilecek adisyonun başlık, kağıt genişliği ve görünür alanlarını buradan düzenleyin.</p>
                </div>
                <Printer className="h-6 w-6 text-accent" />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-muted">Adisyon başlığı</span>
                  <input
                    value={company.receiptTitle}
                    onChange={(event) => setCompany((current) => ({ ...current, receiptTitle: event.target.value }))}
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-muted">Kağıt genişliği</span>
                  <select
                    value={company.receiptPaperWidth}
                    onChange={(event) => setCompany((current) => ({ ...current, receiptPaperWidth: event.target.value === '58mm' ? '58mm' : '80mm' }))}
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  >
                    <option value="80mm">80 mm</option>
                    <option value="58mm">58 mm</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-muted">USD kuru</span>
                  <input
                    value={company.receiptUsdRate}
                    onChange={(event) => setCompany((current) => ({ ...current, receiptUsdRate: event.target.value }))}
                    inputMode="decimal"
                    placeholder="Örn. 32,95"
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-muted">EUR kuru</span>
                  <input
                    value={company.receiptEurRate}
                    onChange={(event) => setCompany((current) => ({ ...current, receiptEurRate: event.target.value }))}
                    inputMode="decimal"
                    placeholder="Örn. 35,70"
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  />
                </label>

                {[
                  ['receiptHeaderScale', 'Başlık fontu'],
                  ['receiptItemScale', 'Ürün fontu'],
                  ['receiptTotalScale', 'Toplam fontu'],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-sm font-medium text-muted">{label}</span>
                    <select
                      value={String(company[key as keyof CompanyState] ?? 2)}
                      onChange={(event) => setCompany((current) => ({ ...current, [key]: event.target.value === '1' ? 1 : 2 }))}
                      className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                    >
                      <option value="1">Normal</option>
                      <option value="2">Büyük</option>
                    </select>
                  </label>
                ))}

                <label className="block">
                  <span className="text-sm font-medium text-muted">Alt yazı</span>
                  <input
                    value={company.receiptFooter}
                    onChange={(event) => setCompany((current) => ({ ...current, receiptFooter: event.target.value }))}
                    className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none"
                  />
                </label>

                {[
                  ['receiptShowLogo', 'Logo göster'],
                  ['receiptShowBranch', 'Şube göster'],
                  ['receiptShowDate', 'Tarih/saat göster'],
                  ['receiptShowTable', 'Masa bilgisi göster'],
                  ['receiptShowItemHeader', 'Ürün başlığı göster'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-canvas px-4 py-3">
                    <span className="text-sm font-semibold text-ink">{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(company[key as keyof CompanyState])}
                      onChange={(event) => setCompany((current) => ({ ...current, [key]: event.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => void saveCompany()} disabled={companySaving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  <Save className="h-4 w-4" /> {companySaving ? 'Kaydediliyor' : 'Şablonu kaydet'}
                </button>
                <span className="inline-flex h-11 items-center rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold text-muted">
                  Ön izleme anlık güncellenir
                </span>
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-line bg-canvas p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">Baskı ön izlemesi</p>
                <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">{company.receiptPaperWidth}</span>
              </div>
              <div className="mt-4 flex justify-center overflow-auto rounded-2xl bg-slate-200 px-4 py-5">
                <pre
                  className={`min-h-[520px] whitespace-pre-wrap rounded-sm bg-white px-5 py-6 font-mono leading-5 text-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.18)] ${company.receiptItemScale === 2 ? 'text-[13px]' : 'text-[11px]'} ${
                    company.receiptPaperWidth === '58mm' ? 'w-[280px]' : 'w-[390px]'
                  }`}
                >
                  {receiptPreviewText}
                </pre>
              </div>
            </div>
          </section>
          </>
        ) : null}

        {activeTab === 'integrations' ? (
          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div className="mb-5 rounded-[1.5rem] border border-accent/20 bg-accent/5 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Yeni modül</p>
                    <h2 className="mt-2 text-2xl font-semibold text-ink">Yazarkasa POS</h2>
                    <p className="mt-1 text-sm text-muted">Cihaz ayarları, ürün eşleştirme, bağlantı testi ve log ekranı ayrı operasyon panelinde yönetilir.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/settings/pos" className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
                      POS panelini aç
                    </Link>
                    <Link href="/settings/gib" className="inline-flex h-11 items-center justify-center rounded-2xl border border-line bg-canvas px-4 text-sm font-semibold text-ink">
                      GİB panelini aç
                    </Link>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">POS yazıcı kurulumu</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">USB ve ağ yazıcıları</h2>
                  <p className="mt-1 text-sm text-muted">USB yazıcı Windows'a kuruluysa listeden seçilir. Ağ yazıcıları IP ve port ile eklenir.</p>
                </div>
                <button type="button" onClick={() => void scanSystemPrinters()} disabled={printerScanLoading} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${printerScanLoading ? 'animate-spin' : ''}`} />
                  Sistem yazıcılarını tara
                </button>
              </div>

              <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${agentStatus === 'online' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>
                {agentStatus === 'online' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {agentStatus === 'online' ? 'Agent aktif' : agentStatus === 'checking' ? 'Agent kontrol ediliyor' : agentStatus === 'missing' ? 'Agent eşleşmesi yok' : 'Agent çevrimdışı'}
              </div>
              <div className="mt-3 grid gap-2 rounded-2xl border border-line bg-canvas p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p><span className="font-semibold text-ink">Cihaz:</span> <span className="text-muted">{agentDiagnostic.deviceName || '-'}</span></p>
                <p><span className="font-semibold text-ink">Agent sürümü:</span> <span className="text-muted">{agentDiagnostic.agentVersion || '-'}</span></p>
                <p><span className="font-semibold text-ink">Spooler:</span> <span className="text-muted">{agentDiagnostic.spoolerStatus || '-'}</span></p>
                <p><span className="font-semibold text-ink">Son bağlantı:</span> <span className="text-muted">{agentDiagnostic.lastSeenAt ? new Date(agentDiagnostic.lastSeenAt).toLocaleString('tr-TR') : '-'}</span></p>
                <p><span className="font-semibold text-ink">DeviceId:</span> <span className="text-muted">{agentDiagnostic.deviceId || '-'}</span></p>
                <p><span className="font-semibold text-ink">TenantId:</span> <span className="text-muted">{agentDiagnostic.tenantId || '-'}</span></p>
                <p><span className="font-semibold text-ink">BranchId:</span> <span className="text-muted">{agentDiagnostic.branchId || '-'}</span></p>
                <p><span className="font-semibold text-ink">Bulunan yazıcı:</span> <span className="text-muted">{agentDiagnostic.printerCount ?? systemPrinters.length}</span></p>
                <p className="sm:col-span-2 lg:col-span-4"><span className="font-semibold text-ink">Tanı:</span> <span className="text-muted">{agentDiagnostic.lastError || agentActionMessage}</span></p>
              </div>
              {agentNeedsAction ? (
                <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-800">
                  <p className="font-semibold">{agentActionMessage}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={PRINTER_BRIDGE_LATEST_URL}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-white"
                    >
                      <Download className="h-4 w-4" />
                      Printer Bridge’i İndir
                    </a>
                    <button
                      type="button"
                      onClick={() => void scanSystemPrinters()}
                      disabled={printerScanLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-white/50 px-4 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${printerScanLoading ? 'animate-spin' : ''}`} />
                      Yeniden Tara
                    </button>
                    <Link
                      href="/app/login"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-white/50 px-4 text-sm font-semibold text-amber-900"
                    >
                      <LifeBuoy className="h-4 w-4" />
                      Kurulum Yardımı
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-line bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">Sistemde kurulu yazıcılar</p>
                    <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">{systemPrinters.length} bulundu</span>
                  </div>
                  <select value={selectedSystemPrinterName} onChange={(event) => setSelectedSystemPrinterName(event.target.value)} className="mt-3 h-12 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none">
                    <option value="">Yazıcı seç</option>
                    {systemPrinters.map((printer) => (
                      <option key={`${printer.name}-${printer.portName}`} value={printer.name}>
                        {printer.name} · {printer.connectionType === 'network' ? 'Ağ' : 'USB'}{printer.default ? ' · Varsayılan' : ''}
                      </option>
                    ))}
                  </select>
                  {!printerScanLoading && systemPrinters.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700">
                      {agentActionMessage || `Sistem yazıcısı görünmüyor. Yazıcı köprüsünü ve ${getLocalAgentBaseHint()} erişimini kontrol edin.`}
                    </div>
                  ) : null}
                  {selectedSystemPrinter ? (
                    <div className="mt-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                      <p><span className="font-semibold text-ink">Port:</span> {selectedSystemPrinter.portName || '-'}</p>
                      <p className="mt-1"><span className="font-semibold text-ink">Sürücü:</span> {selectedSystemPrinter.driverName || '-'}</p>
                      <p className="mt-1"><span className="font-semibold text-ink">Tip:</span> {selectedSystemPrinter.connectionType === 'network' ? 'Ağ / TCP-IP' : 'USB / Windows kuyruğu'}</p>
                      <p className="mt-1"><span className="font-semibold text-ink">Kaynak:</span> POS bilgisayarı local agent</p>
                    </div>
                  ) : null}
                  <label className="mt-3 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Cihaz tipi</span>
                    <select
                      value={printerDraft.deviceType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setPrinterDraft((current) => ({
                          ...current,
                          deviceType: isPrinterDeviceType(nextType) ? nextType : current.deviceType,
                        }));
                      }}
                      className="mt-2 h-11 w-full rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none"
                    >
                      {printableDeviceTypeOptions.map((deviceType) => (
                        <option key={deviceType} value={deviceType}>{deviceTypeLabels[deviceType]}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={addSelectedSystemPrinter} className="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">
                    Seçili yazıcıyı POS'a ekle
                  </button>
                </div>

                <div className="rounded-3xl border border-line bg-canvas p-4">
                  <p className="font-semibold text-ink">IP ağ yazıcısı ekle</p>
                  <div className="mt-3 grid gap-3">
                    <input value={printerDraft.name} onChange={(event) => setPrinterDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Örn: Mutfak POS Yazıcısı" className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input value={printerDraft.ip} onChange={(event) => setPrinterDraft((current) => ({ ...current, ip: event.target.value }))} placeholder="192.168.1.210" className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none" />
                      <input value={printerDraft.port} onChange={(event) => setPrinterDraft((current) => ({ ...current, port: event.target.value.replace(/[^0-9]/g, '') }))} placeholder="9100" className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input value={printerDraft.role} onChange={(event) => setPrinterDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Mutfak / Bar / Kasa" className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none" />
                      <input value={printerDraft.group} onChange={(event) => setPrinterDraft((current) => ({ ...current, group: event.target.value }))} placeholder="Mutfak hattı" className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none" />
                    </div>
                    <select
                      value={printerDraft.deviceType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setPrinterDraft((current) => ({
                          ...current,
                          deviceType: isPrinterDeviceType(nextType) ? nextType : current.deviceType,
                        }));
                      }}
                      className="h-11 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink outline-none"
                    >
                      <option value="receipt_printer">Fiş yazıcı</option>
                      <option value="kitchen_printer">Mutfak yazıcı</option>
                      <option value="bar_printer">Bar yazıcı</option>
                      <option value="fiscal_pos">Yazar kasa POS (ayrı sistem)</option>
                    </select>
                    <button type="button" onClick={addManualNetworkPrinter} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
                      IP yazıcıyı ekle
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-line bg-canvas p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-ink">Kayıtlı POS yazıcıları</p>
                    <p className="mt-1 text-sm text-muted">Yazıcı ve yazar kasa POS kayıtları burada saklanır.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={selectedPrinterId} onChange={(event) => setSelectedPrinterId(event.target.value)} className="h-10 rounded-2xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none">
                      {integrationState.printerDevices.map((printer, index) => <option key={`${printer.id}-${index}`} value={printer.id}>{printer.name}</option>)}
                    </select>
                    <button type="button" onClick={() => { saveIntegrationState(integrationState); setMessage('Yazıcı ayarları kaydedildi.'); }} className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white">
                      Kaydet
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {integrationState.printerDevices.map((printer, index) => (
                    <div key={`${printer.id}-${index}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accentSoft text-accent"><Printer className="h-4 w-4" /></span>
                        <div>
                          <p className="font-semibold text-ink">{printer.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {printer.connectionType === 'usb' ? `USB · ${printer.systemName ?? printer.portName ?? 'Windows yazıcı kuyruğu'}` : `Ağ · ${printer.ip}:${printer.port || 9100}`} · {printer.role}
                            {printer.agentDeviceId ? ` · Device ${printer.agentDeviceId}` : ''}
                          </p>
                          <p className="mt-1 text-xs text-muted">{deviceTypeLabels[printer.deviceType ?? 'receipt_printer']}</p>
                          {printer.deviceType === 'fiscal_pos' ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">Yazar kasa POS ayrı sistemdir.</p>
                          ) : (
                            <p className="mt-1 text-xs font-semibold text-sky-700">Bu yazıcı sadece fiş yazdırır.</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={printer.deviceType ?? 'receipt_printer'}
                          onChange={(event) => {
                            const nextType = event.target.value;
                            if (!isPrinterDeviceType(nextType)) return;
                            setPrinterDeviceType(printer.id, nextType);
                          }}
                          className="h-8 rounded-full border border-line bg-canvas px-3 text-xs font-semibold text-ink"
                        >
                          <option value="receipt_printer">Fiş yazıcı</option>
                          <option value="kitchen_printer">Mutfak yazıcı</option>
                          <option value="bar_printer">Bar yazıcı</option>
                          <option value="fiscal_pos">Yazar kasa POS</option>
                        </select>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${printer.status === 'Pasif' ? 'bg-slate-500/10 text-slate-600' : 'bg-emerald-500/10 text-emerald-700'}`}>{printer.status}</span>
                        <button
                          type="button"
                          onClick={() => togglePrinterDeviceStatus(printer.id)}
                          className="rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink"
                        >
                          {printer.status === 'Pasif' ? 'Aktif et' : 'Pasife al'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePrinterDevice(printer.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Kaldır
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => void manualReprint()} className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">Test Yazdır</button>
                  <button type="button" onClick={retryFailedJobs} className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">Kuyruğu işle</button>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === 'access' ? (
          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Kullanıcılar</p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">Kullanıcı yönetimi</h2>
                  <p className="mt-1 text-sm text-muted">Kullanıcı oluştur, sil, aktif/pasif yap ve rolünü seç.</p>
                </div>
                <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink">
                  {accessState.users.length} kullanıcı
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <input value={userDraft.name} onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ad soyad" className="h-12 rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                <input value={userDraft.username} onChange={(event) => setUserDraft((current) => ({ ...current, username: event.target.value }))} placeholder="Kullanıcı adı" className="h-12 rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                <input value={userDraft.password} onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Şifre" className="h-12 rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                <select value={userDraft.role} onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))} className="h-12 rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                  {roleOptions.map((role) => <option key={`draft-${role}`} value={role}>{role}</option>)}
                </select>
                <select value={userDraft.branchId} onChange={(event) => setUserDraft((current) => ({ ...current, branchId: event.target.value }))} className="h-12 rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none md:col-span-2">
                  {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
                </select>
                <button type="button" onClick={addUser} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white md:col-span-2">
                  <UserPlus className="h-4 w-4" /> Yeni kullanıcı oluştur
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {accessState.users.map((user) => {
                  const selected = selectedUser?.id === user.id;
                  const branch = branchOptions.find((item) => item.id === user.branchId);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={`w-full rounded-3xl border px-4 py-4 text-left transition ${selected ? 'border-blue-400/50 bg-blue-500/10' : 'border-line bg-canvas hover:border-blue-400/30'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{user.name}</p>
                          <p className="mt-1 text-sm text-muted">@{user.username} · {user.role}</p>
                          <p className="mt-1 text-xs text-muted">{branch?.label ?? 'Şube seçilmedi'}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                          {user.active ? 'Aktif' : 'Pasif'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              {selectedUser ? (
                <>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Seçili kullanıcı</p>
                      <h2 className="mt-2 text-2xl font-semibold text-ink">{selectedUser.name}</h2>
                      <p className="mt-1 text-sm text-muted">Rol, şube, şifre ve özel yetkileri düzenle.</p>
                    </div>
                    <button type="button" onClick={() => deleteUser(selectedUser.id)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" /> Sil
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-muted">Ad soyad</span>
                      <input value={selectedUser.name} onChange={(event) => patchUser(selectedUser.id, { name: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Kullanıcı adı</span>
                      <input value={selectedUser.username} onChange={(event) => patchUser(selectedUser.id, { username: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Şifre</span>
                      <input value={selectedUser.password} onChange={(event) => patchUser(selectedUser.id, { password: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Rol</span>
                      <select value={selectedUser.role} onChange={(event) => patchUser(selectedUser.id, { role: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                        {roleOptions.map((role) => <option key={`selected-${role}`} value={role}>{role}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Şube</span>
                      <select value={selectedUser.branchId} onChange={(event) => patchUser(selectedUser.id, { branchId: event.target.value })} className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 font-semibold text-ink outline-none">
                        {branchOptions.map((branch) => <option key={`selected-${branch.id}`} value={branch.id}>{branch.label}</option>)}
                      </select>
                    </label>
                    <label className="flex h-full min-h-12 items-end">
                      <button type="button" onClick={() => patchUser(selectedUser.id, { active: !selectedUser.active })} className={`h-12 w-full rounded-2xl px-4 text-sm font-semibold text-white ${selectedUser.active ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                        {selectedUser.active ? 'Kullanıcıyı pasifleştir' : 'Kullanıcıyı aktifleştir'}
                      </button>
                    </label>
                  </div>

                  <div className="mt-6 rounded-3xl border border-line bg-canvas p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-ink">Kullanıcı yetkileri</p>
                        <p className="mt-1 text-sm text-muted">Rol yetkisini değiştirebilir veya kullanıcıya özel izin verebilirsin.</p>
                      </div>
                      <button type="button" onClick={() => switchUserRole(selectedUser.role)} className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                        Bu rolü aktif kullanıcı yap
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {permissionOptions.map((permission) => (
                        <label key={permission.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
                          <span className="text-sm font-semibold text-ink">{permission.label}</span>
                          <input type="checkbox" checked={selectedUser.permissions.includes(permission.id)} onChange={() => toggleUserPermission(selectedUser.id, permission.id)} className="h-5 w-5 accent-blue-600" />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-line bg-canvas p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Yeni rol tanımı</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Rol adı" className="h-12 rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none" />
                      <input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} placeholder="Rol açıklaması" className="h-12 rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none" />
                      <button type="button" onClick={addRole} className="h-12 rounded-2xl bg-accent px-5 text-sm font-semibold text-white">Rol kaydet</button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">Düzenlemek için bir kullanıcı seç.</p>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'developer' ? (
          <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">API anahtarları</p>
              <div className="mt-4 space-y-3">
                {integrationState.apiKeys.map((key) => (
                  <div key={key.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{key.name}</p>
                        <p className="mt-1 text-sm text-muted">{key.prefix} · {key.scopes}</p>
                      </div>
                      <button type="button" onClick={() => rotateKey(key.id)} className="inline-flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm font-semibold text-ink">
                        <KeyRound className="h-4 w-4" /> Yenile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Webhook</p>
              <button type="button" onClick={queueWebhookTest} className="mt-4 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">Test webhook gönder</button>
              <div className="mt-4 space-y-2">
                {integrationState.webhookEvents.slice(0, 5).map((event) => (
                  <p key={event.id} className="rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink">{event.event} · {event.status}</p>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}


