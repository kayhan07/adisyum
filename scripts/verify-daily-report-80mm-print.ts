import {
  DAILY_REPORT_80MM_WIDTH,
  buildDailyReportPrintRequest,
  findDailyReport80mmOverflow,
  formatDailyReport80mmText,
  type DailyReportPrintInput,
} from '../lib/daily-report-print';

type Check = {
  name: string;
  ok: boolean;
  detail?: unknown;
};

const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: unknown) {
  checks.push({ name, ok, detail });
  const prefix = ok ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${name}`, detail ? JSON.stringify(detail) : '');
}

const sample: DailyReportPrintInput = {
  tenantId: 'TNT-DAILY-80',
  branchId: 'mrk',
  branchName: 'Merkez Şube',
  dateLabel: '16.06.2026',
  generatedAtLabel: '16.06.2026 21:30',
  orderCount: 18,
  grossTotal: 14320.75,
  discountTotal: 120.5,
  serviceTotal: 0,
  refundTotal: 40,
  netTotal: 14160.25,
  payments: {
    cash: 6200,
    card: 7060.25,
    account: 900,
    other: 0,
  },
  printerName: 'Kasa POS Yazıcısı',
  topProducts: [
    { name: 'ADANA KEBAP PORSİYON', quantity: 6, total: 2700 },
    { name: 'İÇECEK MENÜ VE AYRAN', quantity: 9, total: 810 },
    { name: 'ÇOBAN SALATA EKSTRA UZUN DENEME SATIRI', quantity: 3, total: 450 },
  ],
};

const text = formatDailyReport80mmText(sample);
const overflow = findDailyReport80mmOverflow(text);
const printRequest = buildDailyReportPrintRequest(sample);
const decoded = Buffer.from(printRequest.bytesBase64, 'base64').toString('utf8');

record('80mm line width is 48 columns', DAILY_REPORT_80MM_WIDTH === 48, { width: DAILY_REPORT_80MM_WIDTH });
record('daily report text is generated', text.includes('Günlük Rapor') && text.includes('NET TOPLAM'));
record('Turkish branch/product text is preserved', text.includes('Şube') && text.includes('İÇECEK') && text.includes('ÇOBAN'));
record('80mm lines do not overflow', overflow.length === 0, { overflow });
record('daily report print request uses daily-report ticket type', printRequest.ticketType === 'daily-report');
record('daily report print request targets default cashier/POS printer role', printRequest.printerRole === 'cashier');
record('daily report metadata keeps tenant and branch scope', printRequest.metadata.tenantId === sample.tenantId && printRequest.metadata.branchId === sample.branchId);
record('daily report output is encoded as printable UTF-8 bytes', decoded === text);
record('daily report request keeps selected cashier printer name', printRequest.printerName === sample.printerName);

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} daily report 80mm print checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} daily report 80mm print checks passed.`);
