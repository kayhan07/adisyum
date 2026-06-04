import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const schema = read('prisma/schema.prisma');
const ledgerRoute = read('app/api/finance/current-account-movements/route.ts');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const financeStore = read('lib/finance-runtime-store.ts');
const financeWorkspace = read('components/finance-workspace.tsx');
const floorWorkspace = read('components/floor-workspace.tsx');

assert(schema.includes('model CurrentAccountMovement'), 'Prisma must define the current account movement ledger');
assert(schema.includes('@@unique([tenantId, reconciliationKey])'), 'Cari ledger must reject duplicate tenant reconciliation keys');
assert(schema.includes('@@index([tenantId, accountId])'), 'Cari ledger queries must be tenant and account scoped');
assert(ledgerRoute.includes("action === 'record_collection'"), 'Cari API must expose server-side collection persistence');
assert(ledgerRoute.includes("type: action === 'record_collection' ? 'current_account_collection' : 'current_account_payment'"), 'Cash collection and outgoing payment must remain distinct');
assert(ledgerRoute.includes("amount: action === 'record_collection' ? amount : -amount"), 'Cash collection must increase the drawer while outgoing payment decreases it');
assert(ledgerRoute.includes('duplicate movement ignored'), 'Cari API must guard duplicate mutations');
assert(ledgerRoute.includes('_sum: { debit: true, credit: true }'), 'Cari balance must derive from debit minus credit ledger totals');
assert(tableOrdersRoute.includes("type: 'SALE_DEBT'"), 'POS account sale must persist a debit ledger movement');
assert(tableOrdersRoute.includes("reconciliationKey: `${reconciliationKey}:account-sale`"), 'POS account sale must use an idempotent reconciliation key');
assert(tableOrdersRoute.includes("normalizedBody.payment.method === 'mixed'"), 'Mixed POS payment must persist only its account component');
assert(tableOrdersRoute.includes('branchId: tenant.branchId'), 'POS payment cash/current account movements must carry branch scope in metadata');
assert(tableOrdersRoute.includes("type: 'pos_payment'"), 'POS cash/card payment must persist a cash transaction');
assert(tableOrdersRoute.includes('duplicate payment mutation ignored'), 'POS payment reconciliation must guard duplicate payment mutations');
assert(financeStore.includes("runtimeFetch('/api/finance/current-account-movements'"), 'Browser cari store must hydrate from the tenant API');
assert(financeWorkspace.includes('createAuthoritativeFinanceAccountMovement'), 'Finance collection UI must write through the authoritative cari API');
assert(floorWorkspace.includes('createAuthoritativeFinanceAccountMovement'), 'Daily report cari action must write through the authoritative cari API');

if (failures.length) {
  console.error('[finance:reconciliation] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[finance:reconciliation] PASS');
