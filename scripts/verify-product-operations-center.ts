import assert from 'node:assert/strict';
import {
  buildProductOperationRows,
  simulateProductOperationImpact,
  summarizeProductOperations,
} from '../lib/product-operations';

const rows = buildProductOperationRows(
  [
    {
      id: 'latte',
      name: 'Caffe Latte',
      category: 'Kahve',
      productType: 'sale_product',
      salePrice: '145',
      recipeLines: [
        { ingredientId: 'milk', qty: '200', unit: 'ml' },
        { ingredientId: 'coffee-bean', qty: '10', unit: 'gr' },
      ],
    },
    {
      id: 'milk',
      name: 'Sut',
      category: 'Hammadde / Stok',
      productType: 'stock_item',
      purchasePrice: '36',
      currentQuantity: '12',
      minimumQuantity: '18',
    },
    {
      id: 'family-combo',
      name: 'Aile Combo',
      category: 'Menuler',
      productType: 'combo_product',
      salePrice: '650',
      recipeLines: [{ ingredientId: 'latte', qty: '1', unit: 'adet' }],
    },
  ],
  {
    ingredientCosts: {
      milk: 36,
      'coffee-bean': 480,
      latte: 145,
    },
    printerRoutes: {
      Kahve: 'Bar',
      Menuler: 'Mutfak',
    },
  },
);

const summary = summarizeProductOperations(rows);
const latte = rows.find((row) => row.id === 'latte');
const milk = rows.find((row) => row.id === 'milk');
const combo = rows.find((row) => row.id === 'family-combo');

assert.ok(latte);
assert.ok(milk);
assert.ok(combo);
assert.equal(latte.posVisible, true);
assert.equal(combo.posVisible, true);
assert.equal(milk.posVisible, false);
assert.equal(milk.domain, 'stock_items');
assert.equal(summary.sellable, 2);
assert.equal(summary.inventoryOnly, 1);
assert.equal(summary.posLeakage, 0);
assert.ok(latte.cost > 0);
assert.ok(latte.marginPercent !== null && latte.marginPercent > 35);
assert.equal(milk.issues.some((issue) => issue.code === 'low_stock'), true);

const impact = simulateProductOperationImpact(latte, rows);
assert.equal(impact.affectedRecipes, 1);
assert.equal(impact.cacheTargets.includes('POS katalog'), true);

console.log('product operations center valid');
