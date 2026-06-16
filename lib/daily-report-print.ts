export const DAILY_REPORT_80MM_WIDTH = 48;

export type DailyReportPrinterRole = 'cashier';

export type DailyReportPaymentTotals = {
  cash: number;
  card: number;
  account: number;
  other?: number;
};

export type DailyReportProductLine = {
  name: string;
  quantity: number;
  total: number;
};

export type DailyReportPrintInput = {
  tenantId: string;
  branchId: string;
  branchName: string;
  dateLabel: string;
  generatedAtLabel: string;
  orderCount: number;
  grossTotal: number;
  discountTotal?: number;
  serviceTotal?: number;
  refundTotal?: number;
  netTotal: number;
  payments: DailyReportPaymentTotals;
  topProducts?: DailyReportProductLine[];
  printerName?: string;
};

export type DailyReportPrintRequest = {
  printerRole: DailyReportPrinterRole;
  ticketType: 'daily-report';
  printerName?: string;
  bytesBase64: string;
  metadata: {
    reportType: 'daily-report';
    paperWidth: '80mm';
    tenantId: string;
    branchId: string;
    dateLabel: string;
    lineWidth: number;
  };
};

const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  currency: 'TRY',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function fitLine(value: string, width = DAILY_REPORT_80MM_WIDTH): string {
  const line = normalizeLine(value);
  if (line.length <= width) return line;
  return `${line.slice(0, Math.max(0, width - 3))}...`;
}

function separator(width = DAILY_REPORT_80MM_WIDTH): string {
  return '-'.repeat(width);
}

function center(value: string, width = DAILY_REPORT_80MM_WIDTH): string {
  const line = fitLine(value, width);
  const left = Math.max(0, Math.floor((width - line.length) / 2));
  return `${' '.repeat(left)}${line}`;
}

function pair(label: string, value: string, width = DAILY_REPORT_80MM_WIDTH): string {
  const left = normalizeLine(label);
  const right = normalizeLine(value);
  const gap = width - left.length - right.length;
  if (gap > 0) return `${left}${' '.repeat(gap)}${right}`;
  return fitLine(`${left}: ${right}`, width);
}

function money(value: number | undefined): string {
  return moneyFormatter.format(Number.isFinite(value) ? Number(value) : 0);
}

function encodeBase64Utf8(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(value)));
}

export function formatDailyReport80mmText(input: DailyReportPrintInput): string {
  const lines: string[] = [
    center('ADISYUM POS'),
    center('Günlük Rapor'),
    separator(),
    pair('Şube', input.branchName),
    pair('Tarih', input.dateLabel),
    pair('Hazırlanma', input.generatedAtLabel),
    separator(),
    pair('Adisyon', String(input.orderCount)),
    pair('Brüt Satış', money(input.grossTotal)),
    pair('İndirim', money(input.discountTotal ?? 0)),
    pair('Servis', money(input.serviceTotal ?? 0)),
    pair('İade', money(input.refundTotal ?? 0)),
    pair('NET TOPLAM', money(input.netTotal)),
    separator(),
    pair('Nakit', money(input.payments.cash)),
    pair('Kart/POS', money(input.payments.card)),
    pair('Cari', money(input.payments.account)),
    pair('Diğer', money(input.payments.other ?? 0)),
  ];

  const products = input.topProducts?.slice(0, 8) ?? [];
  if (products.length > 0) {
    lines.push(separator(), center('En Çok Satanlar'));
    for (const product of products) {
      const quantity = Number.isInteger(product.quantity) ? String(product.quantity) : product.quantity.toFixed(2);
      lines.push(fitLine(product.name));
      lines.push(pair(`${quantity} adet`, money(product.total)));
    }
  }

  lines.push(separator(), center('Rapor sonu'));
  return `${lines.map((line) => fitLine(line)).join('\n')}\n`;
}

export function findDailyReport80mmOverflow(text: string, width = DAILY_REPORT_80MM_WIDTH): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > width);
}

export function buildDailyReportPrintRequest(input: DailyReportPrintInput): DailyReportPrintRequest {
  const text = formatDailyReport80mmText(input);
  return {
    printerRole: 'cashier',
    ticketType: 'daily-report',
    printerName: input.printerName,
    bytesBase64: encodeBase64Utf8(text),
    metadata: {
      reportType: 'daily-report',
      paperWidth: '80mm',
      tenantId: input.tenantId,
      branchId: input.branchId,
      dateLabel: input.dateLabel,
      lineWidth: DAILY_REPORT_80MM_WIDTH,
    },
  };
}
