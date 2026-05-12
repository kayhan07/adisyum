'use client';

import { fetchLocalAgentJson } from '@/lib/local-agent';

export const ESC = '\x1B';
export const GS = '\x1D';

const INIT = ESC + '@';
const ALIGN_LEFT = ESC + 'a\x00';
const ALIGN_CENTER = ESC + 'a\x01';
const BOLD_ON = ESC + 'E\x01';
const BOLD_OFF = ESC + 'E\x00';
const FONT_A = ESC + 'M\x00';
const FONT_B = ESC + 'M\x01';
const RESET_SIZE = GS + '!\x00';
const DOUBLE_SIZE = GS + '!\x11';
const CODEPAGE_TURKISH = ESC + 't\x12';
const CUT_PAPER = GS + 'V\x00';

export type PaperWidth = '58mm' | '80mm';

const PAPER_COLUMNS_A: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 48,
};

const PAPER_COLUMNS_B: Record<PaperWidth, number> = {
  '58mm': 42,
  '80mm': 64,
};

export interface ReceiptItem {
  id?: string;
  name: string;
  qty: number;
  price: number;
  category?: 'food' | 'drink' | string;
}

export interface ReceiptOrder {
  id?: string;
  table?: string | number;
  items: ReceiptItem[];
  total?: number;
  subtotal?: number;
  discount?: number;
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

export function getLineWidth(paperWidth: PaperWidth = '80mm', font: 'A' | 'B' = 'A') {
  return font === 'B' ? PAPER_COLUMNS_B[paperWidth] : PAPER_COLUMNS_A[paperWidth];
}

export function padLeft(text: string, width: number) {
  return truncate(String(text ?? ''), width).padStart(width, ' ');
}

export function padRight(text: string, width: number) {
  return truncate(String(text ?? ''), width).padEnd(width, ' ');
}

export function padCenter(text: string, width: number) {
  const safe = truncate(String(text ?? ''), width);
  const pad = Math.max(0, width - safe.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + safe + ' '.repeat(right);
}

function center(text: string, width = 32) {
  const safe = text.trim();
  if (!safe) return '';
  return padCenter(safe, width).trimEnd();
}

function line(width = 32) {
  return '-'.repeat(width);
}

function truncate(text: string, limit: number) {
  if (limit <= 0) return '';
  const chars = [...String(text ?? '')];
  if (chars.length <= limit) return String(text ?? '');
  return chars.slice(0, Math.max(0, limit - 1)).join('') + '…';
}

function pad(text: string, limit: number, mode: 'left' | 'right' | 'center') {
  const safe = truncate(String(text ?? ''), limit);
  if (mode === 'left') return safe.padEnd(limit, ' ');
  if (mode === 'right') return safe.padStart(limit, ' ');
  const diff = Math.max(0, limit - safe.length);
  const leftPad = Math.floor(diff / 2);
  const rightPad = diff - leftPad;
  return ' '.repeat(leftPad) + safe + ' '.repeat(rightPad);
}

function wrapText(text: string, width: number) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return [''];
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    if (word.length <= width) {
      current = word;
      continue;
    }

    const chars = [...word];
    while (chars.length > width) {
      lines.push(chars.splice(0, width).join(''));
    }
    current = chars.join('');
  }

  if (current) lines.push(current);
  return lines;
}

function formatAmount(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)} TL`;
}

export function columnText(
  left: string,
  middle: string,
  right: string,
  widths: { left: number; middle: number; right: number },
) {
  return `${padRight(left, widths.left)}${padCenter(middle, widths.middle)}${padLeft(right, widths.right)}`;
}

function splitDateTime(date: Date) {
  const datePart = date.toLocaleDateString('tr-TR');
  const timePart = date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { datePart, timePart };
}

function itemColumns(width: number) {
  if (width >= 48) {
    return { name: 32, qty: 6, amount: 10 };
  }
  return { name: 19, qty: 4, amount: 9 };
}

function infoRow(date: Date, table: string, width: number) {
  const { datePart, timePart } = splitDateTime(date);
  const left = `${datePart}  ${timePart}`;
  const right = `MASA: ${table}`;
  const gap = Math.max(2, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

function buildProductTable(items: ReceiptItem[], width: number) {
  const columns = itemColumns(width);
  const rows: string[] = [];

  rows.push(columnText('URUN', 'ADET', 'TUTAR', { left: columns.name, middle: columns.qty, right: columns.amount }));

  for (const item of items) {
    const qty = Number(item?.qty ?? 0);
    const price = Number(item?.price ?? 0);
    const name = String(item?.name ?? 'Ürün');
    const amount = qty * price;
    const wrappedName = wrapText(name, columns.name);
    rows.push(columnText(wrappedName[0] ?? '', String(qty), formatAmount(amount), { left: columns.name, middle: columns.qty, right: columns.amount }));

    for (let index = 1; index < wrappedName.length; index += 1) {
      rows.push(columnText(wrappedName[index], '', '', { left: columns.name, middle: columns.qty, right: columns.amount }));
    }
  }

  return rows;
}

export function formatReceiptESC(order: ReceiptOrder, settings: ReceiptSettings = {}) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const width = getLineWidth(paperWidth, 'A');
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const branchName = settings.branchName || '';
  const footerText = settings.footerText || 'Afiyet olsun';
  const table = String(order.table ?? '-');
  const createdAt = order.createdAt ?? new Date();

  const subtotal = order.subtotal ?? order.items.reduce((acc, item) => acc + (item.qty * item.price), 0);
  const discount = order.discount ?? 0;
  const netTotal = order.netTotal ?? order.total ?? Math.max(0, subtotal - discount);

  let out = '';
  out += INIT;
  out += CODEPAGE_TURKISH;
  out += FONT_A;
  out += RESET_SIZE;

  out += ALIGN_CENTER;
  if (settings.logoUrl) {
    out += '[LOGO]\n';
  }

  const titleLines = wrapText(restaurantName, width);
  if (titleLines.length <= 1) {
    out += BOLD_ON + DOUBLE_SIZE + center(titleLines[0], width) + '\n' + RESET_SIZE + BOLD_OFF;
  } else {
    out += BOLD_ON + FONT_B;
    titleLines.forEach((titleLine) => {
      out += center(titleLine, getLineWidth(paperWidth, 'B')) + '\n';
    });
    out += FONT_A + BOLD_OFF;
  }

  if (branchName) {
    out += FONT_B + center(branchName, getLineWidth(paperWidth, 'B')) + '\n' + FONT_A;
  }

  out += line(width) + '\n\n';

  out += ALIGN_LEFT;
  out += infoRow(createdAt, table, width) + '\n';
  out += line(width) + '\n\n';

  out += BOLD_ON + buildProductTable([], width)[0] + '\n' + BOLD_OFF;
  out += line(width) + '\n';

  const productRows = buildProductTable(order.items, width).slice(1);
  for (const row of productRows) {
    out += RESET_SIZE + row + '\n';
  }

  out += '\n' + line(width) + '\n';
  out += columnText('Adisyon Toplam', '', formatAmount(subtotal), { left: Math.floor(width * 0.7), middle: 0, right: width - Math.floor(width * 0.7) }) + '\n';
  out += columnText('Indirim', '', formatAmount(discount), { left: Math.floor(width * 0.7), middle: 0, right: width - Math.floor(width * 0.7) }) + '\n';
  out += line(width) + '\n';

  out += BOLD_ON + DOUBLE_SIZE;
  out += center(`TOPLAM ${formatAmount(netTotal)}`, width) + '\n';
  out += RESET_SIZE + BOLD_OFF;

  out += line(width) + '\n\n';
  out += ALIGN_CENTER + footerText + '\n';
  out += '\n\n';
  out += CUT_PAPER;

  return out;
}

export function formatKitchenTicket(order: ReceiptOrder, settings: ReceiptSettings = {}, isAdditionalOrder = false) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const width = getLineWidth(paperWidth, 'A');
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const table = String(order.table ?? '-');

  let out = '';
  out += INIT + CODEPAGE_TURKISH + FONT_A + RESET_SIZE;
  out += ALIGN_CENTER;
  out += BOLD_ON + DOUBLE_SIZE + 'MUTFAK FİŞİ\n' + RESET_SIZE + BOLD_OFF;
  out += center(restaurantName, width) + '\n';
  out += BOLD_ON + (isAdditionalOrder ? 'EK SİPARİŞ' : 'İLK SİPARİŞ') + BOLD_OFF + '\n';
  out += line(width) + '\n';

  out += ALIGN_LEFT;
  out += `Masa: ${table}\n`;
  out += `Saat: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n`;
  out += line(width) + '\n';

  for (const item of order.items) {
    out += DOUBLE_SIZE + `${item.qty}x ${item.name}\n` + RESET_SIZE;
  }

  out += '\n\n' + CUT_PAPER;
  return out;
}

export function formatBarTicket(order: ReceiptOrder, settings: ReceiptSettings = {}, isAdditionalOrder = false) {
  const paperWidth = settings.paperWidth ?? '80mm';
  const width = getLineWidth(paperWidth, 'A');
  const restaurantName = settings.restaurantName || 'ADISYUM RESTAURANT';
  const table = String(order.table ?? '-');

  let out = '';
  out += INIT + CODEPAGE_TURKISH + FONT_A + RESET_SIZE;
  out += ALIGN_CENTER;
  out += BOLD_ON + DOUBLE_SIZE + 'BAR FİŞİ\n' + RESET_SIZE + BOLD_OFF;
  out += center(restaurantName, width) + '\n';
  out += BOLD_ON + (isAdditionalOrder ? 'EK SİPARİŞ' : 'İLK SİPARİŞ') + BOLD_OFF + '\n';
  out += line(width) + '\n';

  out += ALIGN_LEFT;
  out += `Masa: ${table}\n`;
  out += `Saat: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n`;
  out += line(width) + '\n';

  for (const item of order.items) {
    out += DOUBLE_SIZE + `${item.qty}x ${item.name}\n` + RESET_SIZE;
  }

  out += '\n\n' + CUT_PAPER;
  return out;
}

export async function printReceipt(request: PrintRequest) {
  const text = formatReceiptESC(request.order, request.settings);
  await fetchLocalAgentJson('/print', {
    method: 'POST',
    body: { printerName: request.printerName, text },
  });
  return text;
}

export async function printKitchenTicket(request: TicketPrintRequest) {
  const text = formatKitchenTicket(request.order, request.settings, request.isAdditionalOrder);
  await fetchLocalAgentJson('/print', {
    method: 'POST',
    body: { printerName: request.printerName, text },
  });
  return text;
}

export async function printBarTicket(request: TicketPrintRequest) {
  const text = formatBarTicket(request.order, request.settings, request.isAdditionalOrder);
  await fetchLocalAgentJson('/print', {
    method: 'POST',
    body: { printerName: request.printerName, text },
  });
  return text;
}

export function formatReceipt(order: ReceiptOrder) {
  return formatReceiptESC(order, {
    restaurantName: 'ADISYUM RESTAURANT',
    paperWidth: '80mm',
  });
}

export function formatKitchenReceipt(order: ReceiptOrder) {
  return formatKitchenTicket(order, {
    restaurantName: 'ADISYUM RESTAURANT',
    paperWidth: '80mm',
  });
}

export function formatBarReceipt(order: ReceiptOrder) {
  return formatBarTicket(order, {
    restaurantName: 'ADISYUM RESTAURANT',
    paperWidth: '80mm',
  });
}

export function formatCashReceipt(input: {
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
  const order: ReceiptOrder = {
    table: input.table,
    createdAt: input.date,
    items: input.items.map((item, index) => ({
      id: String(index),
      name: item.name,
      qty: item.qty,
      price: item.unitPrice,
    })),
    subtotal: input.subtotal,
    netTotal: input.total,
  };

  return formatReceiptESC(order, {
    restaurantName: input.restaurantName,
    logoUrl: input.logoUrl,
    paperWidth: '80mm',
  });
}
