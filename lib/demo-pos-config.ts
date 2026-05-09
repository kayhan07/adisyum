import { getCatalogCategoryByName, getCatalogPriceByName, getDefaultPosCatalog } from '@/lib/sale-product-catalog';

export type DemoTableStatus = 'available' | 'occupied' | 'reserved' | 'delayed';

export type DemoTable = {
  id: string;
  name: string;
  total: number;
  status: DemoTableStatus;
};

export type DemoProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
};

export type DemoOrderLine = {
  id: string;
  name: string;
  qty: number;
  note: string;
  price: number;
};

const sharedCatalog = getDefaultPosCatalog();

export const demoCategories = [
  { id: 'all', label: 'Tümü' },
  { id: 'kahve', label: 'Kahve' },
  { id: 'mutfak', label: 'Mutfak' },
  { id: 'icecek', label: 'İçecek' },
  { id: 'tatli', label: 'Tatlı' },
] as const;

const demoProductNames = [
  'Espresso',
  'Caffe Latte',
  'Cappuccino',
  'Truffle Burger',
  'Club Sandwich',
  'Sezar Salata',
  'Tiramisu',
  'Taze Meyve Suyu',
  'Maden Suyu',
];

export const demoProducts: DemoProduct[] = demoProductNames.map((name, index) => ({
  id: `dp${index + 1}`,
  name,
  category: getCatalogCategoryByName(name, sharedCatalog) ?? 'mutfak',
  price: getCatalogPriceByName(name, sharedCatalog) ?? 0,
}));

export const demoTables: DemoTable[] = [
  { id: 'DT01', name: 'Salon 01', total: 0, status: 'available' },
  { id: 'DT02', name: 'Salon 02', total: 1240, status: 'occupied' },
  { id: 'DT03', name: 'Teras 03', total: 860, status: 'occupied' },
  { id: 'DT04', name: 'Bahçe 04', total: 0, status: 'reserved' },
  { id: 'DT05', name: 'Bar 05', total: 310, status: 'occupied' },
  { id: 'DT06', name: 'Salon 06', total: 0, status: 'available' },
  { id: 'DT07', name: 'Teras 07', total: 1680, status: 'delayed' },
  { id: 'DT08', name: 'Salon 08', total: 0, status: 'available' },
];

export const demoDefaultTableId = 'DT02';

export const demoSeedOrders: Record<string, DemoOrderLine[]> = {
  DT01: [],
  DT02: [
    { id: 'dl1', name: 'Caffe Latte', qty: 2, note: 'Yulaf sütü', price: getCatalogPriceByName('Caffe Latte', sharedCatalog) ?? 0 },
    { id: 'dl2', name: 'Truffle Burger', qty: 1, note: 'Orta iyi', price: getCatalogPriceByName('Truffle Burger', sharedCatalog) ?? 0 },
    { id: 'dl3', name: 'Maden Suyu', qty: 1, note: '', price: getCatalogPriceByName('Maden Suyu', sharedCatalog) ?? 0 },
  ],
  DT03: [{ id: 'dl4', name: 'Club Sandwich', qty: 2, note: '', price: getCatalogPriceByName('Club Sandwich', sharedCatalog) ?? 0 }],
  DT04: [],
  DT05: [
    { id: 'dl5', name: 'Espresso', qty: 1, note: '', price: getCatalogPriceByName('Espresso', sharedCatalog) ?? 0 },
    { id: 'dl6', name: 'Taze Meyve Suyu', qty: 1, note: 'Buzsuz', price: getCatalogPriceByName('Taze Meyve Suyu', sharedCatalog) ?? 0 },
  ],
  DT06: [],
  DT07: [{ id: 'dl7', name: 'Truffle Burger', qty: 3, note: 'Bir tanesi az pişmiş', price: getCatalogPriceByName('Truffle Burger', sharedCatalog) ?? 0 }],
  DT08: [],
};
