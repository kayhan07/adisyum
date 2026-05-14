import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tenantId = process.env.SEED_TENANT_ID || 'ABN-48291';

async function main() {
  await prisma.tenant.upsert({
    where: { tenantId },
    update: {
      status: 'demo',
      packageType: 'premium',
      updatedAt: new Date(),
    },
    create: {
      tenantId,
      name: 'Adisyon Demo Bistro',
      packageType: 'premium',
      status: 'demo',
      mainBranchId: 'mrk',
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId,
      packageType: 'premium',
      status: 'demo',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });

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
      passwordHash: 'demo-change-me',
      role: 'Admin',
      branchId: 'mrk',
      permissions: ['*'],
    },
  });

  await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: 'Admin' } },
    update: { permissions: ['*'] },
    create: { tenantId, name: 'Admin', permissions: ['*'] },
  });

  await prisma.recipeTemplate.createMany({
    data: [
      { name: 'Sezar Salata', category: 'Salata', yieldQuantity: 1, unit: 'porsiyon' },
      { name: 'Hamburger Köftesi', category: 'Ana Yemek', yieldQuantity: 1, unit: 'porsiyon' },
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

