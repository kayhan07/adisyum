import { Prisma } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { branchTenantBranchKey, roleTenantKey, userTenantUsernameKey } from '@/lib/db/compound-keys';
import { getDefaultModulesForPackageType, type PackageModuleKey } from '@/lib/package-access-core';
import type { PackageType } from '@/lib/saas-store';
import { recordOperationalEvent } from '@/lib/operations/live-ops';

type TenantStatusLike = 'trial' | 'active' | 'suspended' | 'expired' | 'blocked' | 'demo' | 'cancelled';
type SubscriptionStatusLike = 'trial' | 'active' | 'past_due' | 'canceled' | 'suspended' | 'expired' | 'demo' | 'cancelled';
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant_admin: [
    'orders.create',
    'orders.update',
    'orders.pay',
    'products.manage',
    'stock.manage',
    'reports.view',
    'settings.manage',
    'users.manage',
  ],
  cashier: ['orders.create', 'orders.update', 'orders.pay', 'reports.view'],
  waiter: ['orders.create', 'orders.update'],
  kitchen: ['kds.view', 'orders.update'],
  accountant: ['reports.view', 'finance.manage', 'invoices.manage'],
};

export type ProvisionTenantInput = {
  tenantId?: string;
  companyName: string;
  legalName?: string;
  taxNumber?: string;
  packageType?: PackageType;
  billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
  status?: 'trial' | 'active' | 'suspended' | 'cancelled';
  trialDays?: number;
  startsAt?: string;
  endsAt?: string;
  branchId?: string;
  branchName?: string;
  adminUsername?: string;
  adminPassword?: string;
  adminName?: string;
  adminEmail?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  address?: string;
  notes?: string;
  initialBalance?: number;
  kontorBalance?: number;
  moduleOverrides?: PackageModuleKey[];
  branchLimit?: number;
  seats?: number;
  createdBy: string;
};

export type TenantManagementInput =
  | {
      action: 'update_subscription';
      tenantId: string;
      startsAt?: string;
      endsAt?: string;
      addDays?: number;
      addMonths?: number;
      addYears?: number;
      unlimitedLicense?: boolean;
      status?: SubscriptionStatusLike;
      billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
      packageType?: PackageType;
      requestedBy: string;
    }
  | {
      action: 'update_password';
      tenantId: string;
      username?: string;
      password?: string;
      temporaryPassword?: string;
      forcePasswordChange?: boolean;
      requestedBy: string;
    }
  | {
      action: 'update_tenant_info';
      tenantId: string;
      companyName?: string;
      legalName?: string;
      taxNumber?: string;
      phone?: string;
      email?: string;
      contactName?: string;
      address?: string;
      notes?: string;
      requestedBy: string;
    }
  | {
      action: 'update_user_status';
      tenantId: string;
      username?: string;
      active: boolean;
      requestedBy: string;
    }
  | {
      action: 'soft_delete_tenant';
      tenantId: string;
      confirmationTenantId: string;
      requestedBy: string;
    }
  | {
      action: 'restore_tenant';
      tenantId: string;
      status?: TenantStatusLike | 'disabled';
      requestedBy: string;
    }
  | {
      action: 'integration_action';
      tenantId: string;
      operation: 'clear_printer_mappings' | 'refresh_bridge_registration' | 'send_test_print';
      requestedBy: string;
    }
  | {
      action: 'update_status';
      tenantId: string;
      status: TenantStatusLike | 'disabled';
      requestedBy: string;
    };

export type ProvisioningJobState =
  | 'pending'
  | 'provisioning'
  | 'branch_created'
  | 'subscription_created'
  | 'admin_created'
  | 'templates_imported'
  | 'completed'
  | 'failed'
  | 'rollback_pending'
  | 'rolled_back';

export type ProvisioningEventSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ProvisioningTraceEvent = {
  type: string;
  severity?: ProvisioningEventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  source?: string;
};

function createTenantId() {
  return `TNT-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function durationDays(period: ProvisionTenantInput['billingPeriod'], trialDays = 14) {
  if (trialDays > 0) return trialDays;
  if (period === 'yearly') return 365;
  if (period === 'quarterly') return 90;
  return 30;
}

function normalizeTenantStatus(value: ProvisionTenantInput['status'], trialDays: number): TenantStatusLike {
  if (value === 'suspended') return 'suspended';
  if (value === 'cancelled') return 'expired';
  if (value === 'active') return 'active';
  return trialDays > 0 ? 'trial' : 'active';
}

function normalizeSubscriptionStatus(status: TenantStatusLike): SubscriptionStatusLike {
  if (status === 'suspended') return 'past_due';
  if (status === 'expired') return 'canceled';
  if (status === 'blocked') return 'suspended';
  if (status === 'trial') return 'trial';
  return 'active';
}

function compactJson(input: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as JsonObject;
}

function licenseLimits(packageType: PackageType) {
  if (packageType === 'premium') return { printerLimit: 12, branchLimit: 10, userLimit: 80 };
  if (packageType === 'gold') return { printerLimit: 6, branchLimit: 3, userLimit: 25 };
  return { printerLimit: 3, branchLimit: 1, userLimit: 8 };
}

function defaultTenantSettings(packageType: PackageType, modules: PackageModuleKey[]) {
  const limits = licenseLimits(packageType);
  return compactJson({
    modules,
    license: {
      status: 'active',
      modules,
      ...limits,
    },
    posDefaults: {
      vatRate: 10,
      currency: 'TRY',
      timezone: 'Europe/Istanbul',
      tableMode: 'db-authoritative',
    },
    printerDefaults: {
      cashier: 'Kasa Yazicisi',
      kitchen: 'Mutfak Yazicisi',
      bar: 'Bar Yazicisi',
      protocol: 'escpos',
    },
    onboarding: {
      tenantCreated: true,
      branchCreated: true,
      adminUserCreated: true,
      defaultsSeeded: false,
      templatePoolAvailable: true,
      importedTemplateCount: 0,
      desktopBridgeInstalled: false,
      fiscalValidationCompleted: false,
    },
  });
}

function logProvisioningStep(step: string, payload: Record<string, unknown>) {
  console.info('[tenant-provisioning]', {
    timestamp: new Date().toISOString(),
    step,
    ...payload,
  });
}

function provisioningJobKey(input: ProvisionTenantInput) {
  return `tenant:${(input.tenantId?.trim() || input.companyName.trim()).toUpperCase()}`;
}

function normalizeConflictValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

async function assertTenantProvisioningConflicts(input: ProvisionTenantInput) {
  const tenantId = input.tenantId?.trim().toUpperCase() || null;
  const companyName = normalizeConflictValue(input.companyName);
  const taxNumber = normalizeConflictValue(input.taxNumber);
  const adminEmail = normalizeConflictValue(input.adminEmail);

  const [tenantConflict, emailConflict] = await Promise.all([
    prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(tenantId ? [{ tenantId }] : []),
          ...(companyName ? [{ name: { equals: input.companyName.trim(), mode: 'insensitive' } }] : []),
          ...(taxNumber ? [{ taxNumber: { equals: input.taxNumber?.trim(), mode: 'insensitive' } }] : []),
        ],
      },
      select: { tenantId: true, name: true, taxNumber: true },
    }),
    adminEmail
      ? prisma.user.findFirst({
          where: {
            deletedAt: null,
            email: { equals: input.adminEmail?.trim(), mode: 'insensitive' },
            tenantId: { not: 'system' },
          },
          select: { tenantId: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  if (tenantConflict) {
    throw new Error(`Tenant cakismasi: ${tenantConflict.tenantId} / ${tenantConflict.name}`);
  }
  if (emailConflict) {
    throw new Error(`Tenant admin e-posta cakismasi: ${emailConflict.email}`);
  }
}

function serializeDiagnostic(step: string, status: 'ok' | 'failed', startedAt: number, detail?: Record<string, unknown>) {
  return {
    step,
    status,
    durationMs: Date.now() - startedAt,
    at: new Date().toISOString(),
    ...(detail ?? {}),
  };
}

async function appendJobDiagnostic(jobId: string, step: string, status: 'ok' | 'failed', startedAt: number, detail?: Record<string, unknown>) {
  const job = await prisma.provisioningJob.findUnique({ where: { id: jobId }, select: { diagnostics: true } });
  const current = Array.isArray(job?.diagnostics) ? job.diagnostics : [];
  await prisma.provisioningJob.update({
    where: { id: jobId },
    data: { diagnostics: [...current, serializeDiagnostic(step, status, startedAt, detail)] as JsonValue },
  });
}

export async function recordProvisioningEvent(jobId: string, event: ProvisioningTraceEvent) {
  const created = await prisma.provisioningJobEvent.create({
    data: {
      jobId,
      type: event.type,
      severity: event.severity ?? 'info',
      message: event.message,
      metadata: compactJson(event.metadata ?? {}),
      durationMs: event.durationMs,
      source: event.source ?? 'provisioning-engine',
    },
  });
  await recordOperationalEvent({
    tenantId: typeof event.metadata?.tenantId === 'string' ? event.metadata.tenantId : null,
    type: `onboarding.${event.type}`,
    severity: event.severity,
    message: event.message,
    entity: 'provisioning_job',
    entityId: jobId,
    source: event.source ?? 'provisioning-engine',
    metadata: event.metadata,
  }).catch(() => undefined);
  return created;
}

async function recordProvisioningEvents(jobId: string, events: ProvisioningTraceEvent[]) {
  if (!events.length) return [];
  return Promise.all(events.map((event) => recordProvisioningEvent(jobId, event)));
}

export async function createProvisioningJob(input: ProvisionTenantInput) {
  await assertTenantProvisioningConflicts(input);
  const jobKey = provisioningJobKey(input);
  return prisma.provisioningJob.upsert({
    where: { jobKey },
    update: {
      input: input as JsonValue,
      requestedBy: input.createdBy,
    },
    create: {
      jobKey,
      targetTenantId: (input.tenantId?.trim() || createTenantId()).toUpperCase(),
      requestedBy: input.createdBy,
      input: input as JsonValue,
    },
  });
}

export async function listProvisioningJobs() {
  return prisma.provisioningJob.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      events: {
        orderBy: { createdAt: 'desc' },
        take: 80,
      },
    },
  });
}

export async function getProvisioningMetrics() {
  const [jobs, failuresByStep, eventCounts] = await Promise.all([
    prisma.provisioningJob.findMany({
      select: {
        status: true,
        attemptCount: true,
        startedAt: true,
        completedAt: true,
        rollbackAt: true,
      },
    }),
    prisma.provisioningJob.groupBy({
      by: ['currentStep'],
      where: { status: 'failed' },
      _count: { _all: true },
    }),
    prisma.provisioningJobEvent.groupBy({
      by: ['type', 'severity'],
      _count: { _all: true },
    }),
  ]);
  const completed = jobs.filter((job: { status: string }) => job.status === 'completed');
  const durations = completed
    .map((job: { startedAt: Date | null; completedAt: Date | null }) => job.startedAt && job.completedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null)
    .filter((duration: number | null): duration is number => duration !== null);
  const retries = jobs.filter((job: { attemptCount: number }) => job.attemptCount > 1).length;
  const rollbacks = jobs.filter((job: { rollbackAt: Date | null }) => Boolean(job.rollbackAt)).length;
  return {
    totalJobs: jobs.length,
    completedJobs: completed.length,
    failedJobs: jobs.filter((job: { status: string }) => job.status === 'failed').length,
    activeJobs: jobs.filter((job: { status: string }) => job.status === 'pending' || job.status === 'provisioning').length,
    retryCount: retries,
    rollbackCount: rollbacks,
    successRate: jobs.length ? Math.round((completed.length / jobs.length) * 100) : 0,
    retryRate: jobs.length ? Math.round((retries / jobs.length) * 100) : 0,
    rollbackRate: jobs.length ? Math.round((rollbacks / jobs.length) * 100) : 0,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum: number, duration: number) => sum + duration, 0) / durations.length) : 0,
    failuresByStep: failuresByStep.map((row: { currentStep: string | null; _count: { _all: number } }) => ({ step: row.currentStep, count: row._count._all })),
    eventCounts: eventCounts.map((row: { type: string; severity: string; _count: { _all: number } }) => ({ type: row.type, severity: row.severity, count: row._count._all })),
  };
}

export async function provisionTenant(input: ProvisionTenantInput) {
  const packageType = input.packageType ?? 'gold';
  const trialDays = Math.max(0, Number(input.trialDays ?? 14));
  const now = input.startsAt ? new Date(input.startsAt) : new Date();
  const endsAt = input.endsAt ? new Date(input.endsAt) : addDays(now, durationDays(input.billingPeriod, trialDays));
  const tenantId = (input.tenantId?.trim() || createTenantId()).toUpperCase();
  const branchId = input.branchId?.trim() || 'mrk';
  const adminUsername = input.adminUsername?.trim() || 'admin';
  const adminPassword = input.adminPassword?.trim() || `Adisyum-${Math.random().toString(36).slice(2, 8)}!`;
  const modules = input.moduleOverrides?.length ? input.moduleOverrides : getDefaultModulesForPackageType(packageType);
  const status = normalizeTenantStatus(input.status, trialDays);
  const subscriptionStatus = normalizeSubscriptionStatus(status);
  const limits = licenseLimits(packageType);
  const passwordHash = await hashPassword(adminPassword);
  const trace: ProvisioningTraceEvent[] = [];

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.tenant.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        name: true,
        status: true,
        mainBranchId: true,
        branches: { select: { branchId: true }, take: 1 },
        users: { where: { username: adminUsername }, select: { id: true }, take: 1 },
        subscriptions: { select: { id: true, endsAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (existing) {
      const branch = existing.branches[0];
      const adminUser = existing.users[0];
      const subscription = existing.subscriptions[0];
      if (existing.mainBranchId && branch && adminUser && subscription) {
        logProvisioningStep('idempotent-retry-hit', { tenantId });
        trace.push({
          type: 'idempotent_retry_hit',
          severity: 'warning',
          message: 'Provisioning retry reused an already complete tenant graph.',
          metadata: { tenantId },
        });
        return {
          tenant: { tenantId: existing.tenantId, name: existing.name, status: existing.status },
          branch: { branchId: branch.branchId },
          roles: [],
          adminUser: { id: adminUser.id },
          subscription,
          idempotent: true,
        };
      }
      throw new Error(`Tenant zaten mevcut fakat eksik provisioning durumunda: ${tenantId}`);
    }

    const tenant = await tx.tenant.create({
      data: {
        tenantId,
        name: input.companyName.trim(),
        legalName: input.legalName?.trim() || null,
        taxNumber: input.taxNumber?.trim() || null,
        packageType,
        status,
        mainBranchId: null,
        settings: defaultTenantSettings(packageType, modules),
        metadata: compactJson({
          provisionedBy: input.createdBy,
          provisionedAt: new Date().toISOString(),
          billingPeriod: input.billingPeriod ?? 'monthly',
          phone: input.phone?.trim() || undefined,
          email: input.email?.trim() || input.adminEmail?.trim() || undefined,
          contactName: input.contactName?.trim() || input.adminName?.trim() || undefined,
          address: input.address?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          initialBalance: input.initialBalance ?? 0,
          kontorBalance: input.kontorBalance ?? 0,
          source: 'system-admin-control-center',
        }),
      },
    });
    logProvisioningStep('tenant-created', { tenantId, mainBranchId: tenant.mainBranchId });
    trace.push({
      type: 'tenant_created',
      message: 'Tenant created.',
      metadata: { tenantId, mainBranchId: tenant.mainBranchId },
    });

    const branch = await tx.branch.create({
      data: {
        tenantId,
        branchId,
        name: input.branchName?.trim() || 'Merkez Şube',
        code: branchId,
        active: true,
        metadata: compactJson({
          default: true,
          provisionedAt: new Date().toISOString(),
          timezone: 'Europe/Istanbul',
        }),
      },
    });
    logProvisioningStep('branch-created', { tenantId, branchId: branch.branchId, branchRecordId: branch.id });
    trace.push({
      type: 'branch_created',
      message: 'Default branch provisioned.',
      metadata: { tenantId, branchId: branch.branchId, branchRecordId: branch.id },
    });

    const createdBranch = await tx.branch.findUnique({
      where: branchTenantBranchKey(tenantId, branch.branchId),
      select: { tenantId: true, branchId: true },
    });
    if (!createdBranch) {
      throw new Error(`Ana şube oluşturulamadı: ${tenantId}/${branch.branchId}`);
    }

    const tenantWithMainBranch = await tx.tenant.update({
      where: { tenantId },
      data: { mainBranchId: branch.branchId },
    });
    logProvisioningStep('tenant-main-branch-updated', {
      tenantId,
      mainBranchId: tenantWithMainBranch.mainBranchId,
    });
    trace.push({
      type: 'main_branch_assigned',
      message: 'Tenant main branch assigned.',
      metadata: { tenantId, mainBranchId: tenantWithMainBranch.mainBranchId },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId,
        packageType,
        status: subscriptionStatus,
        billingPeriod: input.billingPeriod ?? 'monthly',
        startsAt: now,
        trialEndsAt: trialDays > 0 ? addDays(now, trialDays) : null,
        endsAt,
        seats: input.seats ?? limits.userLimit,
        branchLimit: input.branchLimit ?? limits.branchLimit,
        metadata: compactJson({
          modules,
          initialBalance: input.initialBalance ?? 0,
          kontorBalance: input.kontorBalance ?? 0,
          printerLimit: limits.printerLimit,
          provisionedBy: input.createdBy,
          source: 'system-admin-control-center',
        }),
      },
    });
    logProvisioningStep('subscription-created', {
      tenantId,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    });
    trace.push({
      type: 'subscription_created',
      message: 'Subscription activated.',
      metadata: { tenantId, subscriptionId: subscription.id, subscriptionStatus: subscription.status },
    });

    const roles = await Promise.all(
      Object.entries(ROLE_PERMISSIONS).map(([key, permissions]) =>
        tx.role.upsert({
          where: roleTenantKey(tenantId, key),
          update: { permissions, system: true },
          create: {
            tenantId,
            key,
            name: key.replaceAll('_', ' '),
            permissions,
            system: true,
          },
        }),
      ),
    );
    logProvisioningStep('roles-created', { tenantId, roleKeys: roles.map((role) => role.key) });
    trace.push({
      type: 'roles_created',
      message: 'Tenant roles created.',
      metadata: { tenantId, roleKeys: roles.map((role) => role.key) },
    });

    const adminUser = await tx.user.upsert({
      where: userTenantUsernameKey(tenantId, adminUsername),
      update: {
        active: true,
        passwordHash,
        role: 'tenant_admin',
        branchId,
        permissions: ROLE_PERMISSIONS.tenant_admin,
        metadata: compactJson({ provisionedAt: new Date().toISOString(), resetRequired: true }),
      },
      create: {
        tenantId,
        branchId,
        username: adminUsername,
        email: input.adminEmail?.trim() || null,
        name: input.adminName?.trim() || 'Tenant Admin',
        passwordHash,
        role: 'tenant_admin',
        permissions: ROLE_PERMISSIONS.tenant_admin,
        active: true,
        metadata: compactJson({ provisionedAt: new Date().toISOString(), resetRequired: true }),
      },
    });
    logProvisioningStep('admin-user-created', {
      tenantId,
      userId: adminUser.id,
      username: adminUsername,
      branchId,
    });
    trace.push({
      type: 'admin_created',
      message: 'Tenant admin user created.',
      metadata: { tenantId, userId: adminUser.id, username: adminUsername, branchId },
    });

    const tenantAdminRole = roles.find((role) => role.key === 'tenant_admin');
    if (tenantAdminRole) {
      await tx.userRole.create({
        data: {
          tenantId,
          userId: adminUser.id,
          roleId: tenantAdminRole.id,
        },
      });
    }

    await writeAuditLog({
      tenantId,
      userId: input.createdBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({
        packageType,
        branchId,
        adminUsername,
        subscriptionId: subscription.id,
        source: 'system-admin-control-center',
      }),
      db: tx,
    });

    return { tenant, branch, roles, adminUser, subscription };
  });

  return {
    tenantId,
    companyName: result.tenant.name,
    packageType,
    status: result.tenant.status,
    branchId: result.branch.branchId,
    adminUsername,
    adminPassword,
    subscriptionId: result.subscription.id,
    endsAt: result.subscription.endsAt.toISOString(),
    modules,
    idempotent: Boolean('idempotent' in result && result.idempotent),
    trace,
  };
}

async function assertProvisionedTenantCleanStart(tenantId: string) {
  const checks = await Promise.all([
    prisma.productCategory.count({ where: { tenantId } }).then((count: number) => ['productCategory', count] as const),
    prisma.product.count({ where: { tenantId } }).then((count: number) => ['product', count] as const),
    prisma.recipe.count({ where: { tenantId } }).then((count: number) => ['recipe', count] as const),
    prisma.stockMovement.count({ where: { tenantId } }).then((count: number) => ['stockMovement', count] as const),
    prisma.cashRegister.count({ where: { tenantId } }).then((count: number) => ['cashRegister', count] as const),
    prisma.cashTransaction.count({ where: { tenantId } }).then((count: number) => ['cashTransaction', count] as const),
    prisma.currentAccountMovement.count({ where: { tenantId } }).then((count: number) => ['currentAccountMovement', count] as const),
    prisma.order.count({ where: { tenantId } }).then((count: number) => ['order', count] as const),
    prisma.payment.count({ where: { tenantId } }).then((count: number) => ['payment', count] as const),
    prisma.printer.count({ where: { tenantId } }).then((count: number) => ['printer', count] as const),
    prisma.runtimeState.count({ where: { tenantId } }).then((count: number) => ['runtimeState', count] as const),
    prisma.tenantPrintJob.count({ where: { tenantId } }).then((count: number) => ['tenantPrintJob', count] as const),
    prisma.tenantDeviceRegistry.count({ where: { tenantId } }).then((count: number) => ['tenantDeviceRegistry', count] as const),
    prisma.report.count({ where: { tenantId } }).then((count: number) => ['report', count] as const),
  ]);
  const dirty = checks.filter(([, count]) => count > 0);
  if (dirty.length > 0) {
    throw new Error(`Tenant clean-start validation failed: ${dirty.map(([name, count]) => `${name}=${count}`).join(', ')}`);
  }
}

export async function runProvisioningJob(jobId: string) {
  const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Provisioning job bulunamadı.');
  if (job.status === 'completed') return job;
  const input = job.input as unknown as ProvisionTenantInput;
  if (job.attemptCount > 0) {
    await recordProvisioningEvent(jobId, {
      type: 'retry_started',
      severity: 'warning',
      message: 'Provisioning retry started.',
      metadata: { attempt: job.attemptCount + 1, targetTenantId: job.targetTenantId },
    });
  }
  await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      status: 'provisioning',
      currentStep: 'provisioning',
      attemptCount: { increment: 1 },
      startedAt: new Date(),
      failureReason: null,
    },
  });
  const startedAt = Date.now();
  try {
    const provisioned = await provisionTenant({ ...input, tenantId: job.targetTenantId });
    if (!provisioned.idempotent) {
      await assertProvisionedTenantCleanStart(provisioned.tenantId);
    }
    await recordProvisioningEvents(jobId, provisioned.trace);
    await appendJobDiagnostic(jobId, 'completed', 'ok', startedAt, { tenantId: provisioned.tenantId, idempotent: provisioned.idempotent });
    await recordProvisioningEvent(jobId, {
      type: job.attemptCount > 0 ? 'retry_completed' : 'provisioning_completed',
      message: job.attemptCount > 0 ? 'Provisioning retry completed.' : 'Provisioning completed.',
      metadata: { tenantId: provisioned.tenantId, idempotent: provisioned.idempotent },
      durationMs: Date.now() - startedAt,
    });
    return prisma.provisioningJob.update({
      where: { id: jobId },
      data: { status: 'completed', currentStep: 'completed', completedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendJobDiagnostic(jobId, 'failed', 'failed', startedAt, { reason: message });
    await prisma.provisioningJob.update({
      where: { id: jobId },
      data: { status: 'failed', currentStep: 'failed', failedAt: new Date(), failureReason: message },
    });
    await recordProvisioningEvent(jobId, {
      type: 'provisioning_failed',
      severity: 'error',
      message: 'Provisioning failed.',
      metadata: { reason: message, targetTenantId: job.targetTenantId },
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function rollbackProvisioningJob(jobId: string) {
  const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Provisioning job bulunamadı.');
  const startedAt = Date.now();
  await recordProvisioningEvent(jobId, {
    type: 'rollback_started',
    severity: 'warning',
    message: 'Rollback started.',
    metadata: { targetTenantId: job.targetTenantId },
  });
  await prisma.provisioningJob.update({ where: { id: jobId }, data: { status: 'rollback_pending', currentStep: 'rollback_pending' } });
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.tenantPrintJob.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.tenantDeviceRegistry.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.templatePackImport.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.templateImport.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.orderItem.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.payment.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.order.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.recipeItem.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.recipe.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.productRevision.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.productVariant.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.mediaAsset.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.product.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.productCategory.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.stockMovement.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.stockItem.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.cashTransaction.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.cashRegister.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.customer.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.supplier.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.report.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.printer.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.printerGroup.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.runtimeState.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.userRole.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.userPermission.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.rolePermission.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.permission.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.user.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.role.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.subscription.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.branch.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.tenant.deleteMany({ where: { tenantId: job.targetTenantId } });
    });
    await appendJobDiagnostic(jobId, 'rollback', 'ok', startedAt);
    await recordProvisioningEvent(jobId, {
      type: 'rollback_completed',
      severity: 'warning',
      message: 'Rollback completed.',
      metadata: { targetTenantId: job.targetTenantId },
      durationMs: Date.now() - startedAt,
    });
    return prisma.provisioningJob.update({
      where: { id: jobId },
      data: { status: 'rolled_back', currentStep: 'rolled_back', rollbackAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendJobDiagnostic(jobId, 'rollback', 'failed', startedAt, { reason: message });
    await recordProvisioningEvent(jobId, {
      type: 'rollback_failed',
      severity: 'critical',
      message: 'Rollback failed.',
      metadata: { targetTenantId: job.targetTenantId, reason: message },
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function listSaasTenants() {
  const [tenants, ordersToday, paymentsToday] = await Promise.all([
    prisma.tenant.findMany({
      where: { tenantId: { not: 'system' } },
      orderBy: { createdAt: 'desc' },
      select: {
        tenantId: true,
        name: true,
        packageType: true,
        status: true,
        mainBranchId: true,
        metadata: true,
        legalName: true,
        taxNumber: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        branches: { where: { deletedAt: null }, select: { id: true, active: true } },
        users: { where: { deletedAt: null }, select: { id: true, active: true, username: true, email: true, role: true, lastLoginAt: true, metadata: true, updatedAt: true } },
        subscriptions: {
          where: { deletedAt: null },
          orderBy: { endsAt: 'desc' },
          take: 1,
          select: { id: true, status: true, packageType: true, billingPeriod: true, startsAt: true, endsAt: true, seats: true, branchLimit: true, metadata: true, updatedAt: true },
        },
      },
    }),
    prisma.order.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: new Date(new Date().toDateString()) } },
      _count: { id: true },
    }),
    prisma.payment.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: new Date(new Date().toDateString()) }, status: 'paid' },
      _sum: { amount: true },
    }),
  ]);

  const ordersByTenant = new Map(ordersToday.map((row: { tenantId: string; _count: { id: number } }) => [row.tenantId, row._count.id]));
  const revenueByTenant = new Map(paymentsToday.map((row: { tenantId: string; _sum: { amount: number | null } }) => [row.tenantId, Number(row._sum.amount ?? 0)]));
  const tenantIds = tenants.map((tenant: { tenantId: string }) => tenant.tenantId);
  const forensicCounts = await Promise.all(
    tenantIds.map(async (tenantId: string) => {
      const [
        productCount,
        categoryCount,
        stockCount,
        recipeCount,
        tableCount,
        orderCount,
        paymentCount,
        salesTotal,
        customerCount,
        supplierCount,
        cashRegisterCount,
        cashTransactionCount,
        reportCount,
        printerCount,
        runtimeSnapshotCount,
        lastOrder,
        lastPayment,
      ] = await Promise.all([
        prisma.product.count({ where: { tenantId, deletedAt: null } }),
        prisma.productCategory.count({ where: { tenantId, deletedAt: null } }),
        prisma.stockItem.count({ where: { tenantId } }),
        prisma.recipe.count({ where: { tenantId } }),
        prisma.posTable.count({ where: { tenantId } }),
        prisma.order.count({ where: { tenantId } }),
        prisma.payment.count({ where: { tenantId } }),
        prisma.payment.aggregate({ where: { tenantId, status: 'paid' }, _sum: { amount: true } }),
        prisma.customer.count({ where: { tenantId } }),
        prisma.supplier.count({ where: { tenantId } }),
        prisma.cashRegister.count({ where: { tenantId } }),
        prisma.cashTransaction.count({ where: { tenantId } }),
        prisma.report.count({ where: { tenantId } }),
        prisma.printer.count({ where: { tenantId } }),
        prisma.runtimeState.count({ where: { tenantId } }),
        prisma.order.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.payment.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ]);
      return [
        tenantId,
        {
          productCount,
          categoryCount,
          stockCount,
          recipeCount,
          tableCount,
          orderCount,
          paymentCount,
          salesTotal: Number(salesTotal._sum.amount ?? 0),
          currentAccountCount: customerCount + supplierCount,
          cashRecordCount: cashRegisterCount + cashTransactionCount,
          reportCount,
          printerCount,
          runtimeSnapshotCount,
          lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
          lastPaymentAt: lastPayment?.createdAt.toISOString() ?? null,
        },
      ] as const;
    }),
  );
  const countsByTenant = new Map<string, {
    productCount: number;
    categoryCount: number;
    stockCount: number;
    recipeCount: number;
    tableCount: number;
    orderCount: number;
    paymentCount: number;
    salesTotal: number;
    currentAccountCount: number;
    cashRecordCount: number;
    reportCount: number;
    printerCount: number;
    runtimeSnapshotCount: number;
    lastOrderAt: string | null;
    lastPaymentAt: string | null;
  }>(forensicCounts);

  return tenants.map((tenant: {
    tenantId: string;
    name: string;
    legalName: string | null;
    taxNumber: string | null;
    status: string;
    deletedAt: Date | null;
    packageType: string;
    subscriptions: Array<{ id: string; packageType: string; billingPeriod: string; startsAt: Date; updatedAt: Date; endsAt: Date; status: string; metadata: JsonValue | null }>;
    metadata: JsonValue | null;
    users: Array<{ username: string; role: string; email: string | null; active: boolean; metadata: JsonValue | null; updatedAt: Date; lastLoginAt: Date | null }>;
    branches: Array<{ active: boolean }>;
    mainBranchId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) => {
    const subscription = tenant.subscriptions[0] ?? null;
    const metadata = tenant.metadata && typeof tenant.metadata === 'object' && !Array.isArray(tenant.metadata)
      ? tenant.metadata as Record<string, unknown>
      : {};
    const subscriptionMetadata = subscription?.metadata && typeof subscription.metadata === 'object' && !Array.isArray(subscription.metadata)
      ? subscription.metadata as Record<string, unknown>
      : {};
    const counts = countsByTenant.get(tenant.tenantId);
    const adminUser = tenant.users.find((user: { username: string }) => user.username === 'admin') ?? tenant.users.find((user: { role: string }) => user.role.toLowerCase() === 'admin') ?? tenant.users[0] ?? null;
    return {
      tenantId: tenant.tenantId,
      companyName: tenant.name,
      legalName: tenant.legalName,
      taxNumber: tenant.taxNumber,
      status: tenant.status,
      deletedAt: tenant.deletedAt?.toISOString() ?? null,
      plan: subscription?.packageType ?? tenant.packageType,
      billingPeriod: subscription?.billingPeriod ?? 'monthly',
      subscriptionId: subscription?.id ?? null,
      startsAt: subscription?.startsAt.toISOString() ?? null,
      subscriptionUpdatedAt: subscription?.updatedAt.toISOString() ?? null,
      unlimitedLicense: subscriptionMetadata.unlimitedLicense === true,
      adminEmail: adminUser?.email ?? null,
      adminUsername: adminUser?.username ?? null,
      adminActive: adminUser?.active ?? false,
      adminPasswordResetRequired: metadataObject(adminUser?.metadata).resetRequired === true,
      adminUpdatedAt: adminUser?.updatedAt.toISOString() ?? null,
      branchCount: tenant.branches.length,
      activeBranchCount: tenant.branches.filter((branch: { active: boolean }) => branch.active).length,
      activeUsers: tenant.users.filter((user: { active: boolean }) => user.active).length,
      lastActivity: tenant.users.map((user: { lastLoginAt: Date | null }) => user.lastLoginAt?.toISOString()).filter(Boolean).sort().at(-1) ?? tenant.updatedAt.toISOString(),
      lastLogin: tenant.users.map((user: { lastLoginAt: Date | null }) => user.lastLoginAt?.toISOString()).filter(Boolean).sort().at(-1) ?? null,
      expiresAt: subscription?.endsAt.toISOString() ?? null,
      subscriptionStatus: subscription?.status ?? 'none',
      balance: Number(metadata.initialBalance ?? subscriptionMetadata.initialBalance ?? 0),
      kontorBalance: Number(metadata.kontorBalance ?? subscriptionMetadata.kontorBalance ?? 0),
      phone: String(metadata.phone ?? ''),
      email: String(metadata.email ?? ''),
      contactName: String(metadata.contactName ?? ''),
      address: String(metadata.address ?? ''),
      notes: String(metadata.notes ?? ''),
      dailyOrders: ordersByTenant.get(tenant.tenantId) ?? 0,
      dailyRevenue: revenueByTenant.get(tenant.tenantId) ?? 0,
      mainBranchId: tenant.mainBranchId,
      createdAt: tenant.createdAt.toISOString(),
      productCount: counts?.productCount ?? 0,
      categoryCount: counts?.categoryCount ?? 0,
      stockCount: counts?.stockCount ?? 0,
      recipeCount: counts?.recipeCount ?? 0,
      tableCount: counts?.tableCount ?? 0,
      orderCount: counts?.orderCount ?? 0,
      paymentCount: counts?.paymentCount ?? 0,
      salesTotal: counts?.salesTotal ?? 0,
      currentAccountCount: counts?.currentAccountCount ?? 0,
      cashRecordCount: counts?.cashRecordCount ?? 0,
      reportCount: counts?.reportCount ?? 0,
      printerCount: counts?.printerCount ?? 0,
      runtimeSnapshotCount: counts?.runtimeSnapshotCount ?? 0,
      lastOrderAt: counts?.lastOrderAt ?? null,
      lastPaymentAt: counts?.lastPaymentAt ?? null,
      databaseFootprint: Object.entries(counts ?? {}).reduce((sum, [, value]) => sum + (typeof value === 'number' ? value : 0), 0),
    };
  });
}

function jsonSafe<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

export async function exportTenantData(tenantIdInput: string) {
  const tenantId = tenantIdInput.trim().toUpperCase();
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId },
    select: { tenantId: true, name: true, legalName: true, taxNumber: true, packageType: true, status: true, settings: true, metadata: true },
  });
  if (!tenant) throw new Error('Tenant bulunamadı.');
  const [products, categories, recipes, recipeItems, stock, stockMovements, customers, suppliers, printers, printerGroups] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.productCategory.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.recipe.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.recipeItem.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.stockItem.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.stockMovement.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.supplier.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.printer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.printerGroup.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
  ]);

  return jsonSafe({
    exportedAt: new Date().toISOString(),
    tenant,
    products: { categories, products },
    recipes: { recipes, recipeItems },
    stock: { items: stock, movements: stockMovements },
    cari: { customers, suppliers },
    settings: { tenantSettings: tenant.settings, printers, printerGroups },
  });
}

function metadataObject(input: JsonValue | null | undefined): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

export async function updateTenantSubscription(input: Extract<TenantManagementInput, { action: 'update_subscription' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const tenant = await prisma.tenant.findUnique({ where: { tenantId }, select: { tenantId: true, packageType: true, deletedAt: true } });
  if (!tenant) throw new Error('Tenant bulunamadı.');
  if (tenant.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');

  const current = await prisma.subscription.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: { endsAt: 'desc' },
  });
  if (!current) throw new Error('Tenant subscription bulunamadı.');

  let nextEndsAt = current.endsAt;
  if (input.endsAt) {
    nextEndsAt = new Date(input.endsAt);
    if (Number.isNaN(nextEndsAt.getTime())) throw new Error('Gecersiz abonelik bitis tarihi.');
  }
  if (input.unlimitedLicense) nextEndsAt = new Date('9999-12-31T23:59:59.000Z');
  if (Number(input.addDays ?? 0)) nextEndsAt = addDays(nextEndsAt, Number(input.addDays));
  if (Number(input.addMonths ?? 0)) nextEndsAt = addMonths(nextEndsAt, Number(input.addMonths));
  if (Number(input.addYears ?? 0)) nextEndsAt = addYears(nextEndsAt, Number(input.addYears));

  const packageType = (input.packageType ?? current.packageType) as PackageType;
  const nextStatus = input.status ?? (nextEndsAt >= new Date() || input.unlimitedLicense ? 'active' : current.status);
  const limits = licenseLimits(packageType);
  const unlimitedLicense = input.unlimitedLicense === true
    ? true
    : input.unlimitedLicense === false
      ? false
      : metadataObject(current.metadata).unlimitedLicense === true;
  const metadata = compactJson({
    ...metadataObject(current.metadata),
    unlimitedLicense,
    lastSystemAdminUpdateAt: new Date().toISOString(),
    lastSystemAdminUpdatedBy: input.requestedBy,
  });

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const subscription = await tx.subscription.update({
      where: { tenantId_id: { tenantId, id: current.id } },
      data: {
        packageType,
        status: nextStatus,
        billingPeriod: input.billingPeriod ?? current.billingPeriod,
        startsAt: input.startsAt ? new Date(input.startsAt) : current.startsAt,
        endsAt: nextEndsAt,
        branchLimit: current.branchLimit ?? limits.branchLimit,
        seats: current.seats ?? limits.userLimit,
        metadata,
      },
    });
    await tx.tenant.update({
      where: { tenantId },
      data: {
        packageType,
        status: subscription.status === 'trial' ? 'trial' : subscription.status === 'suspended' || subscription.status === 'past_due' ? 'suspended' : subscription.status === 'expired' || subscription.status === 'canceled' ? 'expired' : 'active',
      },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'subscription',
      entityId: current.id,
      metadata: compactJson({ actionName: 'system_admin_subscription_update', packageType, status: subscription.status, endsAt: subscription.endsAt.toISOString() }),
      db: tx,
    });
    return subscription;
  });

  return updated;
}

export async function updateTenantPassword(input: Extract<TenantManagementInput, { action: 'update_password' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  const username = input.username?.trim() || 'admin';
  const password = input.temporaryPassword?.trim() || input.password?.trim();
  if (!tenantId || !username || (!password && input.forcePasswordChange === undefined)) throw new Error('tenantId, username ve password zorunludur.');
  const tenant = await prisma.tenant.findUnique({ where: { tenantId }, select: { deletedAt: true } });
  if (!tenant) throw new Error('Tenant bulunamadı.');
  if (tenant.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');
  const user = await prisma.user.findUnique({ where: userTenantUsernameKey(tenantId, username) });
  if (!user || user.deletedAt) throw new Error('Kullanıcı bulunamadı.');
  const passwordHash = password ? await hashPassword(password) : user.passwordHash;
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.user.update({
      where: userTenantUsernameKey(tenantId, username),
      data: {
        passwordHash,
        active: true,
        metadata: compactJson({
          ...metadataObject(user.metadata),
          resetRequired: input.forcePasswordChange ?? Boolean(input.temporaryPassword),
          passwordUpdatedAt: new Date().toISOString(),
          passwordUpdatedBy: input.requestedBy,
        }),
      },
      select: { id: true, tenantId: true, username: true, active: true, metadata: true },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'user',
      entityId: user.id,
      metadata: compactJson({ actionName: 'system_admin_password_update', username, forcePasswordChange: input.forcePasswordChange ?? Boolean(input.temporaryPassword) }),
      db: tx,
    });
    return updated;
  });
}

export async function updateTenantInfo(input: Extract<TenantManagementInput, { action: 'update_tenant_info' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
  if (!tenant) throw new Error('Tenant bulunamadı.');
  if (tenant.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');
  const metadata = metadataObject(tenant.metadata);
  const nextMetadata = compactJson({
    ...metadata,
    phone: input.phone?.trim() ?? metadata.phone,
    email: input.email?.trim() ?? metadata.email,
    contactName: input.contactName?.trim() ?? metadata.contactName,
    address: input.address?.trim() ?? metadata.address,
    notes: input.notes?.trim() ?? metadata.notes,
    profileUpdatedAt: new Date().toISOString(),
    profileUpdatedBy: input.requestedBy,
  });
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.tenant.update({
      where: { tenantId },
      data: {
        name: input.companyName?.trim() || tenant.name,
        legalName: input.legalName === undefined ? tenant.legalName : input.legalName.trim() || null,
        taxNumber: input.taxNumber === undefined ? tenant.taxNumber : input.taxNumber.trim() || null,
        metadata: nextMetadata,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({ actionName: 'system_admin_tenant_info_update' }),
      db: tx,
    });
    return updated;
  });
}

export async function updateTenantUserStatus(input: Extract<TenantManagementInput, { action: 'update_user_status' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  const username = input.username?.trim() || 'admin';
  const tenant = await prisma.tenant.findUnique({ where: { tenantId }, select: { deletedAt: true } });
  if (!tenant) throw new Error('Tenant bulunamadı.');
  if (tenant.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');
  const user = await prisma.user.findUnique({ where: userTenantUsernameKey(tenantId, username) });
  if (!user || user.deletedAt) throw new Error('Kullanıcı bulunamadı.');
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.user.update({
      where: userTenantUsernameKey(tenantId, username),
      data: {
        active: input.active,
        metadata: compactJson({
          ...metadataObject(user.metadata),
          lockedBySystemAdmin: !input.active,
          statusUpdatedAt: new Date().toISOString(),
          statusUpdatedBy: input.requestedBy,
        }),
      },
      select: { id: true, tenantId: true, username: true, active: true, metadata: true },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'user',
      entityId: user.id,
      metadata: compactJson({ actionName: 'system_admin_user_status_update', username, active: input.active }),
      db: tx,
    });
    return updated;
  });
}

export async function updateTenantStatus(input: Extract<TenantManagementInput, { action: 'update_status' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  const status = (input.status === 'disabled' ? 'blocked' : input.status) as TenantStatusLike;
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const existing = await prisma.tenant.findUnique({ where: { tenantId }, select: { deletedAt: true } });
  if (!existing) throw new Error('Tenant bulunamadı.');
  if (existing.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const latestSubscription = await tx.subscription.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: { endsAt: 'desc' },
      select: { id: true, endsAt: true },
    });
    const tenant = await tx.tenant.update({
      where: { tenantId },
      data: { status },
    });
    await tx.subscription.updateMany({
      where: { tenantId, deletedAt: null },
      data: {
        status: normalizeSubscriptionStatus(status),
        ...(status === 'active' && latestSubscription && latestSubscription.endsAt < new Date()
          ? { endsAt: addDays(new Date(), 30) }
          : {}),
      },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({ actionName: 'system_admin_tenant_status_update', status }),
      db: tx,
    });
    return tenant;
  });
}

export async function softDeleteTenant(input: Extract<TenantManagementInput, { action: 'soft_delete_tenant' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  if (!tenantId || input.confirmationTenantId.trim().toUpperCase() !== tenantId) {
    throw new Error('Abone silme için abone kodu doğrulaması zorunludur.');
  }
  const existing = await prisma.tenant.findUnique({ where: { tenantId }, select: { tenantId: true, deletedAt: true, metadata: true } });
  if (!existing) throw new Error('Tenant bulunamadı.');
  if (existing.deletedAt) throw new Error('Tenant zaten silinmiş durumda.');
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const deletedAt = new Date();
    const tenant = await tx.tenant.update({
      where: { tenantId },
      data: {
        status: 'blocked',
        deletedAt,
        metadata: compactJson({
          ...metadataObject(existing.metadata),
          deletedAt: deletedAt.toISOString(),
          deletedBy: input.requestedBy,
        }),
      },
    });
    await tx.subscription.updateMany({ where: { tenantId, deletedAt: null }, data: { status: 'suspended' } });
    await tx.session.updateMany({ where: { tenantId, revokedAt: null }, data: { revokedAt: deletedAt } });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({ actionName: 'system_admin_tenant_soft_delete', deletedAt: deletedAt.toISOString() }),
      db: tx,
    });
    return tenant;
  });
}

export async function restoreTenant(input: Extract<TenantManagementInput, { action: 'restore_tenant' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const status = (input.status === 'disabled' ? 'blocked' : input.status ?? 'suspended') as TenantStatusLike;
  const existing = await prisma.tenant.findUnique({ where: { tenantId }, select: { tenantId: true, deletedAt: true, metadata: true } });
  if (!existing) throw new Error('Tenant bulunamadı.');
  if (!existing.deletedAt) throw new Error('Tenant zaten aktif listede.');
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tenant = await tx.tenant.update({
      where: { tenantId },
      data: {
        status,
        deletedAt: null,
        metadata: compactJson({
          ...metadataObject(existing.metadata),
          restoredAt: new Date().toISOString(),
          restoredBy: input.requestedBy,
        }),
      },
    });
    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({ actionName: 'system_admin_tenant_restore', status }),
      db: tx,
    });
    return tenant;
  });
}

export async function runTenantIntegrationAction(input: Extract<TenantManagementInput, { action: 'integration_action' }>) {
  const tenantId = input.tenantId.trim().toUpperCase();
  if (!tenantId) throw new Error('tenantId zorunludur.');
  const existing = await prisma.tenant.findUnique({ where: { tenantId }, select: { tenantId: true, deletedAt: true } });
  if (!existing) throw new Error('Tenant bulunamadı.');
  if (existing.deletedAt) throw new Error('Silinmiş tenant üzerinde bu işlem yapılamaz.');

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let affected = 0;
    if (input.operation === 'clear_printer_mappings') {
      const result = await tx.printer.updateMany({
        where: { tenantId, active: true },
        data: { active: false },
      });
      affected = result.count;
    }

    if (input.operation === 'refresh_bridge_registration') {
      affected = await tx.deviceHeartbeat.count({ where: { tenantId, deviceType: { contains: 'bridge' } } });
    }

    if (input.operation === 'send_test_print') {
      affected = await tx.deviceHeartbeat.count({ where: { tenantId, deviceType: { contains: 'printer' } } });
    }

    await writeAuditLog({
      tenantId,
      userId: input.requestedBy,
      action: 'system_admin_action',
      entity: 'tenant',
      entityId: tenantId,
      metadata: compactJson({ actionName: 'system_admin_integration_action', operation: input.operation, affected }),
      db: tx,
    });

    return { tenantId, operation: input.operation, affected };
  });
}





