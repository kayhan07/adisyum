import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { branchTenantBranchKey, roleTenantKey, subscriptionTenantIdKey, userTenantUsernameKey } from '../lib/db/compound-keys.ts';
import { hashPassword } from '../lib/auth/password.ts';

const DEFAULT_TENANT_ID = process.env.BOOTSTRAP_TENANT_ID || 'ABN-48291';
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

const pool = new Pool({ connectionString: requireDatabaseUrl() });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function ensureTenant(input: {
  tenantId: string;
  name: string;
  branchId: string;
  branchName: string;
  system?: boolean;
}) {
  await prisma.tenant.upsert({
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
  });

  await prisma.branch.upsert({
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
  });

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
    return prisma.subscription.update({
      where: subscriptionTenantIdKey(tenantId, existing.id),
      data: {
        status: 'active',
        packageType: 'premium',
        endsAt,
        seats: 10,
        branchLimit: 10,
        deletedAt: null,
      },
    });
  }

  return prisma.subscription.create({
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
  });
}

async function ensureRole(input: { tenantId: string; key: string; name: string; system?: boolean }) {
  const permissions = ['*'] satisfies Prisma.InputJsonArray;

  return prisma.role.upsert({
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
  });
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
  const permissions = ['*'] satisfies Prisma.InputJsonArray;
  const update = {
    active: true,
    passwordHash,
    role: input.role,
    branchId: input.branchId,
    permissions,
    deletedAt: null,
    metadata: { bootstrap: true, system: Boolean(input.system) },
  } satisfies Prisma.UserUncheckedUpdateInput;
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
  } satisfies Prisma.UserUncheckedCreateInput;

  return prisma.user.upsert({
    where: userTenantUsernameKey(input.tenantId, input.username),
    update,
    create,
  });
}

async function main() {
  await ensureTenant({
    tenantId: DEFAULT_TENANT_ID,
    name: 'Adisyum Production Tenant',
    branchId: DEFAULT_BRANCH_ID,
    branchName: 'Merkez',
  });
  await ensureSubscription(DEFAULT_TENANT_ID, 1);
  await ensureRole({ tenantId: DEFAULT_TENANT_ID, key: 'Admin', name: 'Admin' });
  await ensureUser({
    tenantId: DEFAULT_TENANT_ID,
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

  console.log(`Bootstrap completed. Tenant=${DEFAULT_TENANT_ID}, username=${DEFAULT_USERNAME}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
