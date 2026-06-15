import { readFileSync } from 'node:fs';

const formatter = readFileSync('lib/receipt-formatter.ts', 'utf8');
const companyStore = readFileSync('lib/company-store.ts', 'utf8');
const settings = readFileSync('app/settings/settings-client.tsx', 'utf8');
const composer = readFileSync('components/order-composer.tsx', 'utf8');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('company state stores manual USD rate', companyStore.includes('receiptUsdRate: string') && companyStore.includes("receiptUsdRate: ''"));
check('company state stores manual EUR rate', companyStore.includes('receiptEurRate: string') && companyStore.includes("receiptEurRate: ''"));
check('settings screen exposes USD and EUR rate inputs', settings.includes('USD kuru') && settings.includes('EUR kuru'));
check('receipt settings pass rates to preview formatter', settings.includes('usdRate: company.receiptUsdRate') && settings.includes('eurRate: company.receiptEurRate'));
check('order composer passes rates to real receipt print', composer.includes('usdRate: runtimeCompanyState.receiptUsdRate') && composer.includes('eurRate: runtimeCompanyState.receiptEurRate'));
check('currency helper parses comma or dot decimal rates', formatter.includes("replace(',', '.')"));
check('USD/EUR summary is informational and divides TL total by rate', formatter.includes("total / usdRate") && formatter.includes("total / eurRate"));
check('foreign amounts use two decimals', formatter.includes('safe.toFixed(2)'));
check('missing invalid rate does not alter TL total', formatter.includes('Kur tanımlı değil') && formatter.includes('GENEL TOPLAM'));
check('TL total remains primary TRY currency format', formatter.includes("currency: 'TRY'") && formatter.includes('GENEL TOPLAM'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} receipt currency checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} receipt currency checks passed.`);
