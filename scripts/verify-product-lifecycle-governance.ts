import {
  analyzeProductLifecycleAction,
  createProductRevisionSnapshot,
  isRuntimeVisibleProduct,
} from '../lib/product-lifecycle-governance';
import { compileCanonicalPosCatalog } from '../lib/canonical-pos-catalog';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const saleProduct = {
  id: 'product-1',
  posKey: 'POS-AAAA11',
  name: 'Caffe Latte',
  productType: 'sale_product',
  lifecycleStatus: 'published',
  publishStatus: 'published',
  active: true,
  revision: 3,
  price: 145,
  vatRate: 10,
};

assert(isRuntimeVisibleProduct(saleProduct), 'published sale product must be runtime visible');
assert(!isRuntimeVisibleProduct({ ...saleProduct, lifecycleStatus: 'archived' }), 'archived product must not be runtime visible');
assert(!isRuntimeVisibleProduct({ ...saleProduct, publishStatus: 'draft' }), 'draft product must not be runtime visible');
assert(!isRuntimeVisibleProduct({ ...saleProduct, deletedAt: new Date().toISOString() }), 'soft-deleted product must not be runtime visible');

const deleteDecision = analyzeProductLifecycleAction(saleProduct, 'delete', {
  activeOrderCount: 1,
  offlineQueueCount: 1,
  recipeReferenceCount: 2,
  cachedRuntimeReferenceCount: 1,
});
assert(!deleteDecision.allowed, 'delete must be blocked while runtime/order references exist');
assert(deleteDecision.reasons.some((reason) => reason.code === 'active_runtime_sessions'), 'active sessions reason missing');

const archiveDecision = analyzeProductLifecycleAction(saleProduct, 'archive', {
  activeOrderCount: 1,
  offlineQueueCount: 1,
});
assert(archiveDecision.allowed, 'archive may be scheduled while active sessions exist');
assert(archiveDecision.deferred, 'archive should become deferred with active runtime references');

const snapshot = createProductRevisionSnapshot(saleProduct);
assert(snapshot.revision === 3, 'revision snapshot must preserve revision');
assert(snapshot.posKey === 'POS-AAAA11', 'revision snapshot must preserve posKey');

const catalog = compileCanonicalPosCatalog([
  {
    id: 'POS-AAAA11',
    productId: 'product-1',
    posKey: 'POS-AAAA11',
    revision: 3,
    name: 'Caffe Latte',
    category: 'kahve',
    productType: 'sale_product',
    salesUnit: 'portion',
    price: 145,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
    lifecycleStatus: 'published',
    publishStatus: 'published',
  },
  {
    id: 'POS-BBBB22',
    productId: 'product-2',
    posKey: 'POS-BBBB22',
    revision: 1,
    name: 'Archived Tea',
    category: 'icecek',
    productType: 'sale_product',
    salesUnit: 'portion',
    price: 80,
    vatRate: 10,
    allowComplimentary: true,
    allowDiscount: true,
    happyHourEligible: true,
    lifecycleStatus: 'archived',
    publishStatus: 'published',
  },
]);

assert(catalog.itemCount === 1, 'canonical catalog must exclude archived lifecycle products');
assert(catalog.observability.invalidItemCount === 1, 'catalog observability must count lifecycle-filtered products');

console.log('product lifecycle governance verified', {
  deleteAllowed: deleteDecision.allowed,
  archiveDeferred: archiveDecision.deferred,
  catalogRevision: catalog.catalogRevision,
});
