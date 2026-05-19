import assert from 'node:assert/strict';
import {
  filterSellableProducts,
  inferProductDomainType,
  isSellableProductType,
  resolveProductDomainType,
} from '../lib/product-domain';
import { buildPosCatalogFromStored, type StoredSaleProduct } from '../lib/sale-product-catalog';

const baseSaleProduct: StoredSaleProduct = {
  id: 'latte',
  name: 'Caffe Latte',
  category: 'Kahve',
  productType: 'sale_product',
  salesUnit: 'portion',
  currentStock: '0',
  stockProcurementType: 'recipe',
  barStockMode: 'none',
  glassesPerBottle: '6',
  bottleVolumeCl: '70',
  portionVolumeCl: '5',
  initialBottleCount: '0',
  dispensedPortions: '0',
  openBottleSnapshots: [],
  salePrice: '145',
  salePrice1: '145',
  salePrice2: '145',
  salePrice3: '145',
  price1WindowEnabled: true,
  price1Start: '',
  price1End: '',
  price2WindowEnabled: false,
  price2Start: '',
  price2End: '',
  allowComplimentary: true,
  allowDiscount: true,
  fixedMenu: false,
  happyHourEligible: true,
  eventPriceEligible: true,
  vatRate: 10,
  salesCount: 0,
  recipeLines: [],
  portionMultiplier: '1',
  recipeOverrides: [],
  wastePercentage: '0',
  operationalCost: '0',
  source: 'created',
};

const stockItem = {
  ...baseSaleProduct,
  id: 'milk',
  name: 'Sut',
  category: 'Hammadde / Stok',
  productType: 'stock_item' as const,
};

const semiProduct = {
  ...baseSaleProduct,
  id: 'sauce',
  name: 'Hazir Sos',
  category: 'Hazirlik',
  productType: 'semi_product' as const,
};

const comboProduct = {
  ...baseSaleProduct,
  id: 'family-combo',
  name: 'Aile Paketi',
  category: 'Menuler',
  productType: 'combo_product' as const,
};

assert.equal(inferProductDomainType({ name: 'Sut', category: 'Hammadde / Stok' }), 'stock_item');
assert.equal(inferProductDomainType({ name: 'Hazir Sos', category: 'Hazirlik' }), 'semi_product');
assert.equal(inferProductDomainType({ name: 'Aile Paketi', category: 'Menuler' }), 'combo_product');
assert.equal(isSellableProductType(resolveProductDomainType(baseSaleProduct)), true);
assert.equal(isSellableProductType(resolveProductDomainType(stockItem)), false);

const sellable = filterSellableProducts([baseSaleProduct, stockItem, semiProduct, comboProduct], 'product-boundary-test');
assert.deepEqual(sellable.map((item) => item.id), ['latte', 'family-combo']);

const posCatalog = buildPosCatalogFromStored([baseSaleProduct, stockItem, semiProduct, comboProduct]);
assert.deepEqual(posCatalog.map((item) => item.id), ['latte', 'family-combo']);

console.log('product domain boundary valid');
