import { prisma } from '@/lib/db/prisma';
import { buildTenantObservabilityRows } from '@/lib/observability/metrics-store';

type Severity = 'critical' | 'high' | 'medium' | 'low';

export type OperationalIssue = {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
};

export type OperationalHealth = {
  tenantId: string;
  companyName: string;
  healthScore: number;
  operationalScore: number;
  stockAccuracyScore: number;
  onboardingCompletenessScore: number;
  syncHealthScore: number;
  printerHealthScore: number;
  issues: OperationalIssue[];
  insights: {
    mostSoldProducts: Array<{ name: string; quantity: number; revenue: number }>;
    peakHours: Array<{ hour: number; orders: number }>;
    categoryProfitability: Array<{ category: string; revenue: number }>;
    openOrders: number;
    dailyRevenue: number;
  };
  alerts: Array<{ code: string; severity: Severity; title: string }>;
  generatedAt: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getOperationalTenantIds() {
  return prisma.tenant.findMany({
    where: { deletedAt: null, tenantId: { not: 'system' } },
    select: { tenantId: true, name: true, settings: true },
  });
}

export async function buildTenantOperationalHealth(tenantId: string): Promise<OperationalHealth | null> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - 30);

  const tenant = await prisma.tenant.findUnique({
    where: { tenantId },
    select: { tenantId: true, name: true, settings: true },
  });
  if (!tenant) return null;

  const [
    products,
    recipes,
    recipeItems,
    stockItems,
    categories,
    printers,
    openOrders,
    orderItemsToday,
    paymentsToday,
    recentStockMovements,
    templateImports,
  ] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, active: true, productType: { in: ['sale_product', 'combo_product'] } }, select: { id: true, name: true, categoryId: true, productType: true } }),
    prisma.recipe.findMany({ where: { tenantId }, select: { id: true, productId: true } }),
    prisma.recipeItem.findMany({ where: { tenantId }, select: { recipeId: true, stockItemId: true } }),
    prisma.stockItem.findMany({ where: { tenantId }, select: { id: true, name: true, quantity: true, minLevel: true } }),
    prisma.productCategory.findMany({ where: { tenantId }, select: { id: true, name: true, updatedAt: true } }),
    prisma.printer.findMany({ where: { tenantId }, select: { id: true, active: true, endpoint: true } }),
    prisma.order.count({ where: { tenantId, status: 'open' } }),
    prisma.orderItem.findMany({
      where: { tenantId, createdAt: { gte: dayStart } },
      select: { name: true, quantity: true, total: true, metadata: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { tenantId, status: 'paid', createdAt: { gte: dayStart } },
      select: { amount: true },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId, createdAt: { gte: staleCutoff } },
      select: { quantity: true, type: true, reason: true },
    }),
    prisma.templateImport.count({ where: { tenantId } }),
  ]);

  const issues: OperationalIssue[] = [];
  const recipeProductIds = new Set(recipes.map((recipe) => recipe.productId).filter(Boolean));
  const productsWithoutRecipes = products.filter((product) => !recipeProductIds.has(product.id)).length;
  const recipeItemsWithoutStock = recipeItems.filter((item) => !item.stockItemId).length;
  const negativeStockRisks = stockItems.filter((item) => Number(item.quantity) < Number(item.minLevel)).length;
  const staleCategories = categories.filter((category) => category.updatedAt < staleCutoff).length;
  const inactivePrinters = printers.filter((printer) => !printer.active || !printer.endpoint).length;

  if (productsWithoutRecipes) issues.push({ code: 'products_without_recipes', severity: 'high', title: 'Reçetesiz ürünler', detail: 'Satış ürünleri stok düşümü yapamaz.', count: productsWithoutRecipes });
  if (recipeItemsWithoutStock) issues.push({ code: 'recipe_items_without_stock', severity: 'critical', title: 'Stok kartı olmayan reçete satırları', detail: 'Reçete tüketimi güvenilir değil.', count: recipeItemsWithoutStock });
  if (negativeStockRisks) issues.push({ code: 'critical_stock', severity: 'high', title: 'Kritik stok riski', detail: 'Minimum seviyenin altına düşen stok kartları var.', count: negativeStockRisks });
  if (staleCategories) issues.push({ code: 'stale_categories', severity: 'low', title: 'Eski kategoriler', detail: 'Uzun süredir güncellenmeyen kategoriler var.', count: staleCategories });
  if (inactivePrinters) issues.push({ code: 'inactive_printers', severity: 'high', title: 'Yazıcı yapılandırma riski', detail: 'Pasif veya endpoint tanımsız yazıcılar var.', count: inactivePrinters });

  const duplicateProducts = products.length - new Set(products.map((product) => product.name.trim().toLocaleLowerCase('tr-TR'))).size;
  if (duplicateProducts) issues.push({ code: 'duplicate_products', severity: 'medium', title: 'Mükerrer ürün isimleri', detail: 'Aynı isimde birden fazla ürün var.', count: duplicateProducts });

  const suspiciousStockMovements = recentStockMovements.filter((movement) =>
    Number(movement.quantity) < 0 && !movement.reason?.trim(),
  ).length;
  if (suspiciousStockMovements) issues.push({ code: 'suspicious_stock_movements', severity: 'medium', title: 'Açıklamasız stok düşümleri', detail: 'Negatif hareketlerin bir kısmında neden yok.', count: suspiciousStockMovements });

  const observability = buildTenantObservabilityRows().find((row) => row.tenantId === tenantId);
  if (observability?.syncFailures) issues.push({ code: 'sync_failures', severity: observability.syncFailures > 3 ? 'high' : 'medium', title: 'Senkronizasyon hataları', detail: 'Cihazlar arası senkronizasyon hataları tespit edildi.', count: observability.syncFailures });
  if (observability?.websocketHealth === 'degraded') issues.push({ code: 'websocket_degraded', severity: 'high', title: 'WebSocket kararsız', detail: 'Gerçek zamanlı bağlantı sağlığı bozulmuş.', count: 1 });

  const onboarding = jsonObject(jsonObject(tenant.settings).onboarding);
  const onboardingChecks = [
    Boolean(onboarding.tenantCreated),
    Boolean(onboarding.branchCreated),
    Boolean(onboarding.adminUserCreated),
    templateImports > 0 || Boolean(onboarding.packImported),
    products.length > 0,
    printers.length > 0,
  ];
  const onboardingCompletenessScore = clamp((onboardingChecks.filter(Boolean).length / onboardingChecks.length) * 100);
  const operationalScore = clamp(100 - productsWithoutRecipes * 6 - recipeItemsWithoutStock * 12 - duplicateProducts * 4 - staleCategories * 2);
  const stockAccuracyScore = clamp(100 - negativeStockRisks * 8 - suspiciousStockMovements * 5);
  const syncHealthScore = clamp(observability ? 100 - observability.syncFailures * 12 - (observability.websocketHealth === 'degraded' ? 25 : 0) : 75);
  const printerHealthScore = printers.length === 0 ? 50 : clamp(((printers.length - inactivePrinters) / printers.length) * 100);
  const healthScore = clamp(
    operationalScore * 0.3 +
    stockAccuracyScore * 0.2 +
    onboardingCompletenessScore * 0.2 +
    syncHealthScore * 0.15 +
    printerHealthScore * 0.15,
  );

  const productSales = new Map<string, { quantity: number; revenue: number }>();
  const hourCounts = new Map<number, number>();
  const categoryRevenue = new Map<string, number>();
  for (const item of orderItemsToday) {
    const current = productSales.get(item.name) ?? { quantity: 0, revenue: 0 };
    current.quantity += Number(item.quantity);
    current.revenue += Number(item.total);
    productSales.set(item.name, current);
    const hour = item.createdAt.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    const metadata = jsonObject(item.metadata);
    const category = typeof metadata.category === 'string' ? metadata.category : 'Belirsiz';
    categoryRevenue.set(category, (categoryRevenue.get(category) ?? 0) + Number(item.total));
  }

  const alerts = issues
    .filter((issue) => issue.severity === 'critical' || issue.severity === 'high')
    .map((issue) => ({ code: issue.code, severity: issue.severity, title: issue.title }));

  return {
    tenantId,
    companyName: tenant.name,
    healthScore,
    operationalScore,
    stockAccuracyScore,
    onboardingCompletenessScore,
    syncHealthScore,
    printerHealthScore,
    issues,
    alerts,
    insights: {
      mostSoldProducts: [...productSales.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      peakHours: [...hourCounts.entries()].map(([hour, orders]) => ({ hour, orders })).sort((a, b) => b.orders - a.orders).slice(0, 5),
      categoryProfitability: [...categoryRevenue.entries()].map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      openOrders,
      dailyRevenue: paymentsToday.reduce((sum, payment) => sum + Number(payment.amount), 0),
    },
    generatedAt: now.toISOString(),
  };
}

export async function buildAllTenantOperationalHealth() {
  const tenants = await getOperationalTenantIds();
  const rows = await Promise.all(tenants.map((tenant) => buildTenantOperationalHealth(tenant.tenantId)));
  return rows.filter((row): row is OperationalHealth => Boolean(row)).sort((a, b) => a.healthScore - b.healthScore);
}
