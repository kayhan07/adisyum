import type { KdsStation, KdsStatus, KdsTicket, KdsTicketsResponse } from '@/lib/kds-types';

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function buildTicket(
  id: string,
  channel: KdsStation,
  status: KdsStatus,
  tableName: string,
  orderNumber: string,
  createdAt: string,
  items: Array<{ id: string; name: string; quantity: number; note?: string }>,
  priorityTags: string[] = [],
): KdsTicket {
  return {
    id,
    branch_id: 'mrk',
    branch_name: 'Merkez Şube',
    channel,
    status,
    table_name: tableName,
    order_number: orderNumber,
    created_at: createdAt,
    elapsed_minutes: Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)),
    urgency_level: priorityTags.includes('delayed') ? 'critical' : 'normal',
    priority_tags: priorityTags,
    service_mode: tableName.startsWith('Paket') ? 'Paket servis' : 'Salon servisi',
    notes_summary: null,
    grouped_items: items.map((item) => ({
      name: item.name,
      total_quantity: item.quantity,
      ticket_line_count: 1,
      notes: item.note ? [item.note] : [],
    })),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      note: item.note ?? null,
    })),
  };
}

let localTickets: KdsTicket[] = [
  buildTicket('k1', 'kitchen', 'new', 'Masa 12', 'ORD-1001', minutesAgo(4), [
    { id: 'k1-1', name: 'Truffle Burger', quantity: 2, note: '1 tanesi soğansız' },
    { id: 'k1-2', name: 'Patates Sepeti', quantity: 1, note: 'Ekstra çıtır' },
  ], ['vip']),
  buildTicket('k2', 'kitchen', 'preparing', 'Masa 07', 'ORD-1002', minutesAgo(12), [
    { id: 'k2-1', name: 'Izgara Tavuk', quantity: 3, note: '2 tanesi acısız' },
    { id: 'k2-2', name: 'Sezar Salata', quantity: 2, note: 'Krutonsuz' },
  ], ['delayed']),
  buildTicket('k3', 'kitchen', 'new', 'Paket 03', 'ORD-1003', minutesAgo(9), [
    { id: 'k3-1', name: 'Club Sandwich', quantity: 4, note: '2 tanesi glutensiz ekmek' },
    { id: 'k3-2', name: 'Soğan Halkası', quantity: 2 },
  ], ['takeaway']),
  buildTicket('b1', 'bar', 'new', 'Bar 01', 'ORD-2001', minutesAgo(3), [
    { id: 'b1-1', name: 'Caffe Latte', quantity: 3, note: '1 tanesi yulaf sütü' },
    { id: 'b1-2', name: 'Maden Suyu', quantity: 2 },
  ]),
  buildTicket('b2', 'bar', 'preparing', 'Masa 15', 'ORD-2002', minutesAgo(13), [
    { id: 'b2-1', name: 'Frozen', quantity: 2, note: 'Az şeker' },
    { id: 'b2-2', name: 'Espresso', quantity: 2 },
  ], ['vip', 'delayed']),
  buildTicket('d1', 'dessert', 'new', 'Masa 04', 'ORD-3001', minutesAgo(5), [
    { id: 'd1-1', name: 'San Sebastian', quantity: 2, note: '1 porsiyon çileksiz' },
    { id: 'd1-2', name: 'Dondurma', quantity: 2, note: 'Karışık' },
  ]),
  buildTicket('d2', 'dessert', 'ready', 'Paket 05', 'ORD-3002', minutesAgo(11), [
    { id: 'd2-1', name: 'Tiramisu', quantity: 3 },
  ], ['takeaway']),
];

export function getLocalKdsTickets(channel: string, branchId?: string): KdsTicketsResponse {
  const station = (channel === 'bar' || channel === 'dessert' ? channel : 'kitchen') satisfies KdsStation;
  const tickets = localTickets
    .filter((ticket) => ticket.channel === station)
    .filter((ticket) => !branchId || ticket.branch_id === branchId)
    .map((ticket) => ({
      ...ticket,
      elapsed_minutes: Math.max(0, Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60_000)),
    }));

  return {
    tenant_id: 'demo',
    channel: station,
    branch_id: branchId ?? 'mrk',
    realtime_channel: `tenant.demo.kds.${station}`,
    tickets,
  };
}

export function updateLocalKdsTicketStatus(ticketId: string, status: KdsStatus, branchId?: string) {
  const ticket = localTickets.find((item) => item.id === ticketId && (!branchId || item.branch_id === branchId));
  if (!ticket) {
    throw new Error('KDS bileti bulunamadı.');
  }

  const nextTicket: KdsTicket = {
    ...ticket,
    status,
    elapsed_minutes: Math.max(0, Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 60_000)),
  };

  localTickets = localTickets.map((item) => (item.id === ticketId ? nextTicket : item));
  return nextTicket;
}
