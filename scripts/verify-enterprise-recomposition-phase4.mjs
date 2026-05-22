import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walk(dir, matches = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return matches;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['.git', '.next', 'node_modules'].includes(entry.name)) continue;
    const relative = path.join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) walk(relative, matches);
    else matches.push(relative);
  }
  return matches;
}

function parseModels(schema) {
  const models = new Map();
  const regex = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  for (const match of schema.matchAll(regex)) {
    const name = match[1];
    const body = match[2];
    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const fields = new Map();
    const indexes = [];
    const uniques = [];
    const relations = [];
    for (const line of lines) {
      if (line.startsWith('@@index')) indexes.push(line);
      else if (line.startsWith('@@unique')) uniques.push(line);
      else if (!line.startsWith('@@') && !line.startsWith('//')) {
        const field = /^(\w+)\s+([^\s]+)/.exec(line);
        if (field) {
          fields.set(field[1], { type: field[2], line });
          if (line.includes('@relation')) relations.push(line);
        }
      }
    }
    models.set(name, { name, body, fields, indexes, uniques, relations });
  }
  return models;
}

function hasField(model, field) {
  return Boolean(model?.fields?.has(field));
}

function isNullable(model, field) {
  return model?.fields?.get(field)?.type?.includes('?') ?? false;
}

function hasTenantIndex(model) {
  return [...(model?.indexes ?? []), ...(model?.uniques ?? [])].some((line) => /\[tenantId(?:,|\])/.test(line));
}

function hasCompositeIndex(model, fields) {
  const expression = new RegExp(`\\[${fields.join('\\s*,\\s*')}(?:\\s*,|\\])`);
  return [...(model?.indexes ?? []), ...(model?.uniques ?? [])].some((line) => expression.test(line));
}

const requiredDocs = [
  'DATABASE_TOPOLOGY_V2.md',
  'TENANT_OWNERSHIP_FORENSICS.md',
  'BRANCH_OWNERSHIP_FORENSICS.md',
  'PRODUCT_CATALOG_INTEGRITY.md',
  'RUNTIME_SNAPSHOT_FORENSICS.md',
  'MIGRATION_DEBT_REPORT.md',
  'NULLABLE_DEBT_REPORT.md',
  'DATABASE_PERFORMANCE_FORENSICS.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 4 database forensics document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase4-validate']), 'Missing package script: recomposition:phase4-validate');

const schema = read('prisma/schema.prisma');
assert(Boolean(schema), 'Missing prisma/schema.prisma');
const models = parseModels(schema);

for (const requiredModel of ['Tenant', 'Branch', 'Product', 'ProductRevision', 'Order', 'OrderItem', 'RuntimeState']) {
  assert(models.has(requiredModel), `Missing required database model: ${requiredModel}`);
}

const strictTenantModels = [
  'Branch',
  'Subscription',
  'User',
  'Role',
  'Permission',
  'UserRole',
  'RolePermission',
  'UserPermission',
  'Session',
  'PresenceSession',
  'DeviceHeartbeat',
  'TenantDeviceRegistry',
  'TenantPrintJob',
  'OperationalMetricBucket',
  'TableGroup',
  'PosTable',
  'ProductCategory',
  'Product',
  'ProductRevision',
  'MediaAsset',
  'ProductVariant',
  'Order',
  'OrderItem',
  'Payment',
  'Customer',
  'Supplier',
  'Warehouse',
  'StockItem',
  'StockMovement',
  'CashRegister',
  'CashTransaction',
  'Printer',
  'PrinterGroup',
  'Recipe',
  'RecipeItem',
  'TemplatePackImport',
  'TemplateImport',
  'Expense',
  'Shift',
  'Report',
  'SyncQueue',
  'OfflineEvent',
  'RuntimeState',
];

for (const modelName of strictTenantModels) {
  const model = models.get(modelName);
  assert(Boolean(model), `Tenant-scoped model missing from schema: ${modelName}`);
  assert(hasField(model, 'tenantId'), `${modelName} must carry tenantId`);
  assert(!isNullable(model, 'tenantId'), `${modelName}.tenantId must be non-nullable`);
  assert(hasTenantIndex(model), `${modelName} must have tenant-scoped index or uniqueness`);
}

const optionallyTenantScopedModels = ['OperationalEvent', 'AuditLog', 'OperationalIncident'];
for (const modelName of optionallyTenantScopedModels) {
  const model = models.get(modelName);
  assert(Boolean(model), `Optional tenant forensic model missing: ${modelName}`);
  assert(hasField(model, 'tenantId'), `${modelName} must carry tenantId for tenant-scoped records`);
  assert(hasTenantIndex(model), `${modelName} must have tenant-scoped indexes for scoped queries`);
  if (isNullable(model, 'tenantId')) {
    warn(`${modelName}.tenantId is nullable by design for platform-wide events; keep covered by NULLABLE_DEBT_REPORT.md`);
  }
}

const branchModels = [...models.values()].filter((model) => hasField(model, 'branchId'));
for (const model of branchModels) {
  assert(hasField(model, 'tenantId'), `${model.name}.branchId cannot exist without tenantId`);
  if (!hasCompositeIndex(model, ['tenantId', 'branchId'])) {
    warn(`${model.name} has branchId without @@index/@@unique starting with [tenantId, branchId]`);
  }
}

for (const operationalModel of ['Order', 'PosTable', 'Warehouse', 'Printer', 'CashRegister']) {
  const model = models.get(operationalModel);
  if (model && !hasField(model, 'branchId')) {
    warn(`${operationalModel} has tenant ownership but no physical branchId yet; documented as branch topology debt`);
  }
}

const product = models.get('Product');
assert(hasField(product, 'productType'), 'Product must carry productType');
assert(hasField(product, 'lifecycleStatus'), 'Product must carry lifecycleStatus');
assert(hasField(product, 'publishStatus'), 'Product must carry publishStatus');
assert(hasField(product, 'revision'), 'Product must carry revision');
assert(hasField(product, 'posKey'), 'Product must carry canonical posKey');
assert(hasCompositeIndex(product, ['tenantId', 'productType', 'active']), 'Product must index tenant/productType/active');
assert(hasCompositeIndex(product, ['tenantId', 'lifecycleStatus']), 'Product must index tenant/lifecycleStatus');
assert(hasCompositeIndex(product, ['tenantId', 'publishStatus']), 'Product must index tenant/publishStatus');
assert(hasCompositeIndex(product, ['tenantId', 'posKey']), 'Product must have tenant-scoped posKey uniqueness');

const productRevision = models.get('ProductRevision');
assert(hasField(productRevision, 'snapshot'), 'ProductRevision must hold immutable product snapshot');
assert(hasCompositeIndex(productRevision, ['tenantId', 'productId', 'revision']), 'ProductRevision must uniquely govern tenant/product/revision');

const runtimeState = models.get('RuntimeState');
assert(hasField(runtimeState, 'payload'), 'RuntimeState must hold runtime payload');
assert(hasCompositeIndex(runtimeState, ['tenantId', 'key']), 'RuntimeState must uniquely scope snapshots by tenant/key');

const syncQueue = models.get('SyncQueue');
const offlineEvent = models.get('OfflineEvent');
assert(hasCompositeIndex(syncQueue, ['tenantId', 'status']), 'SyncQueue must index tenant/status replay ownership');
assert(hasCompositeIndex(offlineEvent, ['tenantId', 'eventId']), 'OfflineEvent must uniquely scope event replay by tenant/eventId');

const deviceRegistry = models.get('TenantDeviceRegistry');
const printJob = models.get('TenantPrintJob');
assert(hasCompositeIndex(deviceRegistry, ['tenantId', 'deviceId']), 'TenantDeviceRegistry must uniquely scope device identity by tenant/deviceId');
assert(hasCompositeIndex(printJob, ['tenantId', 'mutationId']), 'TenantPrintJob must uniquely scope print mutation replay by tenant/mutationId');

const migrationFiles = walk('prisma/migrations').filter((file) => file.endsWith('migration.sql'));
assert(migrationFiles.length > 0, 'No Prisma migrations found');

const destructiveStatements = [];
const localhostStatements = [];
for (const file of migrationFiles) {
  const text = read(file);
  if (/\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b/i.test(text)) destructiveStatements.push(file);
  if (/localhost|127\.0\.0\.1/i.test(text)) localhostStatements.push(file);
}
assert(destructiveStatements.length === 0, `Destructive migration statements require explicit impact report: ${destructiveStatements.join(', ')}`);
assert(localhostStatements.length === 0, `Migration files must not contain localhost assumptions: ${localhostStatements.join(', ')}`);

const seed = read('prisma/seed.mjs');
if (/ABN-48291|status:\s*['"]demo['"]/.test(seed)) {
  warn('prisma/seed.mjs still contains demo tenant defaults; keep seed isolated from production deploys');
}

const nullableOwnershipFields = [...models.values()].flatMap((model) => {
  return ['tenantId', 'branchId', 'productId', 'orderId', 'deviceId', 'sessionId', 'userId']
    .filter((field) => hasField(model, field) && isNullable(model, field))
    .map((field) => `${model.name}.${field}`);
});

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const requiredPhrase of [
  'No destructive migration is introduced in Phase 4',
  'Read-only production data validation remains a separate gate',
  'tenant-scoped index',
  'nullable debt',
]) {
  assert(docsText.includes(requiredPhrase), `Phase 4 docs must state: ${requiredPhrase}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-4-database-tenant-integrity-cleanup',
  schema: {
    modelCount: models.size,
    strictTenantModels: strictTenantModels.length,
    branchAwareModels: branchModels.map((model) => model.name).sort(),
    nullableOwnershipFields,
    migrationFiles,
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
