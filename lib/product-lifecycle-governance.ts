import { isSellableProductType } from '@/lib/product-domain';

export type ProductLifecycleStatus = 'draft' | 'active' | 'published' | 'archived' | 'deprecated' | 'deleted';
export type ProductPublishState = 'draft' | 'validating' | 'staged' | 'published' | 'failed' | 'rolled_back';
export type ProductLifecycleAction = 'publish' | 'archive' | 'deprecate' | 'delete' | 'rollback' | 'activate';
export type ProductLifecycleSeverity = 'info' | 'warning' | 'critical' | 'blocked';

export const RUNTIME_VISIBLE_LIFECYCLE_STATES: ProductLifecycleStatus[] = ['active', 'published'];
export const NON_DESTRUCTIVE_DELETE_STATES: ProductLifecycleStatus[] = ['archived', 'deprecated', 'deleted'];

export type ProductLifecycleInput = {
  id: string;
  tenantId?: string;
  branchId?: string | null;
  posKey?: string | null;
  name: string;
  productType?: string | null;
  active?: boolean | null;
  lifecycleStatus?: string | null;
  publishStatus?: string | null;
  revision?: number | null;
  price?: string | number | { toString(): string } | null;
  vatRate?: number | null;
  categoryId?: string | null;
  metadata?: unknown;
  deletedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  deprecatedAt?: Date | string | null;
  publishedAt?: Date | string | null;
};

export type ProductDependencyGraph = {
  activeOrderCount?: number;
  openTicketCount?: number;
  pendingKitchenCount?: number;
  offlineQueueCount?: number;
  websocketSessionCount?: number;
  modifierDependencyCount?: number;
  comboDependencyCount?: number;
  recipeReferenceCount?: number;
  branchReferenceCount?: number;
  cachedRuntimeReferenceCount?: number;
  marketplaceReferenceCount?: number;
  affectedBranches?: Array<{ branchId: string; label?: string }>;
  affectedDevices?: Array<{ deviceId: string; catalogRevision?: string; status?: string }>;
};

export type ProductLifecycleDecision = {
  action: ProductLifecycleAction;
  allowed: boolean;
  deferred: boolean;
  severity: ProductLifecycleSeverity;
  targetStatus: ProductLifecycleStatus;
  targetPublishStatus: ProductPublishState;
  reasons: Array<{ code: string; severity: ProductLifecycleSeverity; message: string }>;
  impact: {
    activeSessions: number;
    orderReferences: number;
    dependencyReferences: number;
    runtimeReferences: number;
    marketplaceReferences: number;
    affectedBranchCount: number;
    affectedDeviceCount: number;
  };
  requiredSteps: string[];
};

export type ProductRevisionSnapshot = {
  productId: string;
  posKey?: string | null;
  name: string;
  productType?: string | null;
  lifecycleStatus: ProductLifecycleStatus;
  publishStatus: ProductPublishState;
  revision: number;
  price?: string | number | { toString(): string } | null;
  vatRate?: number | null;
  categoryId?: string | null;
  metadata?: unknown;
  capturedAt: string;
};

function normalizeLifecycleStatus(value: string | null | undefined): ProductLifecycleStatus {
  if (value === 'draft' || value === 'active' || value === 'published' || value === 'archived' || value === 'deprecated' || value === 'deleted') {
    return value;
  }
  return 'active';
}

function normalizePublishStatus(value: string | null | undefined): ProductPublishState {
  if (value === 'draft' || value === 'validating' || value === 'staged' || value === 'published' || value === 'failed' || value === 'rolled_back') {
    return value;
  }
  return 'published';
}

export function isRuntimeVisibleProduct(product: {
  active?: boolean | null;
  productType?: string | null;
  lifecycleStatus?: string | null;
  publishStatus?: string | null;
  deletedAt?: Date | string | null;
}) {
  if (product.deletedAt) return false;
  if (product.active === false) return false;
  if (!isSellableProductType(product.productType ?? 'sale_product')) return false;
  const lifecycleStatus = normalizeLifecycleStatus(product.lifecycleStatus);
  const publishStatus = normalizePublishStatus(product.publishStatus);
  return RUNTIME_VISIBLE_LIFECYCLE_STATES.includes(lifecycleStatus) && publishStatus === 'published';
}

export function createProductRevisionSnapshot(product: ProductLifecycleInput): ProductRevisionSnapshot {
  return {
    productId: product.id,
    posKey: product.posKey,
    name: product.name,
    productType: product.productType,
    lifecycleStatus: normalizeLifecycleStatus(product.lifecycleStatus),
    publishStatus: normalizePublishStatus(product.publishStatus),
    revision: Math.max(1, product.revision ?? 1),
    price: product.price,
    vatRate: product.vatRate,
    categoryId: product.categoryId,
    metadata: product.metadata ?? {},
    capturedAt: new Date().toISOString(),
  };
}

export function analyzeProductLifecycleAction(
  product: ProductLifecycleInput,
  action: ProductLifecycleAction,
  graph: ProductDependencyGraph = {},
): ProductLifecycleDecision {
  const lifecycleStatus = normalizeLifecycleStatus(product.lifecycleStatus);
  const publishStatus = normalizePublishStatus(product.publishStatus);
  const activeSessions = (graph.activeOrderCount ?? 0) + (graph.openTicketCount ?? 0) + (graph.pendingKitchenCount ?? 0);
  const orderReferences = graph.activeOrderCount ?? 0;
  const dependencyReferences = (graph.modifierDependencyCount ?? 0) + (graph.comboDependencyCount ?? 0) + (graph.recipeReferenceCount ?? 0) + (graph.branchReferenceCount ?? 0);
  const runtimeReferences = (graph.cachedRuntimeReferenceCount ?? 0) + (graph.offlineQueueCount ?? 0) + (graph.websocketSessionCount ?? 0);
  const marketplaceReferences = graph.marketplaceReferenceCount ?? 0;
  const reasons: ProductLifecycleDecision['reasons'] = [];

  if (action === 'delete' && lifecycleStatus !== 'archived' && lifecycleStatus !== 'deprecated') {
    reasons.push({
      code: 'delete_requires_archive_first',
      severity: 'blocked',
      message: 'Silme isteği için ürün önce arşivlenmeli veya deprecated durumuna alınmalı.',
    });
  }
  if ((action === 'delete' || action === 'archive' || action === 'deprecate') && activeSessions > 0) {
    reasons.push({
      code: 'active_runtime_sessions',
      severity: action === 'delete' ? 'blocked' : 'warning',
      message: 'Ürün açık adisyon, mutfak kuyruğu veya aktif runtime oturumlarında kullanılıyor.',
    });
  }
  if ((action === 'delete' || action === 'archive') && runtimeReferences > 0) {
    reasons.push({
      code: 'runtime_references_present',
      severity: action === 'delete' ? 'blocked' : 'warning',
      message: 'Offline kuyruk, websocket veya katalog cache içinde ürün referansı var.',
    });
  }
  if ((action === 'delete' || action === 'archive') && dependencyReferences > 0) {
    reasons.push({
      code: 'dependency_graph_present',
      severity: action === 'delete' ? 'blocked' : 'warning',
      message: 'Combo, modifier, reçete veya şube bağımlılıkları temizlenmeden ürün kaldırılamaz.',
    });
  }
  if (action === 'publish' && !isSellableProductType(product.productType ?? 'sale_product')) {
    reasons.push({
      code: 'inventory_not_publishable_to_runtime',
      severity: 'blocked',
      message: 'Hammadde veya stok ürünü POS runtime kataloğuna yayınlanamaz.',
    });
  }
  if (action === 'rollback' && (product.revision ?? 1) <= 1) {
    reasons.push({
      code: 'no_previous_revision',
      severity: 'blocked',
      message: 'Geri alınabilecek önceki ürün revizyonu yok.',
    });
  }

  const blocked = reasons.some((reason) => reason.severity === 'blocked');
  const warning = reasons.some((reason) => reason.severity === 'warning');
  const deferred = !blocked && (action === 'archive' || action === 'deprecate') && (activeSessions > 0 || runtimeReferences > 0);
  const severity: ProductLifecycleSeverity = blocked ? 'blocked' : warning ? 'warning' : 'info';

  const targetStatus: Record<ProductLifecycleAction, ProductLifecycleStatus> = {
    publish: 'published',
    archive: 'archived',
    deprecate: 'deprecated',
    delete: 'deleted',
    rollback: lifecycleStatus,
    activate: 'active',
  };
  const targetPublishStatus: Record<ProductLifecycleAction, ProductPublishState> = {
    publish: 'published',
    archive: publishStatus,
    deprecate: publishStatus,
    delete: 'published',
    rollback: 'rolled_back',
    activate: 'staged',
  };

  const requiredSteps = [
    'create immutable product revision snapshot',
    'validate product dependency graph',
    'compile canonical POS catalog',
    'invalidate runtime/catalog caches',
    'broadcast tenant-scoped catalog refresh',
    'record product audit event',
  ];
  if (deferred) requiredSteps.unshift('schedule deferred removal after active sessions close');
  if (action === 'delete') requiredSteps.unshift('soft delete only; hard delete is maintenance-only');

  return {
    action,
    allowed: !blocked,
    deferred,
    severity,
    targetStatus: targetStatus[action],
    targetPublishStatus: targetPublishStatus[action],
    reasons,
    impact: {
      activeSessions,
      orderReferences,
      dependencyReferences,
      runtimeReferences,
      marketplaceReferences,
      affectedBranchCount: graph.affectedBranches?.length ?? 0,
      affectedDeviceCount: graph.affectedDevices?.length ?? 0,
    },
    requiredSteps,
  };
}

export function buildLifecycleAuditEvent(product: ProductLifecycleInput, decision: ProductLifecycleDecision, actorId?: string) {
  return {
    action: `product.${decision.action}`,
    entity: 'product',
    entityId: product.id,
    actorId,
    before: createProductRevisionSnapshot(product),
    after: {
      lifecycleStatus: decision.targetStatus,
      publishStatus: decision.targetPublishStatus,
      deferred: decision.deferred,
    },
    metadata: {
      posKey: product.posKey,
      allowed: decision.allowed,
      reasons: decision.reasons,
      impact: decision.impact,
      requiredSteps: decision.requiredSteps,
    },
  };
}
