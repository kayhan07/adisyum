import { Prisma, type TenantStatus, type SubscriptionStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { branchTenantBranchKey, roleTenantKey, userTenantUsernameKey } from '@/lib/db/compound-keys';
import { getDefaultModulesForPackageType, type PackageModuleKey } from '@/lib/package-access-core';
import type { PackageType } from '@/lib/saas-store';

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
  initialBalance?: number;
  kontorBalance?: number;
  moduleOverrides?: PackageModuleKey[];
  branchLimit?: number;
  seats?: number;
  createdBy: string;
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

function durationDays(period: ProvisionTenantInput['billingPeriod'], trialDays = 14) {
  if (trialDays > 0) return trialDays;
  if (period === 'yearly') return 365;
  if (period === 'quarterly') return 90;
  return 30;
}

function normalizeTenantStatus(value: ProvisionTenantInput['status'], trialDays: number): TenantStatus {
  if (value === 'suspended') return 'suspended';
  if (value === 'cancelled') return 'expired';
  if (value === 'active') return 'active';
  return trialDays > 0 ? 'trial' : 'active';
}

function normalizeSubscriptionStatus(status: TenantStatus): SubscriptionStatus {
  if (status === 'suspended') return 'past_due';
  if (status === 'expired') return 'canceled';
  if (status === 'trial') return 'trial';
  return 'active';
}

function compactJson(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject;
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
    data: { diagnostics: [...current, serializeDiagnostic(step, status, startedAt, detail)] as Prisma.InputJsonValue },
  });
}

export async function recordProvisioningEvent(jobId: string, event: ProvisioningTraceEvent) {
  return prisma.provisioningJobEvent.create({
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
}

async function recordProvisioningEvents(jobId: string, events: ProvisioningTraceEvent[]) {
  if (!events.length) return [];
  return Promise.all(events.map((event) => recordProvisioningEvent(jobId, event)));
}

export async function createProvisioningJob(input: ProvisionTenantInput) {
  const jobKey = provisioningJobKey(input);
  return prisma.provisioningJob.upsert({
    where: { jobKey },
    update: {
      input: input as Prisma.InputJsonValue,
      requestedBy: input.createdBy,
    },
    create: {
      jobKey,
      targetTenantId: (input.tenantId?.trim() || createTenantId()).toUpperCase(),
      requestedBy: input.createdBy,
      input: input as Prisma.InputJsonValue,
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
  const completed = jobs.filter((job) => job.status === 'completed');
  const durations = completed
    .map((job) => job.startedAt && job.completedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null)
    .filter((duration): duration is number => duration !== null);
  const retries = jobs.filter((job) => job.attemptCount > 1).length;
  const rollbacks = jobs.filter((job) => Boolean(job.rollbackAt)).length;
  return {
    totalJobs: jobs.length,
    completedJobs: completed.length,
    failedJobs: jobs.filter((job) => job.status === 'failed').length,
    activeJobs: jobs.filter((job) => job.status === 'pending' || job.status === 'provisioning').length,
    retryCount: retries,
    rollbackCount: rollbacks,
    successRate: jobs.length ? Math.round((completed.length / jobs.length) * 100) : 0,
    retryRate: jobs.length ? Math.round((retries / jobs.length) * 100) : 0,
    rollbackRate: jobs.length ? Math.round((rollbacks / jobs.length) * 100) : 0,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : 0,
    failuresByStep: failuresByStep.map((row) => ({ step: row.currentStep, count: row._count._all })),
    eventCounts: eventCounts.map((row) => ({ type: row.type, severity: row.severity, count: row._count._all })),
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

  const result = await prisma.$transaction(async (tx) => {
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
        name: input.branchName?.trim() || 'Merkez Sube',
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
      throw new Error(`Ana sube olusturulamadi: ${tenantId}/${branch.branchId}`);
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

    await tx.runtimeState.upsert({
      where: { tenantId_key: { tenantId, key: 'client-runtime:tenant' } },
      update: {
        payload: compactJson({
          'adisyon-company-state': JSON.stringify({ name: tenant.name, legalName: tenant.legalName, taxNumber: tenant.taxNumber }),
        }),
      },
      create: {
        tenantId,
        key: 'client-runtime:tenant',
        payload: compactJson({
          'adisyon-company-state': JSON.stringify({ name: tenant.name, legalName: tenant.legalName, taxNumber: tenant.taxNumber }),
        }),
      },
    });

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

export async function runProvisioningJob(jobId: string) {
  const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Provisioning job bulunamadi.');
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
  if (!job) throw new Error('Provisioning job bulunamadi.');
  const startedAt = Date.now();
  await recordProvisioningEvent(jobId, {
    type: 'rollback_started',
    severity: 'warning',
    message: 'Rollback started.',
    metadata: { targetTenantId: job.targetTenantId },
  });
  await prisma.provisioningJob.update({ where: { id: jobId }, data: { status: 'rollback_pending', currentStep: 'rollback_pending' } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.templatePackImport.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.templateImport.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.runtimeState.deleteMany({ where: { tenantId: job.targetTenantId } });
      await tx.userRole.deleteMany({ where: { tenantId: job.targetTenantId } });
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
      where: { deletedAt: null, tenantId: { not: 'system' } },
      orderBy: { createdAt: 'desc' },
      select: {
        tenantId: true,
        name: true,
        packageType: true,
        status: true,
        mainBranchId: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        branches: { where: { deletedAt: null }, select: { id: true, active: true } },
        users: { where: { deletedAt: null }, select: { id: true, active: true, lastLoginAt: true } },
        subscriptions: {
          where: { deletedAt: null },
          orderBy: { endsAt: 'desc' },
          take: 1,
          select: { id: true, status: true, packageType: true, billingPeriod: true, endsAt: true, seats: true, branchLimit: true, metadata: true },
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

  const ordersByTenant = new Map(ordersToday.map((row) => [row.tenantId, row._count.id]));
  const revenueByTenant = new Map(paymentsToday.map((row) => [row.tenantId, Number(row._sum.amount ?? 0)]));

  return tenants.map((tenant) => {
    const subscription = tenant.subscriptions[0] ?? null;
    const metadata = tenant.metadata && typeof tenant.metadata === 'object' && !Array.isArray(tenant.metadata)
      ? tenant.metadata as Record<string, unknown>
      : {};
    const subscriptionMetadata = subscription?.metadata && typeof subscription.metadata === 'object' && !Array.isArray(subscription.metadata)
      ? subscription.metadata as Record<string, unknown>
      : {};
    return {
      tenantId: tenant.tenantId,
      companyName: tenant.name,
      status: tenant.status,
      plan: subscription?.packageType ?? tenant.packageType,
      billingPeriod: subscription?.billingPeriod ?? 'monthly',
      branchCount: tenant.branches.length,
      activeBranchCount: tenant.branches.filter((branch) => branch.active).length,
      activeUsers: tenant.users.filter((user) => user.active).length,
      lastActivity: tenant.users.map((user) => user.lastLoginAt?.toISOString()).filter(Boolean).sort().at(-1) ?? tenant.updatedAt.toISOString(),
      expiresAt: subscription?.endsAt.toISOString() ?? null,
      subscriptionStatus: subscription?.status ?? 'none',
      balance: Number(metadata.initialBalance ?? subscriptionMetadata.initialBalance ?? 0),
      kontorBalance: Number(metadata.kontorBalance ?? subscriptionMetadata.kontorBalance ?? 0),
      dailyOrders: ordersByTenant.get(tenant.tenantId) ?? 0,
      dailyRevenue: revenueByTenant.get(tenant.tenantId) ?? 0,
      mainBranchId: tenant.mainBranchId,
      createdAt: tenant.createdAt.toISOString(),
    };
  });
}
