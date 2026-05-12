/**
 * Thermal printer receipt formatter
 * Max line width: 32 characters
 */

const LINE_WIDTH = 32;
const SEPARATOR = '-'.repeat(LINE_WIDTH);

function center(text: string): string {
  const padding = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return ' '.repeat(padding) + text;
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
