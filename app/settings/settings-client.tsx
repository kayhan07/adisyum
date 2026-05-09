'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Code2, KeyRound, PlugZap, Printer, RefreshCw, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { getDefaultCompanyState, loadCompanyState, saveCompanyState, subscribeToCompanyChanges, type CompanyState } from '@/lib/company-store';
import { getDefaultAccessState, loadAccessState, saveAccessState, subscribeToAccessChanges, type AccessUser } from '@/lib/access-store';
import {
  getDefaultIntegrationState,
  loadIntegrationState,
  saveIntegrationState,
  subscribeToIntegrationChanges,
  type PartnerIntegrationRecord,
  type PrintLogRecord,
} from '@/lib/integration-store';
import { getDefaultSessionState, updateSessionUser } from '@/lib/session-store';

type SettingsTab = 'company' | 'integrations' | 'access' | 'developer';
type PrinterConnectionType = 'usb' | 'network';
type SystemPrinter = {
  name: string;
  driverName: string;
  portName: string;
  status: string;
  shared: boolean;
  connectionType: PrinterConnectionType;
  ip: string;
};
type PrinterDraft = {
  name: string;
  role: string;
  ip: string;
  port: string;
  group: string;
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
  { id: 'developer', label: 'Geliştirici', icon: Code2 },
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

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [company, setCompany] = useState<CompanyState>(() => getDefaultCompanyState());
  const [accessState, setAccessState] = useState(() => getDefaultAccessState());
  const [integrationState, setIntegrationState] = useState(() => getDefaultIntegrationState());
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDraft, setUserDraft] = useState<UserDraft>({
    name: '',
    username: '',
    password: '',
    role: 'Garson',
    branchId: 'mrk',
  });
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [selectedSystemPrinterName, setSelectedSystemPrinterName] = useState('');
  const [printerScanLoading, setPrinterScanLoading] = useState(false);
  const [printerAutoScanned, setPrinterAutoScanned] = useState(false);
  const [integrationTestLoadingId, setIntegrationTestLoadingId] = useState('');
  const [printerDraft, setPrinterDraft] = useState<PrinterDraft>({
    name: '',
    role: 'Kasa',
    ip: '',
    port: '9100',
    group: 'Kasa hattı',
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'integrations' || tab === 'access' || tab === 'developer' || tab === 'company') {
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

  function changeTab(tab: SettingsTab) {
    setActiveTab(tab);
    router.replace(`/settings?tab=${tab}`);
  }

  function saveCompany() {
    saveCompanyState(company);
    setMessage('Firma bilgileri kaydedildi.');
  }

  function persistAccess(nextState: ReturnType<typeof loadAccessState>) {
    saveAccessState(nextState);
    setAccessState(nextState);
  }

  function persistIntegration(nextState: ReturnType<typeof loadIntegrationState>) {
    saveIntegrationState(nextState);
    setIntegrationState(nextState);
  }

  function patchPartnerIntegration(id: string, patch: Partial<PartnerIntegrationRecord>) {
    persistIntegration({
      ...integrationState,
      partnerIntegrations: integrationState.partnerIntegrations.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    });
  }

  async function testPartnerIntegration(integration: PartnerIntegrationRecord) {
    setIntegrationTestLoadingId(integration.id);
    setMessage('');

    try {
      const response = await fetch('/api/delivery/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration }),
      });
      const data = await response.json() as { orders?: Array<{ externalId: string }>; error?: string };

      if (!response.ok) {
        setMessage(data.error ?? `${integration.name} bağlantısı kurulamadı.`);
        return;
      }

      patchPartnerIntegration(integration.id, { lastPullAt: new Date().toISOString() });
      setMessage(`${integration.name} bağlantısı başarılı. ${data.orders?.length ?? 0} sipariş okundu.`);
    } catch {
      setMessage(`${integration.name} bağlantı testi başarısız oldu.`);
    } finally {
      setIntegrationTestLoadingId('');
    }
  }

  async function scanSystemPrinters() {
    setPrinterScanLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/printers/system', { cache: 'no-store' });
      const data = await response.json() as { printers?: SystemPrinter[]; error?: string };
      const printers = data.printers ?? [];
      setSystemPrinters(printers);
      setSelectedSystemPrinterName(printers[0]?.name ?? '');
      setMessage(data.error ? `Sistem yazıcıları okunamadı: ${data.error}` : `${printers.length} sistem yazıcısı bulundu.`);
    } catch {
      setMessage('Sistem yazıcıları okunamadı. Next.js sunucusunun POS bilgisayarında çalıştığından emin olun.');
    } finally {
      setPrinterScanLoading(false);
    }
  }

  function addPrinterDevice(device: {
    name: string;
    role: string;
    connectionType: PrinterConnectionType;
    ip?: string;
    port?: number;
    group: string;
    systemName?: string;
    driverName?: string;
    portName?: string;
  }) {
    const trimmedName = device.name.trim();
    if (!trimmedName) return;

    const nextPrinter = {
      id: `prt-${slugify(trimmedName) || Date.now()}-${Date.now()}`,
      name: trimmedName,
      role: device.role.trim() || 'POS Yazıcısı',
      connectionType: device.connectionType,
      systemName: device.systemName,
      driverName: device.driverName,
      portName: device.portName,
      ip: device.connectionType === 'network' ? device.ip ?? '' : '',
      port: device.connectionType === 'network' ? device.port ?? 9100 : 0,
      status: 'Aktif' as const,
      queue: 0,
      retry: '10 sn',
      backup: 'Yok',
      group: device.group.trim() || 'POS hattı',
    };

    persistIntegration({
      ...integrationState,
      printerDevices: [
        nextPrinter,
        ...integrationState.printerDevices.filter((printer) =>
          printer.name !== nextPrinter.name
          && printer.systemName !== nextPrinter.systemName
          && printer.ip !== nextPrinter.ip,
        ),
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

    addPrinterDevice({
      name: selectedSystemPrinter.name,
      role: selectedSystemPrinter.connectionType === 'network' ? 'Ağ POS Yazıcısı' : 'USB POS Yazıcısı',
      connectionType: selectedSystemPrinter.connectionType,
      ip: selectedSystemPrinter.ip,
      port: 9100,
      group: selectedSystemPrinter.connectionType === 'network' ? 'Ağ hattı' : 'USB POS hattı',
      systemName: selectedSystemPrinter.name,
      driverName: selectedSystemPrinter.driverName,
      portName: selectedSystemPrinter.portName,
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
      ip: printerDraft.ip,
      port: Number(printerDraft.port) || 9100,
      group: printerDraft.group,
    });
    setPrinterDraft((current) => ({ ...current, name: '', ip: '', port: '9100' }));
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

    const role = roleOptions.includes(userDraft.role) ? userDraft.role : roleOptions[0] ?? 'Garson';
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
      role: 'Garson',
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

  function manualReprint() {
    const printer = integrationState.printerDevices.find((item) => item.id === selectedPrinterId);
    if (!printer) return;

    const log: PrintLogRecord = {
      id: `manual-${Date.now()}`,
      order: `MANUAL-${Date.now()}`,
      printer: printer.name,
      status: 'Gönderildi',
      time: formatNow(),
      info: 'Ayarlar panelinden manuel yazdırıldı',
    };
    persistIntegration({ ...integrationState, printLogs: [log, ...integrationState.printLogs] });
    setMessage(`${printer.name} için manuel yazdırma kaydı oluşturuldu.`);
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
          <section className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Firma kartı</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">İşletme bilgileri</h2>
              </div>
              <button type="button" onClick={saveCompany} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
                <Save className="h-4 w-4" /> Kaydet
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
                    value={company[key as keyof CompanyState]}
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
            </div>
          </section>
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
                <button type="button" onClick={scanSystemPrinters} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white">
                  <RefreshCw className={`h-4 w-4 ${printerScanLoading ? 'animate-spin' : ''}`} />
                  Sistem yazıcılarını tara
                </button>
              </div>

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
                        {printer.name} · {printer.connectionType === 'network' ? 'Ağ' : 'USB'}
                      </option>
                    ))}
                  </select>
                  {!printerScanLoading && systemPrinters.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700">
                      Sistem yazıcısı görünmüyor. POS bilgisayarında Windows'a yazıcı kurulmuş olmalı ve Next.js sunucusu aynı bilgisayarda çalışmalı.
                    </div>
                  ) : null}
                  {selectedSystemPrinter ? (
                    <div className="mt-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
                      <p><span className="font-semibold text-ink">Port:</span> {selectedSystemPrinter.portName || '-'}</p>
                      <p className="mt-1"><span className="font-semibold text-ink">Sürücü:</span> {selectedSystemPrinter.driverName || '-'}</p>
                      <p className="mt-1"><span className="font-semibold text-ink">Tip:</span> {selectedSystemPrinter.connectionType === 'network' ? 'Ağ / TCP-IP' : 'USB / Windows kuyruğu'}</p>
                    </div>
                  ) : null}
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
                    <button type="button" onClick={addManualNetworkPrinter} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
                      IP yazıcıyı ekle
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-line bg-canvas p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">Kayıtlı POS yazıcıları</p>
                  <select value={selectedPrinterId} onChange={(event) => setSelectedPrinterId(event.target.value)} className="h-10 rounded-2xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none">
                    {integrationState.printerDevices.map((printer, index) => <option key={`${printer.id}-${index}`} value={printer.id}>{printer.name}</option>)}
                  </select>
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
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">{printer.status}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={manualReprint} className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">Manuel yazdır</button>
                  <button type="button" onClick={retryFailedJobs} className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">Kuyruğu işle</button>
                </div>
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-line bg-panel p-5 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Dış servisler ve kuyruk</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Bekleyen" value={queueSummary.waiting} />
                <Stat label="Gönderilen" value={queueSummary.sent} />
                <Stat label="Hatalı" value={queueSummary.failed} />
              </div>
              <div className="mt-4 space-y-3">
                {integrationState.partnerIntegrations.map((integration) => (
                  <div key={integration.id} className="rounded-3xl border border-line bg-canvas px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{integration.name}</p>
                        <p className="mt-1 text-sm text-muted">{integration.type} · {integration.version}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => patchPartnerIntegration(integration.id, {
                            status: integration.status === 'Pasif' ? 'Aktif' : 'Pasif',
                          })}
                          className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-ink"
                        >
                          {integration.status === 'Pasif' ? 'Aktif et' : 'Pasife al'}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchPartnerIntegration(integration.id, {
                            autoImport: integration.autoImport === false,
                            lastPullAt: new Date().toISOString(),
                          })}
                          className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-ink"
                        >
                          {integration.autoImport === false ? 'Oto çek aç' : 'Oto çek kapat'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void testPartnerIntegration(integration)}
                          disabled={integrationTestLoadingId === integration.id}
                          className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {integrationTestLoadingId === integration.id ? 'Test ediliyor' : 'Bağlantıyı test et'}
                        </button>
                        <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">{integration.status}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {integration.autoImport === false ? 'Otomatik sipariş çekimi kapalı.' : 'Sipariş çekimi aktif.'}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm text-muted">
                        <span>Base URL</span>
                        <input
                          value={integration.baseUrl ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { baseUrl: event.target.value })}
                          placeholder="https://api.partner.com"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>Sipariş endpoint</span>
                        <input
                          value={integration.ordersPath ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { ordersPath: event.target.value })}
                          placeholder="/orders veya /suppliers/{sellerId}/orders"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>Kimlik doğrulama</span>
                        <select
                          value={integration.authType ?? 'bearer'}
                          onChange={(event) => patchPartnerIntegration(integration.id, { authType: event.target.value as PartnerIntegrationRecord['authType'] })}
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        >
                          <option value="basic">Basic</option>
                          <option value="bearer">Bearer</option>
                          <option value="apiKey">API Key</option>
                        </select>
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>İstek tipi</span>
                        <select
                          value={integration.method ?? 'GET'}
                          onChange={(event) => patchPartnerIntegration(integration.id, { method: event.target.value as PartnerIntegrationRecord['method'] })}
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                        </select>
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>Kullanıcı adı / client id</span>
                        <input
                          value={integration.username ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { username: event.target.value })}
                          placeholder="Kullanıcı adı"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>Şifre / secret</span>
                        <input
                          type="password"
                          value={integration.password ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { password: event.target.value })}
                          placeholder="Şifre veya secret"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>API key / token</span>
                        <input
                          value={integration.apiKey ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { apiKey: event.target.value })}
                          placeholder="API key veya access token"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>API secret</span>
                        <input
                          type="password"
                          value={integration.apiSecret ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { apiSecret: event.target.value })}
                          placeholder="API secret"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>Seller / mağaza kodu</span>
                        <input
                          value={integration.sellerId ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { sellerId: event.target.value, storeId: event.target.value })}
                          placeholder="Seller veya mağaza kodu"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-muted">
                        <span>API key header</span>
                        <input
                          value={integration.apiKeyHeader ?? ''}
                          onChange={(event) => patchPartnerIntegration(integration.id, { apiKeyHeader: event.target.value })}
                          placeholder="Authorization veya X-API-Key"
                          className="h-11 w-full rounded-2xl border border-line bg-panel px-4 font-semibold text-ink outline-none"
                        />
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      Son çekim: {integration.lastPullAt ? new Date(integration.lastPullAt).toLocaleString('tr-TR') : 'Henüz çekim yapılmadı'}
                    </p>
                  </div>
                ))}
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


