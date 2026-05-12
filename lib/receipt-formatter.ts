'use client';

export const RECEIPT_WIDTH = 32;

export type ReceiptItem = {
  qty: number;
  name: string;
  price: number;
  total?: number;
};

export type ReceiptOrder = {
  tableNumber?: string | number;
  table?: string | number;
  date?: Date | string | number;
  items: ReceiptItem[];
  total?: number;
  restaurantName?: string;
};

function toMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function clip(value: string, width = RECEIPT_WIDTH) {
  if (value.length <= width) return value;
  return value.slice(0, width);
}

function fitLine(value: string, width = RECEIPT_WIDTH) {
  return clip(value).padEnd(width, ' ');
}

function formatItemLine(item: ReceiptItem) {
  const lineTotal = item.total ?? (item.qty * item.price);
  const priceText = `${toMoney(lineTotal)} ₺`;
  const prefix = `${item.qty}x `;
  const leftWidth = Math.max(1, RECEIPT_WIDTH - priceText.length);
  const nameWidth = Math.max(1, leftWidth - prefix.length);
  const left = `${prefix}${clip(item.name, nameWidth).padEnd(nameWidth, ' ')}`;
  return `${left}${priceText}`;
}

export function formatReceipt(order: ReceiptOrder) {
  const table = order.tableNumber ?? order.table ?? '-';
  const rawDate = order.date ? new Date(order.date) : new Date();
  const dateText = Number.isNaN(rawDate.getTime())
    ? new Date().toLocaleString('tr-TR')
    : rawDate.toLocaleString('tr-TR');

  const computedTotal = order.items.reduce((sum, item) => sum + (item.total ?? (item.qty * item.price)), 0);
  const total = typeof order.total === 'number' ? order.total : computedTotal;

  const lines: string[] = [];
  lines.push(fitLine((order.restaurantName || 'ADISYUM RESTAURANT').toUpperCase()));
  lines.push('-'.repeat(RECEIPT_WIDTH));
  lines.push(fitLine(`Masa: ${table}`));
  lines.push(fitLine(`Tarih: ${dateText}`));
  lines.push('');

  order.items.forEach((item) => {
    lines.push(formatItemLine(item));
  });

  lines.push('-'.repeat(RECEIPT_WIDTH));
  lines.push(fitLine(`TOPLAM: ${toMoney(total)} ₺`));
  lines.push('');
  lines.push(fitLine('Teşekkür ederiz'));

  return lines.join('\n');
}
