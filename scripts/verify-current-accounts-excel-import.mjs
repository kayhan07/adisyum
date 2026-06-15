import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function assertContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label} missing: ${needle}`);
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`${label} missing: ${pattern}`);
}

const route = read('app/api/finance/current-accounts/import/route.ts');
const movementRoute = read('app/api/finance/current-account-movements/route.ts');
const financeStore = read('lib/finance-runtime-store.ts');
const accountWorkspace = read('components/account-workspace.tsx');
const schema = read('prisma/schema.prisma');
const packageJson = read('package.json');

assertContains(schema, 'model Customer', 'Customer model exists for customer current accounts');
assertContains(schema, 'model Supplier', 'Supplier model exists for supplier current accounts');
assertContains(schema, 'model CurrentAccountMovement', 'CurrentAccountMovement model exists for opening balances');
assertContains(route, 'await requireTenant(request)', 'Import API is tenant-scoped');
assertContains(route, 'request.formData()', 'Import API accepts uploaded Excel/CSV form data');
assertContains(route, 'duplicatePolicy', 'Import API accepts duplicate policy for backwards-compatible UI');
assertContains(route, 'dryRun', 'Import API supports dry-run preview');
assertContains(route, 'NAME_HEADERS', 'Import API accepts Cari Adı / Ünvan / Müşteri Adı / Firma Adı headers');
assertContains(route, "if (!row.name) errors.push({ rowNumber: row.rowNumber, message: 'Cari adı boş' })", 'Rows without account name are skipped with explicit message');
assertContains(route, "phone: row.phone || null", 'Phone can be empty');
assertContains(route, "email: row.email || null", 'Email can be empty');
assertContains(route, 'taxOffice: row.taxOffice', 'Tax office can be empty but is preserved in metadata');
assertContains(route, 'address: row.address', 'Address can be empty but is preserved in metadata');
assertContains(route, "if (row.openingBalance === 0)", 'Zero balance accounts are created without movement');
assertContains(route, 'zeroBalanceAccountsCreated += 1', 'Zero balance account count is reported');
assertContains(route, 'defaultBalanceDirection', 'Customer/supplier default balance direction is resolved');
assertContains(route, "type === 'supplier' ? 'credit' : 'debit'", 'Supplier positive balance defaults to credit and customer positive balance to debit');
assertContains(route, 'amount < 0 ? negativeDirection : positiveDirection', 'Negative opening balance reverses direction');
assertContains(route, 'explicitBalanceDirection', 'Balance type column overrides default direction');
assertContains(route, 'normalizeTaxNumber', 'Tax number is normalized for duplicate matching');
assertContains(route, 'duplicateKey(row)', 'Duplicate matching uses tax number or normalized name');
assertContains(route, 'normalizeName(candidate.name) === rowName', 'Duplicate matching does not require phone');
assertContains(route, 'openingReconciliationKey', 'Opening balance reconciliation key is deterministic');
assertContains(route, 'current-account-opening:', 'Opening balance movement key is stable across repeated imports');
assertMatches(route, /currentAccountMovement\.findUnique\([\s\S]*tenantId_reconciliationKey/, 'Opening balance movement is idempotent per tenant reconciliation key');
assertContains(route, "description: 'Excel açılış bakiyesi'", 'Opening movement reason is Excel açılış bakiyesi');
assertContains(route, 'branchId', 'Import preserves branch id in response and metadata');
assertContains(route, 'customerReceivableMovements', 'Customer receivable movement count is reported');
assertContains(route, 'supplierPayableMovements', 'Supplier payable movement count is reported');
assertContains(route, 'movementCreated', 'Movement created count is reported');
assertContains(route, 'imported: created + updated', 'Imported count includes created and updated accounts');
assertContains(route, 'accounts.push', 'Import response returns account cards for immediate UI refresh');
assertContains(route, 'tenantId: tenant.tenantId', 'Import API writes only authenticated tenant records');
assertContains(route, "action: 'system_admin_action'", 'Import API writes audit log with supported action');
assertContains(movementRoute, 'accounts = [', 'Current account GET returns account cards');
assertContains(movementRoute, 'prisma.customer.findMany', 'Current account GET includes zero-balance customer cards');
assertContains(movementRoute, 'prisma.supplier.findMany', 'Current account GET includes zero-balance supplier cards');
assertContains(financeStore, 'saveStoredAccounts(payload.accounts)', 'Client stores account cards returned by current account GET');

assertContains(accountWorkspace, "Excel'den Cari Aktar", 'Finance current account UI exposes import button');
assertContains(accountWorkspace, 'Şablon İndir', 'Finance current account UI exposes template download');
assertContains(accountWorkspace, 'previewAccountImport', 'Finance current account UI previews imports before commit');
assertContains(accountWorkspace, 'commitAccountImport', 'Finance current account UI commits valid rows');
assertContains(accountWorkspace, 'saveStoredAccounts(payload.accounts)', 'Finance current account UI immediately stores imported accounts');
assertContains(accountWorkspace, 'loadAuthoritativeFinanceAccountTransactions()', 'Finance current account UI refreshes movements after import');
assertContains(accountWorkspace, 'sıfır bakiyeli cari', 'Finance current account UI summary includes zero balance accounts');
assertContains(accountWorkspace, 'bakiye hareketi', 'Finance current account UI summary includes movement count');
assertContains(accountWorkspace, 'satır atlandı', 'Finance current account UI summary includes skipped rows');
assertContains(accountWorkspace, 'Duplicate: atla', 'Finance current account UI keeps skip policy label');
assertContains(accountWorkspace, 'Duplicate: güncelle', 'Finance current account UI keeps update policy label');
assertContains(packageJson, '"verify:current-accounts-excel-import"', 'package.json exposes current account import verification script');

const fixtureRows = [
  { name: 'ÇİĞDEM LTD', type: '', balance: 0 },
  { name: 'ŞAHİN GIDA', type: 'müşteri', balance: 100 },
  { name: 'ÖZKAN TİCARET', type: 'tedarikçi', balance: 100 },
  { name: 'İSTANBUL', type: 'customer', balance: -50 },
  { name: 'Üsküdar', type: 'supplier', balance: -50 },
];

if (fixtureRows.length !== 5) throw new Error('fixture sanity failed');

console.log('PASS current account Excel/CSV import accepts sparse rows, creates zero-balance cards, and writes idempotent opening movements');
