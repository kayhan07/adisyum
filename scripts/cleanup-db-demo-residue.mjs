import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { auditDatabase, loadEnvFiles, writeJsonReport } from './db-demo-residue-lib.mjs';

loadEnvFiles();
const apply = process.env.CONFIRM_DB_DEMO_CLEANUP === 'YES';
const production = process.env.NODE_ENV === 'production';
const productionConfirmed = process.env.I_UNDERSTAND_THIS_TOUCHES_PRODUCTION_DB === 'YES';
const backupRoot = process.env.DB_DEMO_CLEANUP_BACKUP_DIR || (production ? '/backups' : path.resolve('backups'));
const timestamp = new Date().toISOString().replaceAll(':', '-');
const backupPath = path.join(backupRoot, `demo-residue-cleanup-${timestamp}.json`);

if (apply && production && !productionConfirmed) {
  console.error('[db:demo-residue-cleanup] Production apply blocked. Set I_UNDERSTAND_THIS_TOUCHES_PRODUCTION_DB=YES after DB backup.');
  process.exit(1);
}

let report;
try {
  report = await auditDatabase();
} catch (error) {
  console.error('[db:demo-residue-cleanup] Audit phase failed before cleanup. No database record was changed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const cleanupPlan = report.cleanupPlan;
const backup = {
  generatedAt: new Date().toISOString(),
  mode: apply ? 'APPLY_REQUESTED' : 'DRY_RUN',
  operatorNote: process.env.DB_DEMO_CLEANUP_OPERATOR_NOTE || 'DB demo residue cleanup plan',
  affectedTenantIds: cleanupPlan.safeTenantSoftDeleteIds,
  affectedTables: ['runtime_states', 'printers', 'tenant_device_registry', 'tenants', 'subscriptions', 'users', 'sessions'],
  recordsToDelete: { runtimeStateIds: cleanupPlan.safeRuntimeStatePruneIds },
  recordsToSoftDelete: {
    tenantIds: cleanupPlan.safeTenantSoftDeleteIds,
    printerIds: cleanupPlan.safePrinterDeactivateIds,
    deviceRegistryIds: cleanupPlan.safeDeviceRegistryRevokeIds,
  },
  manualReview: cleanupPlan.manualReview,
  doNotTouch: cleanupPlan.doNotTouch,
};

console.log('[db:demo-residue-cleanup] Backup required: take a DB snapshot and retain the generated JSON plan.');
console.log(JSON.stringify(backup, null, 2));

if (!apply) {
  console.log('[db:demo-residue-cleanup] DRY-RUN complete. No database record was changed.');
  process.exit(0);
}

fs.mkdirSync(backupRoot, { recursive: true });
writeJsonReport(backup, backupPath);
const prisma = new PrismaClient();
try {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const runtimeStates = cleanupPlan.safeRuntimeStatePruneIds.length
      ? await tx.runtimeState.deleteMany({ where: { id: { in: cleanupPlan.safeRuntimeStatePruneIds } } })
      : { count: 0 };
    const printers = cleanupPlan.safePrinterDeactivateIds.length
      ? await tx.printer.updateMany({ where: { id: { in: cleanupPlan.safePrinterDeactivateIds } }, data: { active: false } })
      : { count: 0 };
    const registries = cleanupPlan.safeDeviceRegistryRevokeIds.length
      ? await tx.tenantDeviceRegistry.updateMany({ where: { id: { in: cleanupPlan.safeDeviceRegistryRevokeIds } }, data: { status: 'revoked', revokedAt: now } })
      : { count: 0 };
    const tenantIds = cleanupPlan.safeTenantSoftDeleteIds;
    if (tenantIds.length) {
      await tx.session.updateMany({ where: { tenantId: { in: tenantIds } }, data: { revokedAt: now, deletedAt: now } });
      await tx.user.updateMany({ where: { tenantId: { in: tenantIds } }, data: { active: false, deletedAt: now } });
      await tx.subscription.updateMany({ where: { tenantId: { in: tenantIds } }, data: { status: 'canceled', canceledAt: now, deletedAt: now } });
      await tx.tenant.updateMany({ where: { tenantId: { in: tenantIds } }, data: { status: 'blocked', deletedAt: now } });
    }
    return {
      runtimeStatesPruned: runtimeStates.count,
      printersDeactivated: printers.count,
      registriesRevoked: registries.count,
      tenantsSoftDeleted: tenantIds.length,
    };
  });
  console.log(`[db:demo-residue-cleanup] APPLY complete. Backup plan: ${backupPath}`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
