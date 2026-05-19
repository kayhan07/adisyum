import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== '0';

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      tenantId: true,
      active: true,
      lifecycleStatus: true,
      publishStatus: true,
      deletedAt: true,
      archivedAt: true,
      publishedAt: true,
    },
    take: 100000,
  });

  let repaired = 0;
  for (const product of products) {
    const data: {
      lifecycleStatus?: string;
      publishStatus?: string;
      publishedAt?: Date;
      archivedAt?: Date | null;
    } = {};

    if (!['draft', 'active', 'published', 'archived', 'deprecated', 'deleted'].includes(product.lifecycleStatus)) {
      data.lifecycleStatus = product.deletedAt ? 'deleted' : product.active ? 'published' : 'archived';
    }
    if (!['draft', 'validating', 'staged', 'published', 'failed', 'rolled_back'].includes(product.publishStatus)) {
      data.publishStatus = product.active && !product.deletedAt ? 'published' : 'draft';
    }
    if (!product.publishedAt && (data.lifecycleStatus === 'published' || product.lifecycleStatus === 'published')) {
      data.publishedAt = new Date();
    }
    if (product.active && product.archivedAt) {
      data.archivedAt = null;
    }

    if (Object.keys(data).length === 0) continue;
    repaired += 1;
    if (!DRY_RUN) {
      await prisma.product.update({ where: { id: product.id }, data });
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    scanned: products.length,
    repaired,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
