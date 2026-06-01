import path from 'node:path';
import { auditDatabase, writeJsonReport } from './db-demo-residue-lib.mjs';

const outputPath = path.resolve(process.env.DB_DEMO_AUDIT_OUTPUT || 'artifacts/db-demo-residue-audit-latest.json');

try {
  const report = await auditDatabase();
  writeJsonReport(report, outputPath);
  console.log('[db:demo-residue-audit] READ-ONLY audit complete');
  console.log(JSON.stringify({
    outputPath,
    scannedTableCount: report.scannedTables.length,
    tenantCount: report.tenants.length,
    markerFindingTables: report.markerFindings.map((finding) => ({ table: finding.table, countReturned: finding.countReturned })),
    orphanFindingTables: report.orphanFindings.map((finding) => ({ table: finding.table, countReturned: finding.countReturned })),
    runtimeSnapshots: report.runtimeSnapshots.summary,
    printerDuplicates: report.printers.duplicates.length,
    safeCleanupPlan: report.cleanupPlan,
  }, null, 2));
} catch (error) {
  console.error('[db:demo-residue-audit] FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
