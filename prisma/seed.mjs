import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== '1') {
  throw new Error('Demo seed is disabled. Set ALLOW_DEMO_SEED=1 outside production and provide SEED_TENANT_ID explicitly.');
}

const tenantId = process.env.SEED_TENANT_ID;
if (!tenantId) {
  throw new Error('SEED_TENANT_ID is required for manual demo seed.');
}

function hashPassword(password) {
  const iterations = 210000;
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

async function main() {
  const now = new Date();
  const subscriptionEnd = new Date(now);
  subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);

  await prisma.tenant.upsert({
    where: { tenantId },
    update: {
      status: 'demo',
      packageType: 'premium',
      mainBranchId: null,
    },
    create: {
      tenantId,
      name: 'Adisyon Demo Bistro',
      packageType: 'premium',
      status: 'demo',
      mainBranchId: null,
    },
  });

  await prisma.branch.upsert({
    where: { tenantId_branchId: { tenantId, branchId: 'mrk' } },
    update: { name: 'Merkez', active: true },
    create: { tenantId, branchId: 'mrk', name: 'Merkez', code: 'mrk', active: true },
  });

  await prisma.tenant.update({
    where: { tenantId },
    data: { mainBranchId: 'mrk' },
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: { tenantId, status: { in: ['active', 'trial', 'demo'] }, endsAt: { gte: now } },
    orderBy: { endsAt: 'desc' },
    select: { id: true },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { tenantId_id: { tenantId, id: existingSubscription.id } },
      data: {
        packageType: 'premium',
        status: 'demo',
        endsAt: subscriptionEnd,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        tenantId,
        packageType: 'premium',
        status: 'demo',
        startsAt: now,
        endsAt: subscriptionEnd,
      },
    });
  }

  await prisma.user.upsert({
    where: { tenantId_username: { tenantId, username: 'admin' } },
    update: {
      active: true,
      role: 'Admin',
      branchId: 'mrk',
      permissions: ['*'],
    },
    create: {
      tenantId,
      username: 'admin',
      name: 'Admin',
      passwordHash: hashPassword(process.env.SEED_ADMIN_PASSWORD || '1234'),
      role: 'Admin',
      branchId: 'mrk',
      permissions: ['*'],
    },
  });

  await prisma.role.upsert({
    where: { tenantId_key: { tenantId, key: 'Admin' } },
    update: { name: 'Admin', permissions: ['*'] },
    create: { tenantId, key: 'Admin', name: 'Admin', permissions: ['*'] },
  });

  await prisma.recipeTemplate.createMany({
    data: [
      { name: 'Sezar Salata', category: 'Salata', yieldQuantity: 1, unit: 'porsiyon' },
      { name: 'Hamburger Koftesi', category: 'Ana Yemek', yieldQuantity: 1, unit: 'porsiyon' },
    ],
    skipDuplicates: true,
  });

  console.log(`Seed completed for tenant ${tenantId}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
