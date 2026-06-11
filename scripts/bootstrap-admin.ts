import { PrismaClient } from '@prisma/client';

type JsonArrayLike = (string | number | boolean | null | Record<string, unknown>)[];
type UserUpdateData = {
  active?: boolean;
  passwordHash?: string;
  role?: string;
  branchId?: string;
  permissions?: JsonArrayLike;
  deletedAt?: Date | null;
  metadata?: Record<string, unknown>;
};
type UserCreateData = {
  tenantId: string;
  username: string;
  name: string;
  passwordHash: string;
  role: string;
  branchId: string;
  active?: boolean;
  permissions?: JsonArrayLike;
  metadata?: Record<string, unknown>;
};
import { createRequire } from 'node:module';
import { branchTenantBranchKey, roleTenantKey, subscriptionTenantIdKey, userTenantUsernameKey } from '../lib/db/compound-keys.ts';
import { hashPassword } from '../lib/auth/password.ts';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const DEFAULT_TENANT_ID = process.env.BOOTSTRAP_TENANT_ID;
const DEFAULT_USERNAME = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
const DEFAULT_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || '1234';
const DEFAULT_BRANCH_ID = process.env.BOOTSTRAP_BRANCH_ID || 'mrk';
const SYSTEM_TENANT_ID = 'system';
const SYSTEM_BRANCH_ID = 'system';

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  if (/\$\{?DATABASE_URL\}?/.test(databaseUrl)) {
    throw new Error('DATABASE_URL appears to reference itself. Fix .env.production before bootstrapping.');
  }
  return databaseUrl;
}

requireDatabaseUrl();
if (!DEFAULT_TENANT_ID) {
  throw new Error('BOOTSTRAP_TENANT_ID is required. Refusing to create a demo fallback tenant.');
}
const BOOTSTRAP_TENANT_ID = DEFAULT_TENANT_ID;
const prisma = new PrismaClient();

function log(message: string, detail?: unknown) {
  if (detail === undefined) {
    console.log(`[bootstrap-admin] ${message}`);
    return;
  }
  console.log(`[bootstrap-admin] ${message}`, JSON.stringify(detail));
}

async function ensureTenant(input: {
  tenantId: string;
  name: string;
  branchId: string;
  branchName: string;
  system?: boolean;
}) {
  const tenant = await prisma.tenant.upsert({
    where: { tenantId: input.tenantId },
    update: {
      status: 'active',
      packageType: 'premium',
      deletedAt: null,
    },
    create: {
      tenantId: input.tenantId,
      name: input.name,
      packageType: 'premium',
      status: 'active',
      mainBranchId: null,
      metadata: { bootstrap: true, system: Boolean(input.system) },
    },
    select: { tenantId: true, status: true, packageType: true, mainBranchId: true },
  });
  log('tenant ready', tenant);

  const branch = await prisma.branch.upsert({
    where: branchTenantBranchKey(input.tenantId, input.branchId),
    update: {
      name: input.branchName,
      active: true,
      deletedAt: null,
    },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      name: input.branchName,
      code: input.branchId,
      active: true,
      metadata: { bootstrap: true, system: Boolean(input.system) },
    },
    select: { tenantId: true, branchId: true, active: true },
  });
  log('branch ready', branch);

  await prisma.tenant.update({
    where: { tenantId: input.tenantId },
    data: { mainBranchId: input.branchId },
  });
}

async function ensureSubscription(tenantId: string, years = 1) {
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setFullYear(endsAt.getFullYear() + years);

  const existing = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['active', 'trial', 'demo'] }, endsAt: { gte: now } },
    orderBy: { endsAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    const subscription = await prisma.subscription.update({
      where: subscriptionTenantIdKey(tenantId, existing.id),
      data: {
        status: 'active',
        packageType: 'premium',
        endsAt,
        seats: 10,
        branchLimit: 10,
        deletedAt: null,
      },
      select: { id: true, tenantId: true, status: true, packageType: true, endsAt: true },
    });
    log('subscription updated', subscription);
    return subscription;
  }

  const subscription = await prisma.subscription.create({
    data: {
      tenantId,
      packageType: 'premium',
      status: 'active',
      startsAt: now,
      endsAt,
      seats: 10,
      branchLimit: 10,
      metadata: { bootstrap: true },
    },
    select: { id: true, tenantId: true, status: true, packageType: true, endsAt: true },
  });
  log('subscription created', subscription);
  return subscription;
}

async function ensureRole(input: { tenantId: string; key: string; name: string; system?: boolean }) {
  const permissions = ['*'] satisfies JsonArrayLike;

  const role = await prisma.role.upsert({
    where: roleTenantKey(input.tenantId, input.key),
    update: {
      name: input.name,
      permissions,
      system: Boolean(input.system),
      deletedAt: null,
    },
    create: {
      tenantId: input.tenantId,
      key: input.key,
      name: input.name,
      permissions,
      system: Boolean(input.system),
      metadata: { bootstrap: true },
    },
    select: { tenantId: true, key: true, system: true },
  });
  log('role ready', role);
  return role;
}

async function ensureUser(input: {
  tenantId: string;
  branchId: string;
  username: string;
  name: string;
  role: string;
  plainPassword: string;
  system?: boolean;
}) {
  const passwordHash = await hashPassword(input.plainPassword);
  const permissions = ['*'] satisfies JsonArrayLike;
  const update = {
    active: true,
    passwordHash,
    role: input.role,
    branchId: input.branchId,
    permissions,
    deletedAt: null,
    metadata: { bootstrap: true, system: Boolean(input.system) },
  } satisfies UserUpdateData;
  const create = {
    tenantId: input.tenantId,
    username: input.username,
    name: input.name,
    passwordHash,
    role: input.role,
    branchId: input.branchId,
    active: true,
    permissions,
    metadata: { bootstrap: true, system: Boolean(input.system) },
  } satisfies UserCreateData;

  const user = await prisma.user.upsert({
    where: userTenantUsernameKey(input.tenantId, input.username),
    update,
    create,
    select: { id: true, tenantId: true, username: true, role: true, branchId: true, active: true, passwordHash: true },
  });
  log('user ready', {
    id: user.id,
    tenantId: user.tenantId,
    username: user.username,
    role: user.role,
    branchId: user.branchId,
    active: user.active,
    passwordHashPrefix: user.passwordHash.split('$').slice(0, 2).join('$'),
  });
  return user;
}

async function main() {
  await ensureTenant({
    tenantId: BOOTSTRAP_TENANT_ID,
    name: 'Adisyum Production Tenant',
    branchId: DEFAULT_BRANCH_ID,
    branchName: 'Merkez',
  });
  await ensureSubscription(BOOTSTRAP_TENANT_ID, 1);
  await ensureRole({ tenantId: BOOTSTRAP_TENANT_ID, key: 'Admin', name: 'Admin' });
  await ensureUser({
    tenantId: BOOTSTRAP_TENANT_ID,
    branchId: DEFAULT_BRANCH_ID,
    username: DEFAULT_USERNAME,
    name: 'Admin',
    role: 'Admin',
    plainPassword: DEFAULT_PASSWORD,
  });

  await ensureTenant({
    tenantId: SYSTEM_TENANT_ID,
    name: 'Adisyum System Administration',
    branchId: SYSTEM_BRANCH_ID,
    branchName: 'System Administration',
    system: true,
  });
  await ensureSubscription(SYSTEM_TENANT_ID, 10);
  await ensureRole({ tenantId: SYSTEM_TENANT_ID, key: 'super_admin', name: 'Super Admin', system: true });
  await ensureUser({
    tenantId: SYSTEM_TENANT_ID,
    branchId: SYSTEM_BRANCH_ID,
    username: DEFAULT_USERNAME,
    name: 'System Admin',
    role: 'super_admin',
    plainPassword: DEFAULT_PASSWORD,
    system: true,
  });

  console.log(`Bootstrap completed. Tenant=${BOOTSTRAP_TENANT_ID}, username=${DEFAULT_USERNAME}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
