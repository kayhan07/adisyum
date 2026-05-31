export const ERP_VAT_RATE = 0.1;

export type BranchId = 'mrk' | 'kdy' | 'izm';
export type AccountType = 'customer' | 'supplier' | 'partner' | 'staff';
export type AccountTransactionType = 'customer_charge' | 'customer_payment' | 'supplier_invoice' | 'supplier_payment' | 'partner_charge' | 'partner_payment' | 'staff_charge' | 'staff_payment';

export type Ingredient = {
  id: string;
  name: string;
  unit: 'kg' | 'gr' | 'lt' | 'ml' | 'adet';
};

export type BranchStock = {
  branchId: BranchId;
  ingredientId: string;
  quantity: number;
  minimumQuantity: number;
  averageCost: number;
};

export type ProductRecipe = {
  productName: string;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
  }>;
};

export type SaleOrderLine = {
  id: string;
  name: string;
  qty: number;
  price: number;
  note?: string;
};

export type PurchaseInvoiceLine = {
  ingredientId: string;
  quantity: number;
  unitPrice: number;
};

export type PurchaseInvoice = {
  id: string;
  branchId: BranchId;
  supplierAccountId: string;
  invoiceNo: string;
  date: string;
  lines: PurchaseInvoiceLine[];
};

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  phone: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  invoiceTitle: string;
  creditLimit?: number;
  salary?: number;
};

export type AccountTransaction = {
  id: string;
  accountId: string;
  type: AccountTransactionType;
  amount: number;
  description: string;
  date: string;
};

export type StockMovement = {
  ingredientId: string;
  branchId: BranchId;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
};

export type TreasuryAccountType = 'cash' | 'bank' | 'pos';

export type TreasuryAccount = {
  id: string;
  name: string;
  type: TreasuryAccountType;
  openingBalance: number;
  commissionRate?: number;
};

export type TreasuryMovement = {
  id: string;
  date: string;
  accountId: string;
  direction: 'in' | 'out';
  amount: number;
  description: string;
  source: 'sale' | 'collection' | 'supplier_payment' | 'staff_payment' | 'pos_transfer' | 'commission' | 'manual';
};

export const erpIngredients: Ingredient[] = [
  { id: 'coffee-bean', name: 'Kahve Çekirdeği', unit: 'kg' },
  { id: 'turkish-coffee', name: 'Türk Kahvesi', unit: 'kg' },
  { id: 'milk', name: 'Süt', unit: 'lt' },
  { id: 'water', name: 'Su', unit: 'lt' },
  { id: 'tea', name: 'Çay', unit: 'kg' },
  { id: 'yogurt', name: 'Yoğurt', unit: 'kg' },
  { id: 'lemon-juice', name: 'Limon Suyu', unit: 'lt' },
  { id: 'sugar', name: 'Şeker', unit: 'kg' },
  { id: 'cola', name: 'Kola', unit: 'lt' },
  { id: 'egg', name: 'Yumurta', unit: 'adet' },
  { id: 'tomato', name: 'Domates', unit: 'kg' },
  { id: 'pepper', name: 'Biber', unit: 'kg' },
  { id: 'olive-oil', name: 'Zeytinyağı', unit: 'lt' },
  { id: 'oil', name: 'Ayçiçek Yağı', unit: 'lt' },
  { id: 'butter', name: 'Tereyağı', unit: 'kg' },
  { id: 'cheese', name: 'Peynir', unit: 'kg' },
  { id: 'olive', name: 'Zeytin', unit: 'kg' },
  { id: 'cucumber', name: 'Salatalık', unit: 'kg' },
  { id: 'bread', name: 'Ekmek', unit: 'kg' },
  { id: 'onion', name: 'Soğan', unit: 'kg' },
  { id: 'burger-patty', name: 'Burger Köftesi', unit: 'adet' },
  { id: 'burger-bun', name: 'Burger Ekmeği', unit: 'adet' },
  { id: 'potato', name: 'Patates', unit: 'kg' },
  { id: 'pizza-dough', name: 'Pizza Hamuru', unit: 'adet' },
  { id: 'tomato-sauce', name: 'Domates Sosu', unit: 'kg' },
  { id: 'pasta', name: 'Makarna', unit: 'kg' },
  { id: 'cream', name: 'Krema', unit: 'lt' },
  { id: 'chicken', name: 'Tavuk', unit: 'kg' },
  { id: 'meat', name: 'Et', unit: 'kg' },
  { id: 'minced-meat', name: 'Kıyma', unit: 'kg' },
  { id: 'tail-fat', name: 'Kuyruk Yağı', unit: 'kg' },
  { id: 'lahmacun-dough', name: 'Lahmacun Hamuru', unit: 'kg' },
  { id: 'lavash', name: 'Lavaş', unit: 'adet' },
  { id: 'beans', name: 'Kuru Fasulye', unit: 'kg' },
  { id: 'rice', name: 'Pirinç', unit: 'kg' },
  { id: 'truffle-sauce', name: 'Trüf Sos', unit: 'kg' },
  { id: 'sparkling-water', name: 'Maden Suyu', unit: 'adet' },
  { id: 'lettuce', name: 'Marul', unit: 'kg' },
  { id: 'baklava-dough', name: 'Baklava Hamuru', unit: 'kg' },
  { id: 'kunefe-cheese', name: 'Künefelik Peynir', unit: 'kg' },
  { id: 'syrup', name: 'Şerbet', unit: 'lt' },
  { id: 'waffle-dough', name: 'Waffle Hamuru', unit: 'kg' },
  { id: 'chocolate', name: 'Çikolata', unit: 'kg' },
  { id: 'dessert-base', name: 'Tatlı Bazı', unit: 'adet' },
  { id: 'orange', name: 'Portakal', unit: 'kg' },
];

export const productRecipes: ProductRecipe[] = [
  {
    productName: 'Caffe Latte',
    ingredients: [
      { ingredientId: 'coffee-bean', quantity: 0.018 },
      { ingredientId: 'milk', quantity: 0.22 },
    ],
  },
  {
    productName: 'Espresso',
    ingredients: [{ ingredientId: 'coffee-bean', quantity: 0.018 }],
  },
  {
    productName: 'Cappuccino',
    ingredients: [
      { ingredientId: 'coffee-bean', quantity: 0.018 },
      { ingredientId: 'milk', quantity: 0.18 },
    ],
  },
  {
    productName: 'Truffle Burger',
    ingredients: [
      { ingredientId: 'burger-patty', quantity: 1 },
      { ingredientId: 'burger-bun', quantity: 1 },
      { ingredientId: 'truffle-sauce', quantity: 0.035 },
    ],
  },
  {
    productName: 'Sezar Salata',
    ingredients: [
      { ingredientId: 'lettuce', quantity: 0.18 },
      { ingredientId: 'truffle-sauce', quantity: 0.01 },
    ],
  },
  {
    productName: 'Maden Suyu',
    ingredients: [{ ingredientId: 'sparkling-water', quantity: 1 }],
  },
  {
    productName: 'Taze Meyve Suyu',
    ingredients: [{ ingredientId: 'orange', quantity: 0.32 }],
  },
  {
    productName: 'Tiramisu',
    ingredients: [{ ingredientId: 'dessert-base', quantity: 1 }],
  },
];

export const branchStocks: BranchStock[] = [
  { branchId: 'mrk', ingredientId: 'coffee-bean', quantity: 12, minimumQuantity: 15, averageCost: 480 },
  { branchId: 'mrk', ingredientId: 'turkish-coffee', quantity: 4.2, minimumQuantity: 2, averageCost: 420 },
  { branchId: 'mrk', ingredientId: 'milk', quantity: 21, minimumQuantity: 18, averageCost: 36 },
  { branchId: 'mrk', ingredientId: 'water', quantity: 120, minimumQuantity: 30, averageCost: 3 },
  { branchId: 'mrk', ingredientId: 'tea', quantity: 3.4, minimumQuantity: 1.2, averageCost: 180 },
  { branchId: 'mrk', ingredientId: 'yogurt', quantity: 14, minimumQuantity: 6, averageCost: 75 },
  { branchId: 'mrk', ingredientId: 'lemon-juice', quantity: 8, minimumQuantity: 3, averageCost: 90 },
  { branchId: 'mrk', ingredientId: 'sugar', quantity: 22, minimumQuantity: 8, averageCost: 28 },
  { branchId: 'mrk', ingredientId: 'cola', quantity: 36, minimumQuantity: 12, averageCost: 40 },
  { branchId: 'mrk', ingredientId: 'egg', quantity: 180, minimumQuantity: 60, averageCost: 6 },
  { branchId: 'mrk', ingredientId: 'tomato', quantity: 18, minimumQuantity: 8, averageCost: 32 },
  { branchId: 'mrk', ingredientId: 'pepper', quantity: 7.5, minimumQuantity: 3, averageCost: 65 },
  { branchId: 'mrk', ingredientId: 'olive-oil', quantity: 12, minimumQuantity: 4, averageCost: 140 },
  { branchId: 'mrk', ingredientId: 'oil', quantity: 15, minimumQuantity: 5, averageCost: 58 },
  { branchId: 'mrk', ingredientId: 'butter', quantity: 6.8, minimumQuantity: 2.5, averageCost: 220 },
  { branchId: 'mrk', ingredientId: 'cheese', quantity: 11, minimumQuantity: 4, averageCost: 280 },
  { branchId: 'mrk', ingredientId: 'olive', quantity: 5.5, minimumQuantity: 2, averageCost: 110 },
  { branchId: 'mrk', ingredientId: 'cucumber', quantity: 14, minimumQuantity: 5, averageCost: 24 },
  { branchId: 'mrk', ingredientId: 'bread', quantity: 18, minimumQuantity: 6, averageCost: 70 },
  { branchId: 'mrk', ingredientId: 'onion', quantity: 9.5, minimumQuantity: 3, averageCost: 18 },
  { branchId: 'mrk', ingredientId: 'burger-patty', quantity: 74, minimumQuantity: 35, averageCost: 62 },
  { branchId: 'mrk', ingredientId: 'burger-bun', quantity: 168, minimumQuantity: 80, averageCost: 14 },
  { branchId: 'mrk', ingredientId: 'potato', quantity: 34, minimumQuantity: 10, averageCost: 20 },
  { branchId: 'mrk', ingredientId: 'pizza-dough', quantity: 24, minimumQuantity: 8, averageCost: 24 },
  { branchId: 'mrk', ingredientId: 'tomato-sauce', quantity: 9, minimumQuantity: 3, averageCost: 55 },
  { branchId: 'mrk', ingredientId: 'pasta', quantity: 16, minimumQuantity: 6, averageCost: 48 },
  { branchId: 'mrk', ingredientId: 'cream', quantity: 7.5, minimumQuantity: 2.5, averageCost: 95 },
  { branchId: 'mrk', ingredientId: 'chicken', quantity: 22, minimumQuantity: 8, averageCost: 155 },
  { branchId: 'mrk', ingredientId: 'meat', quantity: 14, minimumQuantity: 5, averageCost: 420 },
  { branchId: 'mrk', ingredientId: 'minced-meat', quantity: 19, minimumQuantity: 7, averageCost: 380 },
  { branchId: 'mrk', ingredientId: 'tail-fat', quantity: 4.5, minimumQuantity: 1.5, averageCost: 190 },
  { branchId: 'mrk', ingredientId: 'lahmacun-dough', quantity: 8.5, minimumQuantity: 3, averageCost: 45 },
  { branchId: 'mrk', ingredientId: 'lavash', quantity: 72, minimumQuantity: 24, averageCost: 7 },
  { branchId: 'mrk', ingredientId: 'beans', quantity: 11, minimumQuantity: 4, averageCost: 90 },
  { branchId: 'mrk', ingredientId: 'rice', quantity: 12.5, minimumQuantity: 5, averageCost: 65 },
  { branchId: 'mrk', ingredientId: 'truffle-sauce', quantity: 3.4, minimumQuantity: 2, averageCost: 310 },
  { branchId: 'mrk', ingredientId: 'sparkling-water', quantity: 96, minimumQuantity: 36, averageCost: 18 },
  { branchId: 'mrk', ingredientId: 'lettuce', quantity: 8.2, minimumQuantity: 5, averageCost: 28 },
  { branchId: 'mrk', ingredientId: 'baklava-dough', quantity: 7.2, minimumQuantity: 2.5, averageCost: 140 },
  { branchId: 'mrk', ingredientId: 'kunefe-cheese', quantity: 5.4, minimumQuantity: 2, averageCost: 260 },
  { branchId: 'mrk', ingredientId: 'syrup', quantity: 18, minimumQuantity: 6, averageCost: 22 },
  { branchId: 'mrk', ingredientId: 'waffle-dough', quantity: 6.6, minimumQuantity: 2.4, averageCost: 85 },
  { branchId: 'mrk', ingredientId: 'chocolate', quantity: 8.8, minimumQuantity: 3, averageCost: 210 },
  { branchId: 'mrk', ingredientId: 'dessert-base', quantity: 24, minimumQuantity: 12, averageCost: 48 },
  { branchId: 'mrk', ingredientId: 'orange', quantity: 4.8, minimumQuantity: 7, averageCost: 32 },
  { branchId: 'kdy', ingredientId: 'coffee-bean', quantity: 9, minimumQuantity: 10, averageCost: 500 },
  { branchId: 'kdy', ingredientId: 'milk', quantity: 17, minimumQuantity: 16, averageCost: 38 },
  { branchId: 'kdy', ingredientId: 'burger-patty', quantity: 42, minimumQuantity: 30, averageCost: 64 },
  { branchId: 'kdy', ingredientId: 'burger-bun', quantity: 90, minimumQuantity: 70, averageCost: 15 },
  { branchId: 'kdy', ingredientId: 'sparkling-water', quantity: 58, minimumQuantity: 32, averageCost: 19 },
  { branchId: 'izm', ingredientId: 'coffee-bean', quantity: 7.5, minimumQuantity: 10, averageCost: 505 },
  { branchId: 'izm', ingredientId: 'milk', quantity: 13, minimumQuantity: 14, averageCost: 39 },
  { branchId: 'izm', ingredientId: 'burger-patty', quantity: 35, minimumQuantity: 25, averageCost: 65 },
  { branchId: 'izm', ingredientId: 'sparkling-water', quantity: 44, minimumQuantity: 30, averageCost: 20 },
];

export const erpAccounts: Account[] = [
  {
    id: 'cus-ahmet',
    code: 'CR-001',
    name: 'Ahmet Yılmaz',
    type: 'customer',
    openingBalance: 0,
    phone: '0532 111 22 33',
    address: 'Teşvikiye Mah. Valikonağı Cad. No:18 Şişli / İstanbul',
    taxOffice: 'Şişli',
    taxNumber: '1234567890',
    invoiceTitle: 'Ahmet Yılmaz',
    creditLimit: 1000,
  },
  {
    id: 'cus-ayse',
    code: 'CR-002',
    name: 'Ayşe Demir',
    type: 'customer',
    openingBalance: 0,
    phone: '0533 444 55 66',
    address: 'Moda Cad. No:42 Kadıköy / İstanbul',
    taxOffice: 'Kadıköy',
    taxNumber: '2345678901',
    invoiceTitle: 'Ayşe Demir',
    creditLimit: 1500,
  },
  {
    id: 'sup-sut',
    code: 'TD-001',
    name: 'Süt Ürünleri AŞ',
    type: 'supplier',
    openingBalance: 0,
    phone: '0212 555 10 10',
    address: 'Gıda Toptancıları Sitesi No:12 Bayrampaşa / İstanbul',
    taxOffice: 'Bayrampaşa',
    taxNumber: '3456789012',
    invoiceTitle: 'Süt Ürünleri Anonim Şirketi',
  },
  {
    id: 'sup-gida',
    code: 'TD-002',
    name: 'Gurme Gıda Tedarik',
    type: 'supplier',
    openingBalance: 0,
    phone: '0216 777 88 99',
    address: 'Organize Sanayi Bölgesi 4. Cadde No:7 Tuzla / İstanbul',
    taxOffice: 'Tuzla',
    taxNumber: '4567890123',
    invoiceTitle: 'Gurme Gıda Tedarik Ltd. Şti.',
  },
  {
    id: 'prt-murat',
    code: 'OR-001',
    name: 'Murat Ortak',
    type: 'partner',
    openingBalance: 0,
    phone: '0530 222 44 55',
    address: 'Nişantaşı / İstanbul',
    taxOffice: 'Şişli',
    taxNumber: '5678901234',
    invoiceTitle: 'Murat Ortak',
  },
  {
    id: 'stf-mehmet',
    code: 'PR-001',
    name: 'Mehmet Usta',
    type: 'staff',
    openingBalance: 0,
    phone: '0541 333 66 77',
    address: 'Kağıthane / İstanbul',
    taxOffice: 'Kağıthane',
    taxNumber: '6789012345',
    invoiceTitle: 'Mehmet Usta',
  },
];

export const demoPurchaseInvoice: PurchaseInvoice = {
  id: 'PI-2026-0007',
  branchId: 'mrk',
  supplierAccountId: 'sup-gida',
  invoiceNo: 'AF-2026-1842',
  date: '2026-04-15',
  lines: [
    { ingredientId: 'coffee-bean', quantity: 8, unitPrice: 520 },
    { ingredientId: 'milk', quantity: 16, unitPrice: 42 },
    { ingredientId: 'burger-bun', quantity: 80, unitPrice: 18 },
  ],
};

export const demoAccountPayments: AccountTransaction[] = [
  { id: 'PAY-CUS-1', accountId: 'cus-ahmet', type: 'customer_payment', amount: 250, description: 'Cari müşteri tahsilatı', date: '2026-04-15' },
  { id: 'PAY-SUP-1', accountId: 'sup-sut', type: 'supplier_payment', amount: 900, description: 'Tedarikçi ödemesi', date: '2026-04-15' },
];

const ERP_SEED_ORDER_ITEMS: SaleOrderLine[] = [
  { id: 'seed-order-1', name: 'Caffe Latte', qty: 2, price: 145 },
  { id: 'seed-order-2', name: 'Truffle Burger', qty: 1, price: 420 },
  { id: 'seed-order-3', name: 'Maden Suyu', qty: 2, price: 85 },
];

export function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantity(value: number, unit: Ingredient['unit']) {
  const fractionDigits = unit === 'adet' ? 0 : value < 10 ? 2 : 1;
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: fractionDigits }).format(value)} ${unit}`;
}

export function calculateInvoiceTotal(invoice: PurchaseInvoice) {
  return invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

export function calculateGrossSaleTotal(lines: SaleOrderLine[]) {
  const net = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return net * (1 + ERP_VAT_RATE);
}

export function decreaseStockForSale(stocks: BranchStock[], branchId: BranchId, saleLines: SaleOrderLine[]) {
  const recipesByProduct = new Map(productRecipes.map((recipe) => [recipe.productName, recipe]));
  const movements: StockMovement[] = [];
  const nextStocks = stocks.map((stock) => ({ ...stock }));

  for (const line of saleLines) {
    const recipe = recipesByProduct.get(line.name);
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      const quantity = ingredient.quantity * line.qty;
      const stock = nextStocks.find((item) => item.branchId === branchId && item.ingredientId === ingredient.ingredientId);
      if (!stock) continue;

      stock.quantity = Math.max(0, stock.quantity - quantity);
      movements.push({
        ingredientId: ingredient.ingredientId,
        branchId,
        direction: 'out',
        quantity,
        reason: `${line.name} satışı`,
      });
    }
  }

  return { stocks: nextStocks, movements };
}

export function applyPurchaseInvoice(stocks: BranchStock[], invoice: PurchaseInvoice) {
  const movements: StockMovement[] = [];
  const nextStocks = stocks.map((stock) => ({ ...stock }));

  for (const line of invoice.lines) {
    let stock = nextStocks.find((item) => item.branchId === invoice.branchId && item.ingredientId === line.ingredientId);

    if (!stock) {
      stock = {
        branchId: invoice.branchId,
        ingredientId: line.ingredientId,
        quantity: 0,
        minimumQuantity: 0,
        averageCost: line.unitPrice,
      };
      nextStocks.push(stock);
    }

    const existingValue = stock.quantity * stock.averageCost;
    const addedValue = line.quantity * line.unitPrice;
    const nextQuantity = stock.quantity + line.quantity;

    stock.quantity = nextQuantity;
    stock.averageCost = nextQuantity > 0 ? (existingValue + addedValue) / nextQuantity : line.unitPrice;

    movements.push({
      ingredientId: line.ingredientId,
      branchId: invoice.branchId,
      direction: 'in',
      quantity: line.quantity,
      reason: `${invoice.invoiceNo} alış faturası`,
    });
  }

  return { stocks: nextStocks, movements };
}

export function isAccountDebtTransaction(type: AccountTransactionType) {
  return type === 'customer_charge' || type === 'supplier_invoice' || type === 'partner_charge' || type === 'staff_charge';
}

export function calculateAccountBalances(accounts: Account[], transactions: AccountTransaction[]) {
  return accounts.map((account) => {
    const balance = transactions
      .filter((transaction) => transaction.accountId === account.id)
      .reduce((sum, transaction) => {
        if (isAccountDebtTransaction(transaction.type)) return sum + transaction.amount;
        return sum - transaction.amount;
      }, account.openingBalance);

    return { ...account, balance };
  });
}

export function requiresManagerApprovalForCustomerCharge(account: Account, currentBalance: number, chargeAmount: number) {
  if (account.type !== 'customer' || typeof account.creditLimit !== 'number') return false;
  return currentBalance + chargeAmount > account.creditLimit;
}

const saleStockResult = decreaseStockForSale(branchStocks, 'mrk', ERP_SEED_ORDER_ITEMS);
const invoiceStockResult = applyPurchaseInvoice(saleStockResult.stocks, demoPurchaseInvoice);
const invoiceTotal = calculateInvoiceTotal(demoPurchaseInvoice);
const deferredSaleTotal = calculateGrossSaleTotal(ERP_SEED_ORDER_ITEMS);

export const erpAccountTransactions: AccountTransaction[] = [
  { id: 'CHARGE-CUS-0', accountId: 'cus-ahmet', type: 'customer_charge', amount: 420, description: 'Önceki günden devreden veresiye', date: '2026-04-14' },
  { id: 'PAY-CUS-1', accountId: 'cus-ahmet', type: 'customer_payment', amount: 250, description: 'Nakit cari tahsilatı', date: '2026-04-15' },
  { id: 'CHARGE-CUS-1', accountId: 'cus-ahmet', type: 'customer_charge', amount: deferredSaleTotal, description: 'Merkez Salon 02 veresiye adisyonu', date: '2026-04-15' },
  { id: 'CHARGE-CUS-2', accountId: 'cus-ayse', type: 'customer_charge', amount: 640, description: 'Paket servis cari satışı', date: '2026-04-15' },
  { id: 'PAY-CUS-2', accountId: 'cus-ayse', type: 'customer_payment', amount: 200, description: 'Kart ile kısmi tahsilat', date: '2026-04-15' },
  { id: 'INV-SUP-0', accountId: 'sup-sut', type: 'supplier_invoice', amount: 1280, description: 'Süt ve krema alış faturası', date: '2026-04-14' },
  { id: 'PAY-SUP-1', accountId: 'sup-sut', type: 'supplier_payment', amount: 900, description: 'Banka tedarikçi ödemesi', date: '2026-04-15' },
  { id: 'INV-SUP-OLD', accountId: 'sup-gida', type: 'supplier_invoice', amount: 2320, description: 'Haftalık gıda alış faturası', date: '2026-04-14' },
  { id: 'INV-SUP-1', accountId: demoPurchaseInvoice.supplierAccountId, type: 'supplier_invoice', amount: invoiceTotal, description: `${demoPurchaseInvoice.invoiceNo} alış faturası`, date: demoPurchaseInvoice.date },
];

export const erpSnapshot = {
  saleStockResult,
  invoiceStockResult,
  invoiceTotal,
  deferredSaleTotal,
  accountBalances: calculateAccountBalances(erpAccounts, erpAccountTransactions),
  lowStock: invoiceStockResult.stocks.filter((stock) => stock.quantity <= stock.minimumQuantity),
};

export function getIngredient(ingredientId: string) {
  return erpIngredients.find((ingredient) => ingredient.id === ingredientId);
}

export function getAccount(accountId: string) {
  return erpAccounts.find((account) => account.id === accountId);
}

export function getRecipeForProduct(productName: string) {
  return productRecipes.find((recipe) => recipe.productName === productName);
}







export const treasuryAccounts: TreasuryAccount[] = [
  { id: 'cash-main', name: 'Nakit Kasa', type: 'cash', openingBalance: 12500 },
  { id: 'bank-main', name: 'Banka Hesabı', type: 'bank', openingBalance: 48200 },
  { id: 'pos-main', name: 'POS Hesabı', type: 'pos', openingBalance: 0, commissionRate: 2.4 },
  { id: 'euro-main', name: 'Euro Kasa', type: 'cash', openingBalance: 0 },
  { id: 'dollar-main', name: 'Dolar Kasa', type: 'cash', openingBalance: 0 },
];

export function buildTreasuryMovementsFromAccountTransactions(transactions: AccountTransaction[], accounts: Account[]): TreasuryMovement[] {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const movements: TreasuryMovement[] = [];
  const hasSeedTransactions = transactions.some((transaction) => ['PAY-CUS-1', 'PAY-CUS-2', 'PAY-SUP-1'].includes(transaction.id));

  if (hasSeedTransactions) {
    movements.push(
      { id: 'SALE-CASH-1', date: '2026-04-15', accountId: 'cash-main', direction: 'in', amount: 6200, description: 'Günlük nakit satış', source: 'sale' },
      { id: 'SALE-POS-1', date: '2026-04-15', accountId: 'pos-main', direction: 'in', amount: 18400, description: 'Günlük kart/POS satışları', source: 'sale' },
      { id: 'EXP-CASH-1', date: '2026-04-15', accountId: 'cash-main', direction: 'out', amount: 780, description: 'Günlük mutfak gideri', source: 'manual' },
    );
  }

  for (const transaction of transactions) {
    const account = accountMap.get(transaction.accountId);
    if (!account) continue;
    const normalizedDescription = transaction.description.toLocaleLowerCase('tr-TR');
    const targetTreasuryAccountId = normalizedDescription.includes('banka')
      ? 'bank-main'
      : normalizedDescription.includes('kart') || normalizedDescription.includes('pos')
        ? 'pos-main'
        : 'cash-main';

    if (transaction.type === 'customer_payment') {
      movements.push({
        id: `TR-${transaction.id}`,
        date: transaction.date,
        accountId: targetTreasuryAccountId,
        direction: 'in',
        amount: transaction.amount,
        description: `${account.name} tahsilatı`,
        source: 'collection',
      });
    }

    if (transaction.type === 'supplier_payment' || transaction.type === 'partner_payment') {
      movements.push({
        id: `TR-${transaction.id}`,
        date: transaction.date,
        accountId: targetTreasuryAccountId,
        direction: 'out',
        amount: transaction.amount,
        description: `${account.name} ödemesi`,
        source: 'supplier_payment',
      });
    }

    if (transaction.type === 'staff_payment' && !normalizedDescription.includes('mahsup')) {
      movements.push({
        id: `TR-${transaction.id}`,
        date: transaction.date,
        accountId: targetTreasuryAccountId,
        direction: 'out',
        amount: transaction.amount,
        description: `${account.name} personel ödemesi`,
        source: 'staff_payment',
      });
    }
  }

  return movements;
}

export function calculateTreasuryBalances(accounts: TreasuryAccount[], movements: TreasuryMovement[]) {
  return accounts.map((account) => {
    const balance = movements
      .filter((movement) => movement.accountId === account.id)
      .reduce((sum, movement) => movement.direction === 'in' ? sum + movement.amount : sum - movement.amount, account.openingBalance);

    return { ...account, balance };
  });
}

export function createPosTransferMovements(posBalance: number, commissionRate: number): TreasuryMovement[] {
  const commission = posBalance * (commissionRate / 100);
  const netTransfer = Math.max(0, posBalance - commission);
  const today = new Date().toISOString().slice(0, 10);

  if (posBalance <= 0) return [];

  return [
    { id: `POS-OUT-${Date.now()}`, date: today, accountId: 'pos-main', direction: 'out', amount: netTransfer, description: 'POS hesabından bankaya net aktarım', source: 'pos_transfer' },
    { id: `BANK-IN-${Date.now()}`, date: today, accountId: 'bank-main', direction: 'in', amount: netTransfer, description: 'POS net banka aktarımı', source: 'pos_transfer' },
    { id: `POS-COM-${Date.now()}`, date: today, accountId: 'pos-main', direction: 'out', amount: commission, description: 'POS banka komisyonu', source: 'commission' },
  ];
}



