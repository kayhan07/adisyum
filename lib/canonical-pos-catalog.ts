import { hashProductIdentity, resolveProductIdentity } from '@/lib/product-identity';
import { isSellableProductType } from '@/lib/product-domain';
import { isRuntimeVisibleProduct, type ProductLifecycleStatus, type ProductPublishState } from '@/lib/product-lifecycle-governance';
import type { PosCatalogProduct } from '@/lib/sale-product-catalog';

export type CatalogChannel = 'pos' | 'qr' | 'kiosk' | 'delivery' | 'waiter_tablet' | 'mobile_pos';
export type CatalogPublishStatus = 'draft' | 'staged' | 'published' | 'degraded';

export type CatalogDeviceSync = {
  deviceId: string;
  branchId?: string;
  catalogRevision: string;
  lastSeenAt: string;
  status: 'current' | 'stale' | 'offline' | 'failed';
  syncLagMs: number;
};

export type CanonicalPosCatalogItem = PosCatalogProduct & {
  catalogRevision: string;
  productSnapshot: {
    productId?: string;
    posKey: string;
    name: string;
    category: string;
    productType: string;
    price: number;
    vatRate?: number;
    revision: number;
    sku?: string;
    barcode?: string;
    externalId?: string;
    legacyKey?: string;
    lifecycleStatus?: ProductLifecycleStatus;
    publishStatus?: ProductPublishState;
  };
  branchOverlay: {
    branchId?: string;
    visible: boolean;
    available: boolean;
    priceOverride?: number;
    taxOverride?: number;
  };
};

export type CanonicalPosCatalog = {
  schemaVersion: 1;
  catalogRevision: string;
  tenantId?: string;
  branchId?: string;
  channel: CatalogChannel;
  status: CatalogPublishStatus;
  compiledAt: string;
  itemCount: number;
  checksum: string;
  items: CanonicalPosCatalogItem[];
  deviceSync: CatalogDeviceSync[];
  observability: {
    staleDeviceCount: number;
    invalidItemCount: number;
    offlineSnapshotAgeMs: number;
    compileDurationMs: number;
  };
};

export type CatalogCompileOptions = {
  tenantId?: string;
  branchId?: string;
  channel?: CatalogChannel;
  status?: CatalogPublishStatus;
  deviceSync?: CatalogDeviceSync[];
  compiledAt?: string;
};

function stableCatalogPayload(products: PosCatalogProduct[]) {
  return JSON.stringify(products
    .map((product) => ({
      posKey: product.posKey,
      productId: product.productId,
      name: product.name,
      category: product.category,
      productType: product.productType,
      price: product.price,
      revision: product.revision,
      sku: product.sku,
      barcode: product.barcode,
      externalId: product.externalId,
      lifecycleStatus: product.lifecycleStatus,
      publishStatus: product.publishStatus,
    }))
    .sort((a, b) => a.posKey.localeCompare(b.posKey)));
}

export function createCatalogRevision(products: PosCatalogProduct[], options: Pick<CatalogCompileOptions, 'tenantId' | 'branchId' | 'channel'> = {}) {
  const seed = `${options.tenantId ?? 'tenant'}:${options.branchId ?? 'global'}:${options.channel ?? 'pos'}:${stableCatalogPayload(products)}`;
  return `CAT-${hashProductIdentity(seed).padEnd(6, '0')}`;
}

export function compileCanonicalPosCatalog(products: PosCatalogProduct[], options: CatalogCompileOptions = {}): CanonicalPosCatalog {
  const startedAt = Date.now();
  const channel = options.channel ?? 'pos';
  const compiledAt = options.compiledAt ?? new Date().toISOString();
  const validProducts = products.filter((product) => isSellableProductType(product.productType) && isRuntimeVisibleProduct(product));
  const catalogRevision = createCatalogRevision(validProducts, options);
  const items = validProducts.map((product): CanonicalPosCatalogItem => {
    const identity = resolveProductIdentity({
      id: product.productId ?? product.id,
      posKey: product.posKey,
      sku: product.sku,
      barcode: product.barcode,
      externalId: product.externalId,
      legacyKey: product.legacyKey,
      name: product.name,
    });
    const revision = Math.max(1, product.revision ?? 1);
    return {
      ...product,
      id: identity.posKey,
      posKey: identity.posKey,
      catalogRevision,
      revision,
      productSnapshot: {
        productId: product.productId,
        posKey: identity.posKey,
        name: product.name,
        category: product.category,
        productType: product.productType,
        price: product.price,
        vatRate: product.vatRate,
        revision,
        sku: identity.sku,
        barcode: identity.barcode,
        externalId: identity.externalId,
        legacyKey: identity.legacyKey,
        lifecycleStatus: product.lifecycleStatus,
        publishStatus: product.publishStatus,
      },
      branchOverlay: {
        branchId: options.branchId,
        visible: true,
        available: true,
      },
    };
  });

  const staleDeviceCount = (options.deviceSync ?? []).filter((device) => device.catalogRevision !== catalogRevision || device.status !== 'current').length;
  const checksum = hashProductIdentity(JSON.stringify(items.map((item) => item.productSnapshot)));

  return {
    schemaVersion: 1,
    catalogRevision,
    tenantId: options.tenantId,
    branchId: options.branchId,
    channel,
    status: options.status ?? 'published',
    compiledAt,
    itemCount: items.length,
    checksum,
    items,
    deviceSync: options.deviceSync ?? [],
    observability: {
      staleDeviceCount,
      invalidItemCount: products.length - validProducts.length,
      offlineSnapshotAgeMs: 0,
      compileDurationMs: Math.max(0, Date.now() - startedAt),
    },
  };
}

export function isCatalogStale(deviceRevision: string | null | undefined, catalogRevision: string) {
  return !deviceRevision || deviceRevision !== catalogRevision;
}

export function catalogSafeModeReason(catalog: CanonicalPosCatalog) {
  if (catalog.itemCount === 0) return 'empty_catalog';
  if (catalog.observability.invalidItemCount > 0) return 'invalid_items_filtered';
  if (catalog.status === 'degraded') return 'catalog_degraded';
  return null;
}
