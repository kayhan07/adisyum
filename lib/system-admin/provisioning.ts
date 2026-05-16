import { Prisma, type TenantStatus, type SubscriptionStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { branchTenantBranchKey, roleTenantKey, userTenantUsernameKey } from '@/lib/db/compound-keys';
import { getDefaultModulesForPackageType, type PackageModuleKey } from '@/lib/package-access';
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

type ProvisionTenantInput = {
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

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { tenantId }, select: { tenantId: true } });
    if (existing) {
      throw new Error(`Tenant zaten mevcut: ${tenantId}`);
    }

    const tenant = await tx.tenant.create({
      data: {
        tenantId,
        name: input.companyName.trim(),
        legalName: input.legalName?.trim() || null,
        taxNumber: input.taxNumber?.trim() || null,
        packageType,
        status,
        mainBranchId: branchId,
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

    await tx.tenant.update({
      where: { tenantId },
      data: { mainBranchId: branch.branchId },
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
  };
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
