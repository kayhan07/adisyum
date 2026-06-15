import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const formatter = read('lib/receipt-formatter.ts');
const settings = read('app/settings/settings-client.tsx');
const composer = read('components/order-composer.tsx');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('receipt formatter supports 58mm and 80mm widths', formatter.includes("'58mm': 32") && formatter.includes("'80mm': 48"));
check('preview and ESC/POS use same currency summary helper', formatter.includes('function buildCurrencySummary') && formatter.includes('const currencyRows = buildCurrencySummary(netTotal, settings)'));
check('long product names wrap on thermal width', formatter.includes('function wrapText') && formatter.includes('wrapText(String(item?.name'));
check('product rows include name quantity and amount columns', formatter.includes("columnText('URUN', 'ADET', 'TUTAR'") && formatter.includes('itemColumns(width)'));
check('receipt includes table/date/order/staff info', formatter.includes('buildReceiptInfoLine') && formatter.includes('Adisyon:') && formatter.includes('Personel:'));
check('receipt includes subtotal discount service tax and grand total hierarchy', formatter.includes('Adisyon Toplam') && formatter.includes('Servis') && formatter.includes('KDV') && formatter.includes('GENEL TOPLAM'));
check('settings screen can choose paper width', settings.includes('receiptPaperWidth') && settings.includes('<option value="80mm">80 mm</option>') && settings.includes('<option value="58mm">58 mm</option>'));
check('settings preview uses real receipt formatter text', settings.includes('formatReceiptPreviewText(receiptPreviewOrder'));
check('settings preview has thermal width classes', settings.includes("company.receiptPaperWidth === '58mm' ? 'w-[280px]' : 'w-[390px]'"));
check('order composer prints with tenant receipt settings', composer.includes('printCustomerReceipt') && composer.includes('runtimeCompanyState.receiptPaperWidth'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} receipt print preview checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} receipt print preview checks passed.`);
