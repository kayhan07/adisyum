'use client';

import { processPrintQueue, queuePrintJob, type PrintTicketType } from '@/lib/print-resilience-store';

export type PaperWidth = '58mm' | '80mm';

type Align = 'LT' | 'CT' | 'RT';

type EscPosState = {
  align: Align;
  bold: boolean;
  widthScale: number;
  heightScale: number;
  font: 'A' | 'B';
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const CR = 0x0d;
const ESC_INIT = [ESC, 0x40] as const;
const ESC_STANDARD_MODE = [ESC, 0x53] as const;
const ESC_ALIGN_LEFT = [ESC, 0x61, 0x00] as const;
const ESC_CLEAR_TAB_STOPS = [ESC, 0x44, 0x00] as const;
const ESC_BOLD_OFF = [ESC, 0x45, 0x00] as const;
const ESC_FONT_A = [ESC, 0x4d, 0x00] as const;
const GS_LEFT_MARGIN_ZERO = [GS, 0x4c, 0x00, 0x00] as const;
const GS_TEXT_SIZE_NORMAL = [GS, 0x21, 0x00] as const;

const BASE_WIDTH_A: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 48,
};

const BASE_WIDTH_B: Record<PaperWidth, number> = {
  '58mm': 42,
  '80mm': 64,
};

const TR_CP857_MAP: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ı: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  É: 0x90,
  æ: 0x91,
  Æ: 0x92,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  İ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  Ş: 0x9e,
  ş: 0x9f,
  Ğ: 0xa6,
  ğ: 0xa7,
};

export interface ReceiptItem {
  id?: string;
  name: string;
  qty: number;
  price: number;
  category?: 'food' | 'drink' | string;
  note?: string;
  extrasNote?: string;
  removalNote?: string;
  complimentaryReason?: string;
}

export interface ReceiptOrder {
  id?: string;
  table?: string | number;
  staffName?: string;
  items: ReceiptItem[];
  total?: number;
  subtotal?: number;
  discount?: number;
  serviceCharge?: number;
  taxTotal?: number;
  netTotal?: number;
  createdAt?: Date;
  printedItems?: string[];
}

export interface ReceiptSettings {
  restaurantName?: string;
  branchName?: string;
  logoUrl?: string;
  footerText?: string;
  paperWidth?: PaperWidth;
  receiptTitle?: string;
  showLogo?: boolean;
  showBranch?: boolean;
  showDate?: boolean;
  showTable?: boolean;
  showItemHeader?: boolean;
  headerScale?: 1 | 2;
  itemScale?: 1 | 2;
  totalScale?: 1 | 2;
  usdRate?: string | number | null;
  eurRate?: string | number | null;
}

export interface PrintRequest {
  printerName: string;
  order: ReceiptOrder;
  settings?: ReceiptSettings;
}

export interface TicketPrintRequest extends PrintRequest {
  ticketType: 'kitchen' | 'bar';
  isAdditionalOrder?: boolean;
}

class EscPosBuilder {
  private bytes: number[] = [];

  private state: EscPosState = {
    align: 'LT',
    bold: false,
    widthScale: 1,
    heightScale: 1,
    font: 'A',
  };

  init() {
    this.raw(buildHardResetPrefix());
    this.setCodePageCP857();
    this.setFont('A');
    this.resetSection();
    return this;
  }

  setCodePageCP857() {
    this.raw([ESC, 0x74, 0x12]);
    return this;
  }

  raw(payload: readonly number[] | Uint8Array) {
    this.bytes.push(...Array.from(payload));
    return this;
  }

  text(value: string) {
    this.raw(encodeCp857(value));
    return this;
  }

  line(value = '') {
    if (value) this.text(value);
    this.raw([CR, LF]);
    return this;
  }

  newLine(count = 1) {
    for (let index = 0; index < count; index += 1) {
      this.raw([CR, LF]);
    }
    return this;
  }

  align(value: Align) {
    const map: Record<Align, number> = { LT: 0, CT: 1, RT: 2 };
    this.raw([ESC, 0x61, map[value]]);
    this.state.align = value;
    return this;
  }

  bold(enabled: boolean) {
    this.raw([ESC, 0x45, enabled ? 1 : 0]);
    this.state.bold = enabled;
    return this;
  }

  setFont(font: 'A' | 'B') {
    this.raw([ESC, 0x4d, font === 'A' ? 0 : 1]);
    this.state.font = font;
    return this;
  }

  setTextSize(widthScale = 1, heightScale = 1) {
    const w = clampScale(widthScale);
    const h = clampScale(heightScale);
    const packed = ((w - 1) << 4) | (h - 1);
    this.raw([GS, 0x21, packed]);
    this.state.widthScale = w;
    this.state.heightScale = h;
    return this;
  }

  resetSection() {
    this.align('LT');
    this.bold(false);
    this.setTextSize(1, 1);
    this.setFont('A');
    return this;
  }

  cut() {
    this.raw([GS, 0x56, 0x00]);
    return this;
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(1, Math.round(value)));
}

export function getLineWidth(paperWidth: PaperWidth = '80mm', font: 'A' | 'B' = 'A', widthScale = 1) {
  const base = font === 'B' ? BASE_WIDTH_B[paperWidth] : BASE_WIDTH_A[paperWidth];
  const safeScale = clampScale(widthScale);
  return Math.max(8, Math.floor(base / safeScale));
}

export function padLeft(text: string, width: number) {
  return truncate(text, width).padStart(width, ' ');
}

export function padRight(text: string, width: number) {
  return truncate(text, width).padEnd(width, ' ');
}

export function padCenter(text: string, width: number) {
  const safe = truncate(text, width);
  const diff = Math.max(0, width - safe.length);
  const left = Math.floor(diff / 2);
  const right = diff - left;
  return ' '.repeat(left) + safe + ' '.repeat(right);
}

export function columnText(
  left: string,
  middle: string,
  right: string,
  widths: { left: number; middle: number; right: number },
) {
  return `${padRight(left, widths.left)}${padCenter(middle, widths.middle)}${padLeft(right, widths.right)}`;
}

function truncate(text: string, width: number) {
  const safe = String(text ?? '');
  if (width <= 0) return '';
  const chars = [...safe];
  if (chars.length <= width) return safe;
  return chars.slice(0, Math.max(0, width - 1)).join('') + '…';
}

function wrapText(text: string, width: number) {
  const safe = String(text ?? '').trim();
  if (!safe) return [''];
  const words = safe.split(/\s+/);
  const rows: string[] = [];
  let row = '';

  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (next.length <= width) {
      row = next;
      continue;
    }

    if (row) rows.push(row);
    if (word.length <= width) {
      row = word;
      continue;
    }

    const chars = [...word];
    while (chars.length > width) {
      rows.push(chars.splice(0, width).join(''));
    }
    row = chars.join('');
  }

  if (row) rows.push(row);
  return rows;
}

function separator(width: number) {
  return '-'.repeat(width);
}

function toDatePart(date: Date) {
  return date.toLocaleDateString('tr-TR');
}

function toTimePart(date: Date) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function parseRate(value: string | number | null | undefined) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatAmount(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function formatForeignAmount(value: number, currency: 'USD' | 'EUR') {
  const symbol = currency === 'USD' ? '$' : '€';
  const safe = Number.isFinite(value) ? value : 0;
  return `${symbol}${safe.toFixed(2)}`;
}

function buildCurrencySummary(total: number, settings: ReceiptSettings) {
  const rows: string[] = [];
  const usdRate = parseRate(settings.usdRate);
  const eurRate = parseRate(settings.eurRate);
  if (usdRate) rows.push(`USD: ${formatForeignAmount(total / usdRate, 'USD')}`);
  if (eurRate) rows.push(`EUR: ${formatForeignAmount(total / eurRate, 'EUR')}`);
  if (rows.length === 0 && (settings.usdRate || settings.eurRate)) rows.push('Kur tanımlı değil');
  return rows;
}

function roundReceiptAmount(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function itemColumns(width: number) {
  if (width >= 48) return { left: 31, middle: 6, right: 11 };
  return { left: 19, middle: 4, right: 9 };
}

function getReceiptTemplate(settings: ReceiptSettings) {
  const normalizeScale = (value: unknown, fallback: 1 | 2): 1 | 2 => value === 1 || value === 2 ? value : fallback;

  return {
    receiptTitle: settings.receiptTitle?.trim() || 'ADİSYON',
    showLogo: settings.showLogo !== false,
    showBranch: settings.showBranch !== false,
    showDate: settings.showDate !== false,
    showTable: settings.showTable !== false,
    showItemHeader: settings.showItemHeader !== false,
    headerScale: normalizeScale(settings.headerScale, 2),
    itemScale: normalizeScale(settings.itemScale, 2),
    totalScale: normalizeScale(settings.totalScale, 2),
  };
}

function buildReceiptInfoLine(width: number, date: Date, table: string, template: ReturnType<typeof getReceiptTemplate>) {
  const infoLeft = template.showDate ? `${toDatePart(date)}  ${toTimePart(date)}` : '';
  const infoRight = template.showTable ? `MASA: ${table}` : '';

  if (infoLeft && infoRight) {
    const infoGap = Math.max(2, width - infoLeft.length - infoRight.length);
    return infoLeft + ' '.repeat(infoGap) + infoRight;
  }

  return infoLeft || infoRight;
}

function encodeCp857(text: string) {
  const out: number[] = [];
  const value = String(text ?? '');

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (TR_CP857_MAP[char] !== undefined) {
      out.push(TR_CP857_MAP[char]);
      continue;
    }
    if (code >= 0 && code <= 0x7f) {
      out.push(code);
      continue;
    }
    out.push('?'.charCodeAt(0));
  }

  return out;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function buildHardResetPrefix() {
  return Uint8Array.from([
    ...ESC_INIT,
    ...ESC_STANDARD_MODE,
    ...ESC_ALIGN_LEFT,
    ...ESC_BOLD_OFF,
    ...ESC_FONT_A,
    ...GS_TEXT_SIZE_NORMAL,
    ...ESC_CLEAR_TAB_STOPS,
    ...GS_LEFT_MARGIN_ZERO,
  ]);
}

async function sendRawEscPosBuffer(
  printerName: string,
  bytes: Uint8Array,
  context: string,
  meta: { ticketType: PrintTicketType; branchId?: string; tableId?: string; orderId?: string },
) {
  const resetPrefix = buildHardResetPrefix();
  const merged = new Uint8Array(resetPrefix.length + bytes.length);
  merged.set(resetPrefix, 0);
  merged.set(bytes, resetPrefix.length);
  const bytesBase64 = bytesToBase64(merged);
  console.debug('[escpos:PRINT_START]', { context, printerName, byteLength: merged.length });
  console.debug('[escpos:single-buffer-print]', {
    context,
    transport: 'fetchLocalAgentJson(/print)',
    writeFunction: 'RAW bytesBase64 only',
    byteLength: merged.length,
    sendCalls: 1,
    printJobs: 1,
    executeCalls: 1,
  });
  console.debug('[escpos:PRINT_EXECUTE]', { context, printerName, functionName: 'queuePrintJob+processPrintQueue' });
  await queuePrintJob({
    printerName,
    ticketType: meta.ticketType,
    branchId: meta.branchId,
    tableId: meta.tableId,
    orderId: meta.orderId,
    bytesBase64,
    source: `receipt-formatter:${context}`,
  });
  void processPrintQueue({ reason: `receipt-formatter:${context}` });
  console.debug('[escpos:PRINT_END]', { context, printerName, sendCalls: 1 });
}

function buildRasterCommand(monochrome: Uint8Array, width: number, height: number) {
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const out: number[] = [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  out.push(...monochrome);
  return Uint8Array.from(out);
}

async function logoToRasterCommand(logoUrl: string, paperWidth: PaperWidth) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo yüklenemedi.'));
    img.src = logoUrl;
  });

  const maxWidth = paperWidth === '80mm' ? 384 : 256;
  const rawTargetWidth = Math.max(64, Math.min(maxWidth, image.width || maxWidth));
  const targetWidth = Math.max(64, Math.floor(rawTargetWidth / 8) * 8);
  const ratio = image.height / Math.max(1, image.width);
  const targetHeight = Math.max(1, Math.round(targetWidth * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const widthBytes = Math.ceil(targetWidth / 8);
  const raster = new Uint8Array(widthBytes * targetHeight);
  const bayer4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const pixelIndex = (y * targetWidth + x) * 4;
      const r = imageData.data[pixelIndex];
      const g = imageData.data[pixelIndex + 1];
      const b = imageData.data[pixelIndex + 2];
      const alpha = imageData.data[pixelIndex + 3];

      const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
      const ditherAdjust = bayer4x4[y % 4][x % 4] * 6;
      const threshold = 186 + ditherAdjust;
      const isBlack = alpha > 16 && luminance < threshold;
      if (!isBlack) continue;

      const byteIndex = (y * widthBytes) + (x >> 3);
      raster[byteIndex] |= 0x80 >> (x & 7);
    }
  }

  return buildRasterCommand(raster, targetWidth, targetHeight);
}

async function buildReceiptBytes(order: ReceiptOrder, settings: ReceiptSettings = {}) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const width = getLineWidth(paperWidth, 'A', 1);
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const branchName = settings.branchName || '';
  const footerText = settings.footerText || 'Afiyet olsun';
  const table = String(order.table ?? '-');
  const date = order.createdAt ?? new Date();
  const template = getReceiptTemplate(settings);

  const displaySubtotal = roundReceiptAmount(order.items.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0));
  const subtotal = displaySubtotal;
  const discount = Number(order.discount ?? 0);
  const serviceCharge = Number(order.serviceCharge ?? 0);
  const taxTotal = Number(order.taxTotal ?? 0);
  const netTotal = roundReceiptAmount(order.netTotal ?? order.total ?? Math.max(0, subtotal - discount + serviceCharge + taxTotal));
  const currencyRows = buildCurrencySummary(netTotal, settings);

  const builder = new EscPosBuilder().init();

  builder.align('CT');
  if (template.showLogo && settings.logoUrl) {
    try {
      const raster = await logoToRasterCommand(settings.logoUrl, paperWidth);
      if (raster) {
        builder.raw(raster);
        builder.newLine(1);
      }
    } catch {
      // logo fallback: do not print placeholder text
    }
  }

  builder.bold(true).setTextSize(template.headerScale, template.headerScale);
  const headerWidth = getLineWidth(paperWidth, 'A', template.headerScale);
  wrapText(restaurantName, headerWidth).forEach((lineText) => builder.line(padCenter(lineText, headerWidth).trimEnd()));
  builder.setTextSize(1, 1).bold(false);

  if (template.showBranch && branchName) {
    builder.setFont('B').align('CT').line(branchName).setFont('A');
  }
  if (template.receiptTitle) {
    builder.bold(true).align('CT').line(template.receiptTitle).bold(false);
  }
  builder.resetSection();

  builder.line(separator(width)).newLine(1);

  const infoLine = buildReceiptInfoLine(width, date, table, template);
  if (infoLine) {
    builder.line(infoLine);
  }
  if (order.id) builder.line(`Adisyon: ${truncate(String(order.id), width - 9)}`);
  if (order.staffName) builder.line(`Personel: ${truncate(String(order.staffName), width - 10)}`);

  builder.line(separator(width)).newLine(1);

  const cols = itemColumns(width);
  if (template.showItemHeader) {
    builder.bold(true).line(columnText('URUN', 'ADET', 'TUTAR', cols)).bold(false);
    builder.line(separator(width));
  }

  for (const item of order.items) {
    const qty = Number(item?.qty ?? 0);
    const price = Number(item?.price ?? 0);
    const amount = qty * price;
    const name = String(item?.name ?? '').toUpperCase();
    const wrapped = wrapText(name, cols.left);

    builder.bold(true).setTextSize(1, template.itemScale);
    builder.line(columnText(wrapped[0] ?? '', String(qty), formatAmount(amount), cols));
    for (let i = 1; i < wrapped.length; i += 1) {
      builder.line(columnText(wrapped[i], '', '', cols));
    }
    builder.setTextSize(1, 1).bold(false);
  }

  builder.newLine(1).line(separator(width));
  builder.line(columnText('Adisyon Toplam', '', formatAmount(subtotal), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (discount > 0) builder.line(columnText('Indirim', '', formatAmount(discount), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (serviceCharge > 0) builder.line(columnText('Servis', '', formatAmount(serviceCharge), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (taxTotal > 0) builder.line(columnText('KDV', '', formatAmount(taxTotal), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  builder.line(separator(width));

  builder.align('CT').bold(true).setTextSize(template.totalScale, template.totalScale);
  builder.line('GENEL TOPLAM');
  builder.line(formatAmount(netTotal));
  builder.setTextSize(1, 1).bold(false).align('LT');
  if (currencyRows.length > 0) {
    builder.setFont('B').align('CT');
    currencyRows.forEach((row) => builder.line(row));
    builder.setFont('A').align('LT');
  }

  builder.line(separator(width)).newLine(1);
  builder.align('CT').line(footerText);

  builder.resetSection();
  builder.newLine(2);
  builder.cut();

  return builder.toBytes();
}

export function formatReceiptPreviewText(order: ReceiptOrder, settings: ReceiptSettings = {}) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const width = getLineWidth(paperWidth, 'A', 1);
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const branchName = settings.branchName || '';
  const footerText = settings.footerText || 'Afiyet olsun';
  const table = String(order.table ?? '-');
  const date = order.createdAt ?? new Date();
  const template = getReceiptTemplate(settings);
  const headerWidth = getLineWidth(paperWidth, 'A', template.headerScale);

  const subtotal = roundReceiptAmount(order.items.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0));
  const discount = Number(order.discount ?? 0);
  const serviceCharge = Number(order.serviceCharge ?? 0);
  const taxTotal = Number(order.taxTotal ?? 0);
  const netTotal = roundReceiptAmount(order.netTotal ?? order.total ?? Math.max(0, subtotal - discount + serviceCharge + taxTotal));
  const currencyRows = buildCurrencySummary(netTotal, settings);
  const cols = itemColumns(width);
  const lines: string[] = [];

  if (template.showLogo && settings.logoUrl) {
    lines.push(padCenter('[LOGO]', width).trimEnd());
    lines.push('');
  }

  wrapText(restaurantName, headerWidth).forEach((lineText) => lines.push(padCenter(lineText, width).trimEnd()));
  if (template.showBranch && branchName) {
    lines.push(padCenter(branchName, width).trimEnd());
  }
  if (template.receiptTitle) {
    lines.push(padCenter(template.receiptTitle, width).trimEnd());
  }

  lines.push(separator(width));
  const infoLine = buildReceiptInfoLine(width, date, table, template);
  if (infoLine) lines.push(infoLine);
  if (order.id) lines.push(`Adisyon: ${truncate(String(order.id), width - 9)}`);
  if (order.staffName) lines.push(`Personel: ${truncate(String(order.staffName), width - 10)}`);
  lines.push(separator(width));

  if (template.showItemHeader) {
    lines.push(columnText('URUN', 'ADET', 'TUTAR', cols));
    lines.push(separator(width));
  }

  for (const item of order.items) {
    const qty = Number(item?.qty ?? 0);
    const price = Number(item?.price ?? 0);
    const amount = qty * price;
    const wrapped = wrapText(String(item?.name ?? '').toUpperCase(), cols.left);
    lines.push(columnText(wrapped[0] ?? '', String(qty), formatAmount(amount), cols));
    for (let i = 1; i < wrapped.length; i += 1) {
      lines.push(columnText(wrapped[i], '', '', cols));
    }
  }

  lines.push(separator(width));
  lines.push(columnText('Adisyon Toplam', '', formatAmount(subtotal), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (serviceCharge > 0) lines.push(columnText('Servis', '', formatAmount(serviceCharge), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (taxTotal > 0) lines.push(columnText('KDV', '', formatAmount(taxTotal), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  if (discount > 0) lines.push(columnText('Indirim', '', formatAmount(discount), { left: Math.floor(width * 0.62), middle: 0, right: width - Math.floor(width * 0.62) }));
  lines.push(separator(width));
  lines.push(padCenter('GENEL TOPLAM', width).trimEnd());
  lines.push(padCenter(formatAmount(netTotal), width).trimEnd());
  currencyRows.forEach((row) => lines.push(padCenter(row, width).trimEnd()));
  lines.push(separator(width));
  lines.push(padCenter(footerText, width).trimEnd());

  return lines.join('\n');
}

async function buildCustomerBytes(order: ReceiptOrder, settings: ReceiptSettings = {}) {
  return buildReceiptBytes(order, settings);
}

type OperationTicketKind = 'kitchen' | 'bar';

function operationTicketTitle(kind: OperationTicketKind) {
  return kind === 'bar' ? 'BAR FISI' : 'MUTFAK FISI';
}

async function buildOperationTicketBytes(
  kind: OperationTicketKind,
  order: ReceiptOrder,
  settings: ReceiptSettings = {},
  isAdditionalOrder = false,
) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const table = String(order.table ?? '-');
  const printedAt = order.createdAt ?? new Date();

  const title = operationTicketTitle(kind);
  const headerWidth = getLineWidth(paperWidth, 'A', 1);
  const itemWidth = Math.max(12, getLineWidth(paperWidth, 'A', 1) - 2);
  const noteWidth = getLineWidth(paperWidth, 'A', 2);

  const builder = new EscPosBuilder().init();

  const normalizedItems = (order.items ?? [])
    .map((item) => ({
      qty: Math.max(0, Math.floor(Number(item?.qty ?? 0))),
      name: String(item?.name ?? '').trim(),
      note: String(item?.note ?? '').trim(),
      extrasNote: String(item?.extrasNote ?? '').trim(),
      removalNote: String(item?.removalNote ?? '').trim(),
      complimentaryReason: String(item?.complimentaryReason ?? '').trim(),
    }))
    .filter((item) => item.qty > 0 && item.name.length > 0);

  const productRenderQueue = normalizedItems.map((item) => ({
    productLines: wrapText(`${item.qty}x ${item.name.toUpperCase()}`, itemWidth),
    noteLines: buildOperationNoteLines(item),
  }));

  console.debug('[operation-ticket:render-order]', {
    kind,
    steps: ['INIT', 'HEADER_RENDER', 'INFO_RENDER', 'SEPARATOR_RENDER', 'PRODUCT_RENDER', 'NOTE_RENDER', 'CUT_RENDER'],
    itemCount: productRenderQueue.length,
    itemWidth,
    noteWidth,
    printJobsPlanned: 1,
  });

  // HEADER_RENDER
  console.debug('[operation-ticket:phase]', { kind, phase: 'HEADER_PRINT', functionName: 'EscPosBuilder.line' });
  builder.resetSection();
  builder.align('CT').bold(false).setTextSize(1, 1);
  builder.line(restaurantName);
  builder.bold(true).line(title).bold(false);
  builder.line(isAdditionalOrder ? 'EK SIPARIS' : 'ILK SIPARIS');

  // INFO_RENDER
  console.debug('[operation-ticket:phase]', { kind, phase: 'INFO_PRINT', functionName: 'EscPosBuilder.line' });
  builder.resetSection();
  builder.align('CT');
  builder.bold(true).setTextSize(2, 2).line(`MASA ${table}`);
  builder.setTextSize(1, 1).bold(false);
  builder.line(toTimePart(printedAt));

  // SEPARATOR_RENDER
  builder.resetSection();
  builder.align('LT').line(separator(headerWidth)).newLine(1);

  // PRODUCT_BLOCK_STYLE
  builder.resetSection();
  builder.align('LT').bold(true).setTextSize(1, 1);

  if (productRenderQueue.length === 0) {
    console.debug('[operation-ticket:phase]', { kind, phase: 'PRODUCT_RENDER', item: 'URUN BULUNAMADI' });
    builder.align('LT').line('URUN BULUNAMADI');
    builder.bold(false).setTextSize(1, 1);
    builder.newLine(1);
  }

  // PRODUCT_RENDER + NOTE_RENDER
  for (let index = 0; index < productRenderQueue.length; index += 1) {
    const item = normalizedItems[index];
    const renderBlock = productRenderQueue[index];
    const productText = `${item.qty}x ${item.name.toUpperCase()}`;
    console.debug('[operation-ticket:phase]', {
      kind,
      phase: 'PRODUCT_RENDER',
      productText,
      textLength: productText.length,
      fontScale: { width: 1, height: 1 },
      printableWidth: itemWidth,
      functionName: 'EscPosBuilder.line',
    });

    builder.align('LT').bold(true).setTextSize(1, 1);
    renderBlock.productLines.forEach((lineText) => {
      builder.align('LT').line(lineText);
    });
    builder.newLine(1);

    const noteLines = renderBlock.noteLines;
    if (noteLines.length > 0) {
      console.debug('[operation-ticket:phase]', {
        kind,
        phase: 'NOTE_RENDER',
        noteLines,
        printableWidth: noteWidth,
        functionName: 'EscPosBuilder.line',
      });
      builder.resetSection();
      builder.align('LT').line(separator(headerWidth));
      builder.align('LT').bold(true).setTextSize(1, 1);
      noteLines.forEach((lineText) => {
        wrapText(lineText, noteWidth).forEach((wrapped) => builder.line(wrapped));
      });
      builder.setTextSize(1, 1).bold(false);
      builder.line(separator(headerWidth));
      builder.resetSection();
      builder.align('LT').bold(true).setTextSize(1, 1);
    }
  }

  console.debug('[operation-ticket:phase]', { kind, phase: 'CUT_RENDER' });
  builder.resetSection().newLine(7).cut();
  return builder.toBytes();
}

function buildOperationNoteLines(
  item: Pick<ReceiptItem, 'note' | 'extrasNote' | 'removalNote' | 'complimentaryReason'>,
) {
  const lines: string[] = [];
  const noteParts = [item.note, item.extrasNote, item.removalNote, item.complimentaryReason]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (noteParts.length === 0) return lines;

  lines.push('NOT:');
  noteParts.forEach((part) => {
    lines.push(part.toUpperCase());
  });
  return lines;
}

async function buildKitchenBytes(order: ReceiptOrder, settings: ReceiptSettings = {}, isAdditionalOrder = false) {
  return buildOperationTicketBytes('kitchen', order, settings, isAdditionalOrder);
}

async function buildBarBytes(order: ReceiptOrder, settings: ReceiptSettings = {}, isAdditionalOrder = false) {
  return buildOperationTicketBytes('bar', order, settings, isAdditionalOrder);
}

export async function printReceipt(request: PrintRequest) {
  return printCustomerReceipt(request);
}

export async function printCustomerReceipt(request: PrintRequest) {
  const bytes = await buildReceiptBytes(request.order, request.settings);
  await sendRawEscPosBuffer(request.printerName, bytes, 'customer-receipt', {
    ticketType: 'customer',
    tableId: String(request.order.table ?? ''),
    orderId: request.order.id,
  });
  return bytes;
}

export async function printKitchenTicket(request: TicketPrintRequest) {
  const bytes = await buildKitchenBytes(request.order, request.settings, request.isAdditionalOrder);
  await sendRawEscPosBuffer(request.printerName, bytes, 'kitchen-ticket', {
    ticketType: 'kitchen',
    tableId: String(request.order.table ?? ''),
    orderId: request.order.id,
  });
  return bytes;
}

export async function printBarTicket(request: TicketPrintRequest) {
  const bytes = await buildBarBytes(request.order, request.settings, request.isAdditionalOrder);
  await sendRawEscPosBuffer(request.printerName, bytes, 'bar-ticket', {
    ticketType: 'bar',
    tableId: String(request.order.table ?? ''),
    orderId: request.order.id,
  });
  return bytes;
}

export function formatReceiptESC(_order: ReceiptOrder, _settings: ReceiptSettings = {}) {
  return '[RAW_ESC_POS_BUFFER]';
}

export function formatKitchenTicket(_order: ReceiptOrder, _settings: ReceiptSettings = {}, _isAdditionalOrder = false) {
  return '[RAW_ESC_POS_BUFFER]';
}

export function formatBarTicket(_order: ReceiptOrder, _settings: ReceiptSettings = {}, _isAdditionalOrder = false) {
  return '[RAW_ESC_POS_BUFFER]';
}

export function formatReceipt(order: ReceiptOrder) {
  return formatReceiptESC(order, { restaurantName: 'ADISYUM RESTAURANT', paperWidth: '80mm' });
}

export function formatKitchenReceipt(order: ReceiptOrder) {
  return formatKitchenTicket(order, { restaurantName: 'ADISYUM RESTAURANT', paperWidth: '80mm' });
}

export function formatBarReceipt(order: ReceiptOrder) {
  return formatBarTicket(order, { restaurantName: 'ADISYUM RESTAURANT', paperWidth: '80mm' });
}

export function formatCashReceipt(_input: {
  restaurantName?: string;
  table?: string | number;
  items: Array<{ name: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  vat: number;
  total: number;
  date?: Date;
  logoUrl?: string;
  isFirstOrder?: boolean;
}) {
  return '[RAW_ESC_POS_BUFFER]';
}
