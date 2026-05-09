export type KdsChannel = 'kitchen' | 'bar' | 'dessert';
export type KdsStatus = 'new' | 'preparing' | 'ready';
export type KdsPriorityTag = 'vip' | 'takeaway' | 'delayed';

export type KdsTicketItem = {
  id: string;
  name: string;
  quantity: number;
  note?: string;
};

export type KdsTicket = {
  id: string;
  channel: KdsChannel;
  status: KdsStatus;
  tableName: string;
  orderNumber: string;
  createdAt: string;
  sourceLabel: string;
  priorityTags: KdsPriorityTag[];
  items: KdsTicketItem[];
};

export const kdsDemoTickets: KdsTicket[] = [
  {
    id: 'k1',
    channel: 'kitchen',
    status: 'new',
    tableName: 'Masa 12',
    orderNumber: 'ORD-20260409193001',
    createdAt: '2026-04-09T19:30:01+03:00',
    sourceLabel: 'Salon servisi',
    priorityTags: ['vip'],
    items: [
      { id: 'k1-1', name: 'Truffle Burger', quantity: 2, note: '1 tanesi soğansız' },
      { id: 'k1-2', name: 'Patates Sepeti', quantity: 1, note: 'Ekstra çıtır' },
    ],
  },
  {
    id: 'k2',
    channel: 'kitchen',
    status: 'preparing',
    tableName: 'Masa 07',
    orderNumber: 'ORD-20260409192214',
    createdAt: '2026-04-09T19:22:14+03:00',
    sourceLabel: 'Salon servisi',
    priorityTags: [],
    items: [
      { id: 'k2-1', name: 'Izgara Tavuk', quantity: 3, note: '2 tanesi acısız' },
      { id: 'k2-2', name: 'Sezar Salata', quantity: 2, note: 'Krutonsuz' },
    ],
  },
  {
    id: 'k3',
    channel: 'kitchen',
    status: 'new',
    tableName: 'Paket 03',
    orderNumber: 'ORD-20260409191509',
    createdAt: '2026-04-09T19:15:09+03:00',
    sourceLabel: 'Paket servis',
    priorityTags: ['takeaway', 'delayed'],
    items: [
      { id: 'k3-1', name: 'Club Sandwich', quantity: 4, note: '2 tanesi glutensiz ekmek' },
      { id: 'k3-2', name: 'Soğan Halkası', quantity: 2 },
    ],
  },
  {
    id: 'b1',
    channel: 'bar',
    status: 'new',
    tableName: 'Bar 01',
    orderNumber: 'ORD-20260409193144',
    createdAt: '2026-04-09T19:31:44+03:00',
    sourceLabel: 'Bar servisi',
    priorityTags: [],
    items: [
      { id: 'b1-1', name: 'Caffe Latte', quantity: 3, note: '1 tanesi yulaf sütü' },
      { id: 'b1-2', name: 'Maden Suyu', quantity: 2 },
    ],
  },
  {
    id: 'b2',
    channel: 'bar',
    status: 'preparing',
    tableName: 'Masa 15',
    orderNumber: 'ORD-20260409192025',
    createdAt: '2026-04-09T19:20:25+03:00',
    sourceLabel: 'Salon servisi',
    priorityTags: ['vip', 'delayed'],
    items: [
      { id: 'b2-1', name: 'Frozen', quantity: 2, note: 'Az şeker' },
      { id: 'b2-2', name: 'Espresso', quantity: 2 },
    ],
  },
  {
    id: 'd1',
    channel: 'dessert',
    status: 'new',
    tableName: 'Masa 04',
    orderNumber: 'ORD-20260409192912',
    createdAt: '2026-04-09T19:29:12+03:00',
    sourceLabel: 'Tatlı istasyonu',
    priorityTags: [],
    items: [
      { id: 'd1-1', name: 'San Sebastian', quantity: 2, note: '1 porsiyon çileksiz' },
      { id: 'd1-2', name: 'Dondurma', quantity: 2, note: 'Karışık' },
    ],
  },
  {
    id: 'd2',
    channel: 'dessert',
    status: 'ready',
    tableName: 'Paket 05',
    orderNumber: 'ORD-20260409191803',
    createdAt: '2026-04-09T19:18:03+03:00',
    sourceLabel: 'Paket servis',
    priorityTags: ['takeaway'],
    items: [
      { id: 'd2-1', name: 'Tiramisu', quantity: 3 },
    ],
  },
];