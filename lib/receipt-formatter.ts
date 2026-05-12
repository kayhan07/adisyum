/**
 * Thermal printer receipt formatter with ESC/POS support
 * Max line width: 32 characters
 */

const LINE_WIDTH = 32;
const SEPARATOR = '-'.repeat(LINE_WIDTH);

// ESC/POS commands
export const ESC = '\x1B';
export const GS = '\x1D';
export const INIT = ESC + '@';
export const ALIGN_CENTER = ESC + 'a\x01';
export const ALIGN_LEFT = ESC + 'a\x00';
export const BOLD_ON = ESC + 'E\x01';
export const BOLD_OFF = ESC + 'E\x00';
export const PAPER_CUT = GS + 'V\x00';

function center(text: string): string {
  const padding = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return ' '.repeat(padding) + text;
}

function padLine(left: string, right: string): string {
  const gap = LINE_WIDTH - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptOrder {
  restaurantName?: string;
  table?: string | number;
  items: ReceiptItem[];
  total?: number;
  logoUrl?: string;
}

/**
 * Format an order into a plain-text thermal receipt (32-char wide)
 */
export function formatReceipt(order: ReceiptOrder): string {
  const lines: string[] = [];

  // Header
  const restaurantName = order.restaurantName || 'ADISYUM RESTAURANT';
  lines.push(center(restaurantName));
  lines.push(SEPARATOR);

  if (order.table != null) {
    lines.push(`Masa: ${order.table}`);
  }
  lines.push(`Tarih: ${new Date().toLocaleString('tr-TR')}`);
  lines.push('');

  // Items
  order.items.forEach((item) => {
    const lineTotal = item.qty * item.price;
    // Format: "1x Adana Kebap      15.00 ₺"
    // prefix = "1x " = 3 chars, suffix = " ₺" = 2 chars
    // price field = 7 chars right-aligned, name = remaining
    const prefix = `${item.qty}x `;
    const suffix = `${lineTotal.toFixed(2)} \u20ba`;
    const nameWidth = LINE_WIDTH - prefix.length - suffix.length;
    const name = item.name.length > nameWidth
      ? item.name.slice(0, nameWidth)
      : item.name.padEnd(nameWidth, ' ');
    lines.push(`${prefix}${name}${suffix}`);
  });

  // Footer
  lines.push(SEPARATOR);

  const total = order.total ?? order.items.reduce((acc, i) => acc + i.qty * i.price, 0);
  const totalStr = `${total.toFixed(2)} \u20ba`;
  const totalLabel = 'TOPLAM: ';
  const totalPad = LINE_WIDTH - totalLabel.length - totalStr.length;
  lines.push(`${totalLabel}${' '.repeat(Math.max(0, totalPad))}${totalStr}`);

  lines.push('');
  lines.push(center('Te\u015fekk\u00fcr ederiz'));

  return lines.join('\n');
}

/**
 * Format kitchen ticket (MUTFAK FİŞİ) with ESC/POS
 */
export function formatKitchenReceipt(order: ReceiptOrder): string {
  const restaurantName = order.restaurantName || 'ADISYUM';
  const tableId = order.table ?? '-';
  
  const parts: string[] = [
    INIT,
    ALIGN_CENTER + BOLD_ON + 'MUTFAK FİŞİ' + BOLD_OFF,
    ALIGN_LEFT,
    `Masa: ${tableId}`,
    SEPARATOR,
  ];

  order.items.forEach((item) => {
    parts.push(`${item.qty}x ${item.name}`);
  });

  parts.push(SEPARATOR);
  parts.push('');
  parts.push(PAPER_CUT);

  return parts.join('\n');
}

/**
 * Format bar ticket (BAR FİŞİ) with ESC/POS
 */
export function formatBarReceipt(order: ReceiptOrder): string {
  const restaurantName = order.restaurantName || 'ADISYUM';
  const tableId = order.table ?? '-';
  
  const parts: string[] = [
    INIT,
    ALIGN_CENTER + BOLD_ON + 'BAR FİŞİ' + BOLD_OFF,
    ALIGN_LEFT,
    `Masa: ${tableId}`,
    SEPARATOR,
  ];

  order.items.forEach((item) => {
    parts.push(`${item.qty}x ${item.name}`);
  });

  parts.push(SEPARATOR);
  parts.push('');
  parts.push(PAPER_CUT);

  return parts.join('\n');
}

/**
 * Format cash receipt (KASA FİŞİ) with ESC/POS and full details
 */
export interface CashReceiptDetails {
  restaurantName?: string;
  table?: string | number;
  items: Array<{ name: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  vat: number;
  total: number;
  date?: Date;
  logoUrl?: string;
  isFirstOrder?: boolean;
}

export function formatCashReceipt(details: CashReceiptDetails): string {
  const restaurantName = details.restaurantName || 'ADISYUM';
  const tableId = details.table ?? '-';
  const now = details.date || new Date();
  const dateStr = now.toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: string[] = [
    INIT,
    ALIGN_CENTER + BOLD_ON + restaurantName + BOLD_OFF,
    ALIGN_CENTER + (details.isFirstOrder ? 'İLK ADISYON' : 'HESAP ADISYONU'),
    ALIGN_LEFT,
    `Masa: ${tableId}`,
    `Tarih: ${dateStr}`,
    SEPARATOR,
  ];

  // Items
  details.items.forEach((item) => {
    const itemLine = `${item.qty}x ${item.name}`;
    const priceLine = `${item.lineTotal.toFixed(2)} ₺`;
    parts.push(padLine(itemLine, priceLine));
  });

  parts.push(SEPARATOR);
  parts.push(padLine('Ara Toplam:', `${details.subtotal.toFixed(2)} ₺`));
  parts.push(padLine('KDV (%10):', `${details.vat.toFixed(2)} ₺`));
  parts.push(BOLD_ON + padLine('TOPLAM:', `${details.total.toFixed(2)} ₺`) + BOLD_OFF);
  parts.push(SEPARATOR);
  parts.push('');
  parts.push(ALIGN_CENTER + 'Afiyet Olsun');
  parts.push('');
  parts.push(PAPER_CUT);

  return parts.join('\n');
}
