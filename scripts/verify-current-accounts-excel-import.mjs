import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function assertContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label} missing: ${needle}`);
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`${label} missing: ${pattern}`);
}

const route = read('app/api/finance/current-accounts/import/route.ts');
const accountWorkspace = read('components/account-workspace.tsx');
const schema = read('prisma/schema.prisma');
const packageJson = read('package.json');

assertContains(schema, 'model Customer', 'Customer model exists for customer current accounts');
assertContains(schema, 'model Supplier', 'Supplier model exists for supplier current accounts');
assertContains(schema, 'model CurrentAccountMovement', 'CurrentAccountMovement model exists for opening balances');
assertContains(route, 'await requireTenant(request)', 'Import API is tenant-scoped');
assertContains(route, 'request.formData()', 'Import API accepts uploaded Excel/CSV form data');
assertContains(route, 'duplicatePolicy', 'Import API supports duplicate policy');
assertContains(route, 'dryRun', 'Import API supports dry-run preview');
assertContains(route, 'findDuplicate', 'Import API detects duplicate current accounts');
assertContains(route, 'taxNumber', 'Import API matches duplicates by tax number metadata');
assertContains(route, 'opening_balance_import', 'Import API creates opening balance movements');
assertContains(route, 'tenantId: tenant.tenantId', 'Import API writes only authenticated tenant records');
assertContains(route, "action: 'system_admin_action'", 'Import API writes audit log with supported action');
assertMatches(route, /tx\.currentAccountMovement\.upsert\([\s\S]*tenantId_reconciliationKey/, 'Opening balance movement is idempotent per tenant reconciliation key');

assertContains(accountWorkspace, "Excel'den Cari Aktar", 'Finance current account UI exposes import button');
assertContains(accountWorkspace, 'Şablon İndir', 'Finance current account UI exposes template download');
assertContains(accountWorkspace, 'previewAccountImport', 'Finance current account UI previews imports before commit');
assertContains(accountWorkspace, 'commitAccountImport', 'Finance current account UI commits valid rows');
assertContains(accountWorkspace, 'Duplicate: atla', 'Finance current account UI supports skip policy');
assertContains(accountWorkspace, 'Duplicate: güncelle', 'Finance current account UI supports update policy');
assertContains(packageJson, '"verify:current-accounts-excel-import"', 'package.json exposes current account import verification script');

console.log('PASS current account Excel/CSV import contract is tenant-scoped and previewable');
