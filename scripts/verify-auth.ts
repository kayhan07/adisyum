import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { branchTenantBranchKey, roleTenantKey, subscriptionTenantIdKey, userTenantUsernameKey } from '../lib/db/compound-keys.ts';
import { hashPassword, verifyPassword } from '../lib/auth/password.ts';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd(), true);

const TENANT_ID = process.env.AUTH_VERIFY_TENANT_ID || process.env.BOOTSTRAP_TENANT_ID || 'ABN-48291';
const BRANCH_ID = process.env.AUTH_VERIFY_BRANCH_ID || process.env.BOOTSTRAP_BRANCH_ID || 'mrk';
const USERNAME = process.env.AUTH_VERIFY_USERNAME || process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_VERIFY_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || '1234';
const SYSTEM_TENANT_ID = 'system';
const SYSTEM_BRANCH_ID = 'system';
const BASE_URL = (process.env.AUTH_VERIFY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (/\$\{?DATABASE_URL\}?/.test(databaseUrl)) {
    throw new Error('DATABASE_URL appears to reference itself.');
  }
  return databaseUrl;
}

const pool = new Pool({ connectionString: requireDatabaseUrl() });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function log(message: string, detail?: unknown) {
  if (detail === undefined) {
    console.log(`[auth-verify] ${message}`);
    return;
  }
  console.log(`[auth-verify] ${message}`, JSON.stringify(detail));
}

async function ensureTenant(input: { tenantId: string; branchId: string; name: string; branchName: string; system?: boolean }) {
  const tenant = await prisma.tenant.upsert({
    where: { tenantId: input.tenantId },
    update: { status: 'active', packageType: 'premium', deletedAt: null },
    create: {
      tenantId: input.tenantId,
      name: input.name,
      packageType: 'premium',
      status: 'active',
      mainBranchId: null,
      metadata: { bootstrap: true, authVerify: true, system: Boolean(input.system) },
    },
    select: { tenantId: true, status: true, packageType: true, mainBranchId: true },
  });

  const branch = await prisma.branch.upsert({
    where: branchTenantBranchKey(input.tenantId, input.branchId),
    update: { name: input.branchName, active: true, deletedAt: null },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      name: input.branchName,
      code: input.branchId,
      active: true,
      metadata: { bootstrap: true, authVerify: true, system: Boolean(input.system) },
    },
    select: { tenantId: true, branchId: true, active: true },
  });

  await prisma.tenant.update({
    where: { tenantId: input.tenantId },
    data: { mainBranchId: input.branchId },
  });

  log('tenant/branch ready', { tenant, branch });
}

async function ensureSubscription(tenantId: string, years: number) {
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
      data: { status: 'active', packageType: 'premium', endsAt, seats: 10, branchLimit: 10, deletedAt: null },
      select: { id: true, tenantId: true, status: true, packageType: true, endsAt: true },
    });
    log('subscription repaired', subscription);
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
      metadata: { bootstrap: true, authVerify: true },
    },
    select: { id: true, tenantId: true, status: true, packageType: true, endsAt: true },
  });
  log('subscription created', subscription);
  return subscription;
}

async function ensureRole(input: { tenantId: string; key: string; name: string; system?: boolean }) {
  const role = await prisma.role.upsert({
    where: roleTenantKey(input.tenantId, input.key),
    update: { name: input.name, permissions: ['*'], system: Boolean(input.system), deletedAt: null },
    create: {
      tenantId: input.tenantId,
      key: input.key,
      name: input.name,
      permissions: ['*'],
      system: Boolean(input.system),
      metadata: { bootstrap: true, authVerify: true },
    },
    select: { tenantId: true, key: true, system: true },
  });
  log('role ready', role);
}

async function ensureUser(input: {
  tenantId: string;
  branchId: string;
  username: string;
  name: string;
  role: string;
  password: string;
  system?: boolean;
}) {
  const existing = await prisma.user.findUnique({
    where: userTenantUsernameKey(input.tenantId, input.username),
    select: { id: true, tenantId: true, username: true, active: true, role: true, branchId: true, passwordHash: true },
  });
  const passwordResult = existing ? await verifyPassword(input.password, existing.passwordHash) : { valid: false, needsRehash: false };
  const shouldRepair = !existing || !existing.active || existing.role !== input.role || existing.branchId !== input.branchId || !passwordResult.valid || passwordResult.needsRehash;
  const passwordHash = shouldRepair ? await hashPassword(input.password) : existing.passwordHash;

  const data = {
    active: true,
    passwordHash,
    role: input.role,
    branchId: input.branchId,
    permissions: ['*'] satisfies Prisma.InputJsonArray,
    deletedAt: null,
    metadata: { bootstrap: true, authVerify: true, system: Boolean(input.system) },
  } satisfies Prisma.UserUncheckedUpdateInput;

  const user = await prisma.user.upsert({
    where: userTenantUsernameKey(input.tenantId, input.username),
    update: data,
    create: {
      tenantId: input.tenantId,
      username: input.username,
      name: input.name,
      passwordHash,
      role: input.role,
      branchId: input.branchId,
      active: true,
      permissions: ['*'],
      metadata: { bootstrap: true, authVerify: true, system: Boolean(input.system) },
    },
    select: { id: true, tenantId: true, username: true, active: true, role: true, branchId: true, passwordHash: true },
  });

  const finalPasswordResult = await verifyPassword(input.password, user.passwordHash);
  log('user ready', {
    id: user.id,
    tenantId: user.tenantId,
    username: user.username,
    role: user.role,
    branchId: user.branchId,
    active: user.active,
    repaired: shouldRepair,
    passwordHashPrefix: user.passwordHash.split('$').slice(0, 2).join('$'),
    passwordValid: finalPasswordResult.valid,
    needsRehash: finalPasswordResult.needsRehash,
  });

  if (!finalPasswordResult.valid) throw new Error(`Password verification failed for ${input.tenantId}/${input.username}`);
}

async function postJson(path: string, body: unknown) {
  if (process.env.AUTH_VERIFY_SKIP_RUNTIME === '1') {
    log('runtime login skipped by AUTH_VERIFY_SKIP_RUNTIME=1');
    return;
  }

  if (!BASE_URL) {
    log('runtime login skipped; AUTH_VERIFY_BASE_URL/NEXT_PUBLIC_APP_URL not set');
    return;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text().catch(() => '');
  const setCookie = response.headers.get('set-cookie');
  log('runtime login response', {
    path,
    status: response.status,
    ok: response.ok,
    hasSessionCookie: Boolean(setCookie?.includes('adisyum_session=')),
    body: text.slice(0, 200),
  });
  if (!response.ok || !setCookie?.includes('adisyum_session=')) {
    throw new Error(`Runtime login failed for ${path}: HTTP ${response.status}`);
  }
}

async function main() {
  log('auth verification starting', { tenantId: TENANT_ID, username: USERNAME, passwordLength: PASSWORD.length, baseUrl: BASE_URL || null });

  await ensureTenant({ tenantId: TENANT_ID, branchId: BRANCH_ID, name: 'Adisyum Production Tenant', branchName: 'Merkez' });
  await ensureSubscription(TENANT_ID, 1);
  await ensureRole({ tenantId: TENANT_ID, key: 'Admin', name: 'Admin' });
  await ensureUser({ tenantId: TENANT_ID, branchId: BRANCH_ID, username: USERNAME, name: 'Admin', role: 'Admin', password: PASSWORD });

  await ensureTenant({ tenantId: SYSTEM_TENANT_ID, branchId: SYSTEM_BRANCH_ID, name: 'Adisyum System Administration', branchName: 'System Administration', system: true });
  await ensureSubscription(SYSTEM_TENANT_ID, 10);
  await ensureRole({ tenantId: SYSTEM_TENANT_ID, key: 'super_admin', name: 'Super Admin', system: true });
  await ensureUser({ tenantId: SYSTEM_TENANT_ID, branchId: SYSTEM_BRANCH_ID, username: USERNAME, name: 'System Admin', role: 'super_admin', password: PASSWORD, system: true });

  await postJson('/api/auth/login', { tenantId: TENANT_ID, username: USERNAME, password: PASSWORD });
  await postJson('/api/auth/system-admin', { username: USERNAME, password: PASSWORD });

  log('auth verification completed successfully', { tenantId: TENANT_ID, username: USERNAME });
}

main()
  .catch((error) => {
    console.error('[auth-verify] ERROR', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
