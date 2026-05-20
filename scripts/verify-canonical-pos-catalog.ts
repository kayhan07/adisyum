import assert from 'node:assert/strict';
import { compileCanonicalPosCatalog, isCatalogStale, catalogSafeModeReason } from '../lib/canonical-pos-catalog';
import { createPosKey } from '../lib/product-identity';
import type { PosCatalogProduct } from '../lib/sale-product-catalog';

const items: PosCatalogProduct[] = [
  {
    id: createPosKey('latte'),
    productId: 'product-latte',
    posKey: createPosKey('latte'),
    legacyKey: 'Caffe Latte',
    revision: 2,
    name: 'Caffe Latte',
    category: 'Kahve',
    productType: 'sale_product',
    salesUnit: 'portion',
    price: 145,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
  },
  {
    id: createPosKey('combo'),
    productId: 'product-combo',
    posKey: createPosKey('combo'),
    revision: 1,
    name: 'Aile Combo',
    category: 'Menuler',
    productType: 'combo_product',
    salesUnit: 'portion',
    price: 650,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
  },
];

const catalog = compileCanonicalPosCatalog(items, {
  tenantId: 'ABN-48291',
  branchId: 'main',
  channel: 'pos',
  deviceSync: [
    { deviceId: 'cashier-1', branchId: 'main', catalogRevision: 'CAT-OLD', lastSeenAt: new Date().toISOString(), status: 'stale', syncLagMs: 1200 },
  ],
});

assert.equal(catalog.catalogRevision.startsWith('CAT-'), true);
assert.equal(catalog.itemCount, 2);
assert.equal(catalog.items[0].catalogRevision, catalog.catalogRevision);
assert.equal(catalog.items[0].productSnapshot.posKey, createPosKey('latte'));
assert.equal(catalog.items[0].productSnapshot.revision, 2);
assert.equal(catalog.observability.staleDeviceCount, 1);
assert.equal(isCatalogStale('CAT-OLD', catalog.catalogRevision), true);
assert.equal(isCatalogStale(catalog.catalogRevision, catalog.catalogRevision), false);
assert.equal(catalogSafeModeReason(catalog), null);

const emptyCatalog = compileCanonicalPosCatalog([], { tenantId: 'ABN-48291' });
assert.equal(catalogSafeModeReason(emptyCatalog), 'empty_catalog');

const hardened = compileCanonicalPosCatalog([
  ...items,
  { ...items[0], id: 'duplicate', productId: 'duplicate-product' },
  { ...items[0], id: 'negative', productId: 'negative-product', posKey: createPosKey('negative'), price: -1 },
  { ...items[0], id: 'draft', productId: 'draft-product', posKey: createPosKey('draft'), lifecycleStatus: 'draft', publishStatus: 'draft' },
], { tenantId: 'ABN-48291' });
assert.equal(hardened.itemCount, 2);
assert.equal(hardened.observability.invalidItemCount, 3);

console.log('canonical pos catalog valid');
