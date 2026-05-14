import { getDefaultModulesForPackageType, type PackageModuleKey } from '@/lib/package-access';
import { loadSystemAdminState, type AdminTenant } from '@/lib/system-admin-store';
import type { PackageType } from '@/lib/saas-store';
import type { getPilotOperationsDashboard } from '@/lib/pilot-field/field-validation';
import { recordStructuredLog } from '@/lib/observability/metrics-store';

export type LicenseStatus = 'trial' | 'active' | 'suspended' | 'expired';
export type RemoteDeviceAction =
  | 'printer_restart'
  | 'bridge_restart'
  | 'queue_clear'
  | 'sync_retry'
  | 'device_diagnostics'
  | 'websocket_reconnect'
  | 'remote_config_push';

export type LicensePolicy = {
  tenantId: string;
  status: LicenseStatus;
  modules: PackageModuleKey[];
  printerLimit: number;
  branchLimit: number;
  userLimit: number;
  trialEndsAt?: string;
  expiresAt: string;
  updatedAt: string;
};

export type ProvisionedRestaurant = {
  tenantId: string;
  restaurantName: string;
  packageType: PackageType;
  dealerId?: string;
  createdAt: string;
  onboardingWizard: Array<{ step: string; status: 'pending' | 'completed' }>;
  defaults: {
    roles: string[];
    tables: Array<{ id: string; name: string; area: string }>;
    printers: Array<{ role: string; name: string; protocol: string }>;
    recipes: Array<{ name: string; category: string }>;
  };
  license: LicensePolicy;
};

export type RemoteDeviceCommand = {
  id: string;
  tenantId: string;
  action: RemoteDeviceAction;
  deviceId?: string;
  payload?: Record<string, unknown>;
  status: 'queued' | 'sent' | 'acknowledged' | 'failed';
  requestedBy: string;
  createdAt: string;
  auditId: string;
};

export type SupportSession = {
  id: string;
  tenantId: string;
  requestedBy: string;
  approvedBy?: string;
  status: 'pending_approval' | 'active' | 'expired' | 'revoked';
  permissions: Array<'diagnostics' | 'remote_config' | 'screen_assist' | 'queue_control'>;
  screenAssistHook: string;
  createdAt: string;
  expiresAt: string;
  auditLog: string[];
};

type CommercialState = {
  provisioned: Record<string, ProvisionedRestaurant>;
  licenses: Record<string, LicensePolicy>;
  remoteCommands: RemoteDeviceCommand[];
  supportSessions: SupportSession[];
};

const globalState = globalThis as typeof globalThis & {
  __adisyumCommercialOps?: CommercialState;
};

function nowIso() {
  return new Date().toISOString();
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getState() {
  if (!globalState.__adisyumCommercialOps) {
    globalState.__adisyumCommercialOps = {
      provisioned: {},
      licenses: {},
      remoteCommands: [],
      supportSessions: [],
    };
  }
  return globalState.__adisyumCommercialOps;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function licenseLimits(packageType: PackageType) {
  if (packageType === 'premium') return { printerLimit: 12, branchLimit: 10, userLimit: 80 };
  if (packageType === 'gold') return { printerLimit: 6, branchLimit: 2, userLimit: 25 };
  return { printerLimit: 3, branchLimit: 1, userLimit: 8 };
}

function licenseFor(input: { tenantId: string; packageType: PackageType; trialDays?: number; status?: LicenseStatus }): LicensePolicy {
  const limits = licenseLimits(input.packageType);
  const status = input.status ?? (input.trialDays && input.trialDays > 0 ? 'trial' : 'active');
  return {
    tenantId: input.tenantId,
    status,
    modules: getDefaultModulesForPackageType(input.packageType),
    ...limits,
    trialEndsAt: status === 'trial' ? addDays(input.trialDays ?? 14) : undefined,
    expiresAt: addDays(status === 'trial' ? input.trialDays ?? 14 : 30),
    updatedAt: nowIso(),
  };
}

export function provisionRestaurant(input: {
  restaurantName: string;
  packageType?: PackageType;
  dealerId?: string;
  trialDays?: number;
  tenantId?: string;
}) {
  const state = getState();
  const packageType = input.packageType ?? 'gold';
  const tenantId = input.tenantId || `PILOT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const license = licenseFor({ tenantId, packageType, trialDays: input.trialDays ?? 14 });
  const provisioned: ProvisionedRestaurant = {
    tenantId,
    restaurantName: input.restaurantName.trim(),
    packageType,
    dealerId: input.dealerId,
    createdAt: nowIso(),
    onboardingWizard: [
      { step: 'tenant_created', status: 'completed' },
      { step: 'admin_user_created', status: 'completed' },
      { step: 'starter_tables', status: 'completed' },
      { step: 'starter_printers', status: 'completed' },
      { step: 'starter_recipes', status: 'completed' },
      { step: 'desktop_bridge_install', status: 'pending' },
      { step: 'fiscal_pos_validation', status: 'pending' },
      { step: 'staff_training', status: 'pending' },
    ],
    defaults: {
      roles: ['owner', 'manager', 'waiter', 'cashier', 'kitchen'],
      tables: Array.from({ length: 12 }, (_, index) => ({ id: `T${index + 1}`, name: `Masa ${index + 1}`, area: index < 8 ? 'Salon' : 'Bahce' })),
      printers: [
        { role: 'cashier', name: 'Kasa Yazici', protocol: 'escpos' },
        { role: 'kitchen', name: 'Mutfak Yazici', protocol: 'escpos' },
        { role: 'bar', name: 'Bar Yazici', protocol: 'escpos' },
      ],
      recipes: [
        { name: 'Kofte Porsiyon', category: 'Ana Yemek' },
        { name: 'Ayran', category: 'Icecek' },
        { name: 'Cay', category: 'Icecek' },
      ],
    },
    license,
  };

  state.provisioned[tenantId] = provisioned;
  state.licenses[tenantId] = license;
  recordStructuredLog({ level: 'info', service: 'commercial.provisioning', tenantId, message: 'Restaurant tenant provisioned', context: { packageType, dealerId: input.dealerId } });
  return provisioned;
}

export function upsertLicense(input: {
  tenantId: string;
  packageType?: PackageType;
  status?: LicenseStatus;
  modules?: PackageModuleKey[];
  printerLimit?: number;
  branchLimit?: number;
  userLimit?: number;
  expiresAt?: string;
}) {
  const state = getState();
  const current = state.licenses[input.tenantId] ?? licenseFor({ tenantId: input.tenantId, packageType: input.packageType ?? 'mini', status: input.status ?? 'active' });
  const next: LicensePolicy = {
    ...current,
    status: input.status ?? current.status,
    modules: input.modules ?? current.modules,
    printerLimit: input.printerLimit ?? current.printerLimit,
    branchLimit: input.branchLimit ?? current.branchLimit,
    userLimit: input.userLimit ?? current.userLimit,
    expiresAt: input.expiresAt ?? current.expiresAt,
    updatedAt: nowIso(),
  };
  state.licenses[input.tenantId] = next;
  return next;
}

export function queueRemoteDeviceCommand(input: {
  tenantId: string;
  action: RemoteDeviceAction;
  deviceId?: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
}) {
  const state = getState();
  const command: RemoteDeviceCommand = {
    id: createId('remote-command'),
    tenantId: input.tenantId,
    action: input.action,
    deviceId: input.deviceId,
    payload: input.payload,
    status: 'queued',
    requestedBy: input.requestedBy ?? 'system-admin',
    createdAt: nowIso(),
    auditId: createId('audit'),
  };
  state.remoteCommands.unshift(command);
  state.remoteCommands = state.remoteCommands.slice(0, 500);
  recordStructuredLog({ level: 'warn', service: 'commercial.remote-device', tenantId: input.tenantId, message: `Remote device command queued: ${input.action}`, context: { commandId: command.id, deviceId: input.deviceId } });
  return command;
}

export function createSupportSession(input: {
  tenantId: string;
  requestedBy?: string;
  permissions?: SupportSession['permissions'];
  ttlMinutes?: number;
}) {
  const session: SupportSession = {
    id: createId('support'),
    tenantId: input.tenantId,
    requestedBy: input.requestedBy ?? 'support-agent',
    status: 'pending_approval',
    permissions: input.permissions ?? ['diagnostics', 'screen_assist'],
    screenAssistHook: `/support/screen-assist/${input.tenantId}`,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 60) * 60_000).toISOString(),
    auditLog: ['support_session_created'],
  };
  getState().supportSessions.unshift(session);
  recordStructuredLog({ level: 'info', service: 'commercial.support', tenantId: input.tenantId, message: 'Temporary support session requested', context: { sessionId: session.id, permissions: session.permissions } });
  return session;
}

export function approveSupportSession(sessionId: string, approvedBy = 'tenant-admin') {
  const session = getState().supportSessions.find((item) => item.id === sessionId);
  if (!session) return null;
  session.status = 'active';
  session.approvedBy = approvedBy;
  session.auditLog.push('support_session_approved');
  return session;
}

export function buildInstallerManifest() {
  return {
    product: 'ADISYUM Desktop Bridge',
    version: '1.0.0-commercial',
    signedInstaller: true,
    signedBinaries: true,
    autoUpdate: true,
    startupRegistration: true,
    devicePermissions: ['printer-spooler', 'localhost-api', 'fiscal-sdk', 'serial-port'],
    silentInstall: true,
    healthCheckUrl: 'http://127.0.0.1:4891/health',
    installCommand: 'AdisyumDesktopBridgeSetup.exe /quiet /norestart',
    rollback: true,
  };
}

export function getCommercialOperationsDashboard(input: {
  pilotField?: ReturnType<typeof getPilotOperationsDashboard> | null;
  healthScores?: Array<{ tenantId: string; score: number }>;
} = {}) {
  const state = getState();
  const admin = safeAdminState();
  seedLicensesFromAdmin(admin.tenants);
  const licenses = Object.values(state.licenses);
  const today = Date.now();
  const expiring = licenses.filter((license) => new Date(license.expiresAt).getTime() - today <= 7 * 86400000 && license.status !== 'expired');
  const activeTenants = admin.tenants.filter((tenant) => tenant.status === 'active' || tenant.status === 'demo').length;
  const unhealthyTenants = input.healthScores?.filter((item) => item.score < 75).length ?? input.pilotField?.unhealthyRestaurants ?? 0;
  const revenue = admin.payments.filter((payment) => payment.status === 'success').reduce((sum, payment) => sum + payment.amount, 0);
  const openSupportSessions = state.supportSessions.filter((session) => session.status === 'pending_approval' || session.status === 'active').length;
  const supportMaturityScore = clampScore(82 + Math.min(8, state.supportSessions.length) - Math.min(20, openSupportSessions * 2));
  const resellerReadinessScore = clampScore(70 + Math.min(20, admin.dealers.filter((dealer) => dealer.active).length * 5));
  const deploymentReadinessScore = buildInstallerManifest().signedInstaller ? 88 : 65;
  const fieldOperationsMaturityScore = clampScore(((input.pilotField?.realWorldProductionReadinessScore ?? 85) + supportMaturityScore + deploymentReadinessScore) / 3);
  const commercializationReadinessScore = clampScore((supportMaturityScore + resellerReadinessScore + deploymentReadinessScore + fieldOperationsMaturityScore) / 4);

  return {
    activeTenants,
    unhealthyTenants,
    expiringLicenses: expiring.length,
    failingDevices: input.pilotField?.failingDevices ?? 0,
    pilotRestaurants: input.pilotField?.pilotCount ?? 0,
    revenueMetrics: {
      totalRevenue: revenue,
      successfulPayments: admin.payments.filter((payment) => payment.status === 'success').length,
      pendingInvoices: admin.invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled').length,
    },
    supportMetrics: {
      openSupportSessions,
      queuedRemoteCommands: state.remoteCommands.filter((command) => command.status === 'queued').length,
      recentRemoteCommands: state.remoteCommands.slice(0, 20),
      recentSupportSessions: state.supportSessions.slice(0, 20),
    },
    licenseMetrics: {
      trial: licenses.filter((license) => license.status === 'trial').length,
      active: licenses.filter((license) => license.status === 'active').length,
      suspended: licenses.filter((license) => license.status === 'suspended').length,
      expired: licenses.filter((license) => license.status === 'expired').length,
      expiring: expiring.slice(0, 20),
    },
    resellerMetrics: {
      activeDealers: admin.dealers.filter((dealer) => dealer.active).length,
      tenantsByDealer: admin.dealers.map((dealer) => ({
        dealerId: dealer.id,
        name: dealer.name,
        tenantCount: admin.tenants.filter((tenant) => tenant.dealer_id === dealer.id).length,
        commissionPending: admin.commissions.filter((commission) => commission.dealer_id === dealer.id && commission.status === 'pending').reduce((sum, commission) => sum + commission.amount, 0),
      })),
    },
    installer: buildInstallerManifest(),
    recommendations: buildSupportRecommendations(input.pilotField),
    scores: {
      commercializationReadinessScore,
      supportMaturityScore,
      deploymentReadinessScore,
      resellerReadinessScore,
      fieldOperationsMaturityScore,
    },
    generatedAt: nowIso(),
  };
}

function safeAdminState() {
  try {
    return loadSystemAdminState();
  } catch {
    return {
      packages: [],
      tenants: [],
      dealers: [],
      commissions: [],
      payments: [],
      renewals: [],
      finance: [],
      invoices: [],
      sales: [],
    };
  }
}

function seedLicensesFromAdmin(tenants: AdminTenant[]) {
  const state = getState();
  for (const tenant of tenants) {
    if (!state.licenses[tenant.tenant_id]) {
      state.licenses[tenant.tenant_id] = licenseFor({
        tenantId: tenant.tenant_id,
        packageType: tenant.package_type,
        status: tenant.status === 'demo' ? 'trial' : tenant.status === 'blocked' ? 'suspended' : tenant.status === 'expired' ? 'expired' : 'active',
      });
    }
  }
}

function buildSupportRecommendations(pilotField: ReturnType<typeof getPilotOperationsDashboard> | null | undefined) {
  const recs: Array<{ severity: 'info' | 'warning' | 'critical'; title: string; recommendation: string; tenantId?: string }> = [];
  for (const restaurant of pilotField?.restaurants ?? []) {
    if (restaurant.printStabilityScore < 80) recs.push({ severity: 'warning', tenantId: restaurant.tenantId, title: 'Printer timeout artiyor', recommendation: 'Kitchen/cashier printer kablosu, WiFi sinyali ve ESC/POS retry loglari kontrol edilmeli.' });
    if (restaurant.fiscalReadinessScore < 80) recs.push({ severity: 'critical', tenantId: restaurant.tenantId, title: 'Fiscal latency elevated', recommendation: 'Yazarkasa POS SDK loglari ve vendor baglanti modu dogrulanmali.' });
    if (restaurant.offlineRecoveryScore < 80) recs.push({ severity: 'critical', tenantId: restaurant.tenantId, title: 'Offline recovery risk', recommendation: 'Offline siparis/odeme/sync reconcile testi sahada tekrarlanmali.' });
    if ((restaurant.metrics.websocketReconnects ?? 0) > 10) recs.push({ severity: 'warning', tenantId: restaurant.tenantId, title: 'WiFi instability detected', recommendation: 'Router restart ve access point roaming davranisi incelenmeli.' });
  }
  if (recs.length === 0) {
    recs.push({ severity: 'info', title: 'Commercial operations stable', recommendation: 'Kritik saha riski gorunmuyor; bayi rollout ve lisans yenileme takibi surdurulebilir.' });
  }
  return recs.slice(0, 30);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
