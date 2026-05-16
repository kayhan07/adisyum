export const navigation = [
  { href: '/', label: 'G\u00f6sterge' },
  { href: '/orders', label: 'Adisyon' },
  { href: '/floor', label: 'Masalar' },
  { href: '/branches', label: '\u015eubeler' },
  { href: '/products', label: '\u00dcr\u00fcnler' },
  { href: '/finance', label: 'Finans' },
  { href: '/reports', label: 'Raporlar' },
  { href: '/access', label: 'Yetkiler' },
  { href: '/integrations', label: 'Entegrasyonlar' },
  { href: '/developer', label: 'Geli\u015ftirici' },
  { href: '/kds', label: 'KDS' },
  { href: '/saas', label: 'SaaS' },
];

export const branchOptions = [
  { id: 'all', label: 'T\u00fcm \u015eubeler', type: 'Merkez g\u00f6r\u00fcn\u00fcm', address: 'T\u00fcm lokasyonlar birlikte izleniyor' },
  { id: 'mrk', label: 'Merkez \u015eube', type: 'Genel merkez', address: 'Ni\u015fanta\u015f\u0131, \u0130stanbul' },
  { id: 'kdy', label: 'Kad\u0131k\u00f6y \u015eubesi', type: '\u0130stanbul Anadolu', address: 'Moda, \u0130stanbul' },
  { id: 'izm', label: '\u0130zmir Sahil \u015eubesi', type: 'Ege b\u00f6lgesi', address: 'Alsancak, \u0130zmir' },
];

export const activeBranch = branchOptions[1];
export const currentUser = {
  name: 'Admin',
  role: 'Admin',
  branch: 'Merkez \u015eube',
  discountLimitRate: 10,
  canUseRoundingDiscount: true,
};
export const currentPermissions = ['orders.create', 'orders.edit', 'payments.take', 'discount.apply'];

export const permissionMatrix = [
  { role: 'Admin', create: true, cancel: true, pricing: true, payment: true, reports: true },
  { role: 'Y\u00f6netici', create: true, cancel: true, pricing: true, payment: true, reports: true },
  { role: 'Servis', create: true, cancel: false, pricing: false, payment: true, reports: false },
  { role: 'Muhasebe', create: false, cancel: false, pricing: false, payment: true, reports: true },
];

export const customRoles = [
  { name: 'Kasa Operat\u00f6r\u00fc', description: '\u00d6deme al\u0131r ve rapor g\u00f6r\u00fcr.', permissions: ['\u00d6deme alma', 'Rapor g\u00f6rme'] },
  { name: 'Servis Lideri', description: 'Sipari\u015f y\u00f6netir, iptal edemez.', permissions: ['Sipari\u015f olu\u015fturma', 'Sipari\u015f d\u00fczenleme', '\u00d6deme alma'] },
];

export const apiKeys = [
  { name: 'Yemeksepeti Senkron', prefix: 'ark_A1B2C3D4', status: 'Aktif', limit: '120/dk', scopes: 'orders:read, products:read' },
  { name: 'Getir Men\u00fc Push', prefix: 'ark_E5F6G7H8', status: 'Aktif', limit: '90/dk', scopes: 'products:read' },
  { name: 'Trendyol Sipari\u015f Pull', prefix: 'ark_J9K0L1M2', status: 'Pasif', limit: '60/dk', scopes: 'orders:read' },
];

export const apiUsageLogs = [
  { method: 'GET', path: '/api/v2/external/orders', status: 200, actor: 'Yemeksepeti Senkron', time: '120 ms' },
  { method: 'GET', path: '/api/v2/external/products', status: 200, actor: 'Getir Men\u00fc Push', time: '96 ms' },
  { method: 'POST', path: '/api/v1/developer/webhooks/test', status: 201, actor: 'Merkez Admin', time: '141 ms' },
];

export const webhookEvents = [
  { event: 'order.created', target: 'https://hooks.partner.local/orders', status: 'Kuyrukland\u0131' },
  { event: 'payment.completed', target: 'https://hooks.partner.local/payments', status: 'Kuyrukland\u0131' },
  { event: 'stock.updated', target: 'https://hooks.partner.local/stocks', status: 'Kuyrukland\u0131' },
];

export const partnerIntegrations = [
  { name: 'Yemeksepeti', type: 'Sipari\u015f pazaryeri', status: 'Haz\u0131r adapt\u00f6r', version: 'v2' },
  { name: 'Getir', type: 'H\u0131zl\u0131 teslimat', status: 'Haz\u0131r adapt\u00f6r', version: 'v2' },
  { name: 'Trendyol', type: 'Marketplace', status: 'Haz\u0131r adapt\u00f6r', version: 'v2' },
];

export const kpis = [
  { label: 'Bug\u00fcnk\u00fc Ciro', value: 'TRY 284,620', delta: '+18.4%', tone: 'success' },
  { label: 'A\u00e7\u0131k Adisyon', value: '63', delta: '3 \u015fubede canl\u0131', tone: 'neutral' },
  { label: '\u015eube Stok Uyar\u0131s\u0131', value: '11', delta: '4 kritik', tone: 'warning' },
  { label: 'Ayl\u0131k Tekrarlayan Gelir', value: 'TRY 521,900', delta: '+12.1%', tone: 'success' },
];

export const tables = [
  ...Array.from({ length: 50 }, (_, index) => {
    const no = index + 1;
    const padded = String(no).padStart(2, '0');
    const groups = ['Salon', 'Teras', 'Bahce', 'VIP', 'Bar'];
    const group = groups[index % groups.length];
    const reserved = index % 9 === 0;
    const occupied = !reserved && (index % 4 === 1 || index % 4 === 2);
    const paymentRequested = occupied && (index % 8 === 1 || index % 10 === 4);
    const status = reserved ? 'reserved' : occupied ? 'occupied' : 'available';
    const guests = status === 'available' ? 0 : (index % 6) + 1;
    const total = status === 'available' ? 0 : 450 + (index * 85);

    return {
      id: `MRK-${padded}`,
      branchId: 'mrk',
      name: `${group} ${padded}`,
      group,
      status,
      guests,
      total,
      paymentRequested,
    };
  }),
  { id: 'KDY-01', branchId: 'kdy', name: 'Salon 01', group: 'Salon', status: 'reserved', guests: 4, total: 0, paymentRequested: false },
  { id: 'KDY-02', branchId: 'kdy', name: 'Bahce 02', group: 'Bahce', status: 'occupied', guests: 2, total: 860, paymentRequested: true },
  { id: 'IZM-01', branchId: 'izm', name: 'Salon 01', group: 'Salon', status: 'available', guests: 0, total: 0, paymentRequested: false },
  { id: 'IZM-02', branchId: 'izm', name: 'Bar 01', group: 'Bar', status: 'occupied', guests: 1, total: 310, paymentRequested: false },
];
export const orderItems = [
  { id: '1', name: 'Caffe Latte', qty: 2, note: 'Yulaf s\u00fct\u00fc', price: 145 },
  { id: '2', name: 'Truffle Burger', qty: 1, note: 'Orta iyi', price: 420 },
  { id: '3', name: 'Maden Suyu', qty: 1, note: '', price: 85 },
];

export const quickProducts = ['Espresso', 'Caffe Latte', 'Cappuccino', 'Club Sandwich', 'Truffle Burger', 'Sezar Salata', 'Tiramisu', 'Taze Meyve Suyu'];

export const productMix = [
  { name: 'Kahve', sales: 'TRY 74,220', share: '26%' },
  { name: 'Mutfak', sales: 'TRY 116,410', share: '41%' },
  { name: 'Tatl\u0131', sales: 'TRY 33,300', share: '12%' },
  { name: '\u0130\u00e7ecek', sales: 'TRY 60,690', share: '21%' },
];

export const timeline = [
  { time: '12:00', value: 34 },
  { time: '14:00', value: 72 },
  { time: '16:00', value: 49 },
  { time: '18:00', value: 90 },
  { time: '20:00', value: 98 },
  { time: '22:00', value: 56 },
];

export const branchPerformance = [
  {
    id: 'mrk',
    name: 'Merkez \u015eube',
    address: 'Ni\u015fanta\u015f\u0131, \u0130stanbul',
    revenue: 'TRY 118,400',
    orders: 31,
    staff: 12,
    stock: '2 kritik',
    billing: 'Merkezi',
    avgTicket: 'TRY 382',
    occupancy: '%78',
  },
  {
    id: 'kdy',
    name: 'Kad\u0131k\u00f6y \u015eubesi',
    address: 'Moda, \u0130stanbul',
    revenue: 'TRY 92,780',
    orders: 19,
    staff: 8,
    stock: '3 uyar\u0131',
    billing: '\u015eube bazl\u0131',
    avgTicket: 'TRY 351',
    occupancy: '%71',
  },
  {
    id: 'izm',
    name: '\u0130zmir Sahil \u015eubesi',
    address: 'Alsancak, \u0130zmir',
    revenue: 'TRY 73,440',
    orders: 13,
    staff: 7,
    stock: '1 kritik',
    billing: 'Merkezi',
    avgTicket: 'TRY 334',
    occupancy: '%63',
  },
];

export const branchReports = [
  {
    id: 'mrk',
    name: 'Merkez \u015eube',
    address: 'Ni\u015fanta\u015f\u0131, \u0130stanbul',
    revenue: 'TRY 118,400',
    orders: 31,
    staff: 12,
    avgTicket: 'TRY 382',
    occupancy: '%78',
    stock: '2 kritik \u00fcr\u00fcn',
    timeline: [42, 68, 56, 88, 96, 64],
    categories: [
      { name: 'Mutfak', share: '44%', sales: 'TRY 52,100' },
      { name: 'Kahve', share: '24%', sales: 'TRY 28,700' },
      { name: 'Tatl\u0131', share: '18%', sales: 'TRY 21,300' },
      { name: '\u0130\u00e7ecek', share: '14%', sales: 'TRY 16,300' },
    ],
    alerts: ['2 kritik stok', '1 geciken mutfak bileti', 'Tahsilat ak\u0131\u015f\u0131 normal'],
  },
  {
    id: 'kdy',
    name: 'Kad\u0131k\u00f6y \u015eubesi',
    address: 'Moda, \u0130stanbul',
    revenue: 'TRY 92,780',
    orders: 19,
    staff: 8,
    avgTicket: 'TRY 351',
    occupancy: '%71',
    stock: '3 stok uyar\u0131s\u0131',
    timeline: [30, 44, 51, 74, 79, 48],
    categories: [
      { name: 'Mutfak', share: '38%', sales: 'TRY 35,240' },
      { name: '\u0130\u00e7ecek', share: '23%', sales: 'TRY 21,330' },
      { name: 'Kahve', share: '21%', sales: 'TRY 19,480' },
      { name: 'Tatl\u0131', share: '18%', sales: 'TRY 16,730' },
    ],
    alerts: ['1 bar yo\u011funlu\u011fu', '3 stok uyar\u0131s\u0131', 'Paket sipari\u015f art\u0131\u015f\u0131'],
  },
  {
    id: 'izm',
    name: '\u0130zmir Sahil \u015eubesi',
    address: 'Alsancak, \u0130zmir',
    revenue: 'TRY 73,440',
    orders: 13,
    staff: 7,
    avgTicket: 'TRY 334',
    occupancy: '%63',
    stock: '1 kritik \u00fcr\u00fcn',
    timeline: [18, 32, 46, 61, 67, 40],
    categories: [
      { name: 'Kahve', share: '31%', sales: 'TRY 22,900' },
      { name: 'Mutfak', share: '29%', sales: 'TRY 21,300' },
      { name: '\u0130\u00e7ecek', share: '22%', sales: 'TRY 16,100' },
      { name: 'Tatl\u0131', share: '18%', sales: 'TRY 13,140' },
    ],
    alerts: ['1 kritik stok', 'Masa dolulu\u011fu stabil', 'Tahsilat kapan\u0131\u015f\u0131 tamam'],
  },
];

export const branchTransfers = [
  { transfer: 'TRF-20260410114022', source: 'Merkez \u015eube', target: 'Kad\u0131k\u00f6y \u015eubesi', item: 'Kahve \u00c7ekirde\u011fi', quantity: '6 kg', status: 'Tamamland\u0131' },
  { transfer: 'TRF-20260410101509', source: 'Merkez \u015eube', target: '\u0130zmir Sahil \u015eubesi', item: 'Burger Ekme\u011fi', quantity: '120 adet', status: 'Yolda' },
];

export const integrations = [
  { name: 'Ingenico Lane 3600', type: 'Yazarkasa POS', status: 'Canl\u0131', latency: '420 ms' },
  { name: 'Uyumsoft e-Fatura', type: 'E-Fatura', status: 'Kuyrukta senkron', latency: '1.2 s' },
  { name: 'iyzico Abonelik', type: 'Abonelik', status: 'Ba\u011fl\u0131', latency: '210 ms' },
];

export const printerDevices = [
  { name: 'Merkez Mutfak Yaz\u0131c\u0131s\u0131', type: 'Mutfak', ip: '192.168.1.210', port: 9100, status: 'Aktif', load: 'Merkez \u015eube' },
  { name: 'Kad\u0131k\u00f6y Bar Yaz\u0131c\u0131s\u0131', type: 'Bar', ip: '192.168.1.211', port: 9100, status: 'Aktif', load: 'Kad\u0131k\u00f6y \u015eubesi' },
  { name: '\u0130zmir Kasa POS Yaz\u0131c\u0131s\u0131', type: 'Kasa', ip: '192.168.1.212', port: 9100, status: 'Aktif', load: '\u0130zmir Sahil \u015eubesi' },
];

export const printerMappings = [
  { category: 'Yemek', printer: 'Merkez Mutfak Yaz\u0131c\u0131s\u0131', route: 'Birincil' },
  { category: '\u0130\u00e7ecek', printer: 'Kad\u0131k\u00f6y Bar Yaz\u0131c\u0131s\u0131', route: 'Birincil' },
  { category: 'Tatl\u0131', printer: 'Merkez Mutfak Yaz\u0131c\u0131s\u0131', route: 'Yedek rota' },
];

export const printLogs = [
  { order: 'ORD-20260408175501', target: 'Merkez Mutfak Yaz\u0131c\u0131s\u0131', status: 'Yazd\u0131r\u0131ld\u0131', retry: '0', time: '20:14:22' },
  { order: 'ORD-20260408175501', target: 'Kad\u0131k\u00f6y Bar Yaz\u0131c\u0131s\u0131', status: 'Tekrar deneme kuyru\u011fu', retry: '1', time: '20:14:22' },
  { order: 'ORD-20260408175501', target: '\u0130zmir Kasa POS Yaz\u0131c\u0131s\u0131', status: 'Yazd\u0131r\u0131ld\u0131', retry: '0', time: '20:18:41' },
];

export const kdsTickets = [
  { id: 'k1', channel: 'kitchen', status: 'new', tableName: 'Merkez Salon 02', orderNumber: 'ORD-20260408175501', createdAt: '2026-04-08T20:14:22+03:00', items: [{ name: 'Truffle Burger', quantity: 1, note: 'Orta iyi' }, { name: 'Sezar Salata', quantity: 1, note: 'Krutonsuz' }] },
  { id: 'k2', channel: 'kitchen', status: 'preparing', tableName: 'Kad\u0131k\u00f6y 02', orderNumber: 'ORD-20260408174810', createdAt: '2026-04-08T19:48:10+03:00', items: [{ name: 'Club Sandwich', quantity: 2, note: '' }] },
  { id: 'b1', channel: 'bar', status: 'new', tableName: '\u0130zmir Bar 01', orderNumber: 'ORD-20260408175612', createdAt: '2026-04-08T20:16:12+03:00', items: [{ name: 'Caffe Latte', quantity: 2, note: 'Yulaf s\u00fct\u00fc' }, { name: 'Maden Suyu', quantity: 1, note: '' }] },
  { id: 'b2', channel: 'bar', status: 'ready', tableName: 'Kad\u0131k\u00f6y Bah\u00e7e 01', orderNumber: 'ORD-20260408174155', createdAt: '2026-04-08T19:41:55+03:00', items: [{ name: 'Taze Meyve Suyu', quantity: 1, note: 'Buzsuz' }] },
];

export const subscriptionPlans = [
  { tenant: 'Adisyon Demo Bistro', plan: 'Chain Pro', status: 'Aktif', mrr: 'TRY 4,500', scope: 'Merkezi faturalama' },
  { tenant: 'Kad\u0131k\u00f6y \u015eubesi', plan: '\u015eube Eklentisi', status: 'Aktif', mrr: 'TRY 1,250', scope: '\u015eube bazl\u0131' },
  { tenant: '\u0130zmir Sahil \u015eubesi', plan: 'Merkezi kapsama', status: 'Aktif', mrr: 'TRY 0', scope: 'Merkezden \u00f6deniyor' },
];
