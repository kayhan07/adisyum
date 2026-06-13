'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, CreditCard, Minus, Plus, RotateCcw, Search, Send, Zap, X } from 'lucide-react';
import {
  appendStoredAccount,
  loadStoredAccounts,
  subscribeToStoredAccountChanges,
} from '@/lib/account-store';
import { getDefaultCompanyState, loadCompanyState, subscribeToCompanyChanges } from '@/lib/company-store';
import {
  getPaymentRequestedTableIds,
  getStoredTableMeta,
  setStoredTableMeta,
  subscribeToPaymentRequestedChanges,
  type StoredTableMeta,
} from '@/lib/table-payment-state';
import {
  loadStoredTableReservations,
  subscribeToStoredTableReservations,
} from '@/lib/table-reservation-store';

import { getDefaultSessionState, hydrateSessionStateFromAuth, loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';
import { getDefaultAccessState, loadAccessState, subscribeToAccessChanges } from '@/lib/access-store';
import {
  getDefaultIntegrationState,
  loadIntegrationState,
  saveIntegrationState,
  subscribeToIntegrationChanges,
} from '@/lib/integration-store';
import {
  getCatalogPriceByName,
  getDefaultPosCatalog,
  loadStoredSaleProducts,
  buildPosCatalogFromStored,
  resolveSaleProductPrice,
  subscribeToStoredSaleProductsChanges,
  type StoredSaleProduct,
} from '@/lib/sale-product-catalog';
import { isSellableProductType, type ProductDomainType } from '@/lib/product-domain';
import { normalizeProductName } from '@/lib/product-name-normalization';
import { appendStoredFinanceAccountTransaction, buildFinanceTransaction } from '@/lib/finance-runtime-store';
import { erpAccounts, type Account } from '@/lib/erp-engine';
import { useSeedBusinessDataEnabled } from '@/lib/tenant-clean-start';
import { appendPaymentJournalEntries, buildPaymentJournalEntry } from '@/lib/payment-journal-store';
import { getDefaultTableLayoutState, loadTableLayoutState, refreshTableLayoutState, subscribeToTableLayoutChanges } from '@/lib/table-layout-store';
import { createAutoProductMapping, getProductMapping, upsertProductMapping, validateProductMapping } from '@/lib/pos-mapping-store';
import { queueOfflinePaymentSnapshot } from '@/lib/offline-sync-store';
import { refreshAuthoritativeOrdersByTable, replaceAuthoritativeOrdersByTable } from '@/lib/client/authoritative-table-orders';
import { type PosOrderReconciliationSource } from '@/lib/pos-order-reconciliation';
import {
  appendOptimisticLine,
  commitOrderMutation,
  createOptimisticLine,
  createOrderMutation,
  createPendingMutation,
  dispatchOrderMutation,
  rollbackOrderMutation,
  type PendingMutation,
} from '@/lib/pos-runtime/order-mutations';
import {
  hydrateAuthoritativeRuntime,
  reconcileRuntimeSyncSnapshot,
} from '@/lib/pos-runtime/runtime-sync-engine';
import { createRuntimeDiagnostics } from '@/lib/pos-runtime/runtime-event-bus';
import {
  persistRecentAccountIds,
  persistTableLiveTotals,
  persistTablePaymentRequested,
  restoreRecentAccountIds,
} from '@/lib/pos-runtime/runtime-persistence-engine';
import { hydrateRuntimeSessionContext, traceRuntimeSessionHydrated } from '@/lib/runtime/runtime-session-engine';
import { getRuntimeAuthFailureSnapshot, isRuntimeAuthRequired, resetRuntimeAuthFailureLock, runtimeFetch } from '@/lib/runtime/runtime-api';
import { resolveStockRuntimeBranchId } from '@/lib/runtime/tenant-runtime-context';
import {
  isRuntimeBarCategory,
  readBridgePrinterNames,
  registerRuntimeDevices,
  resolveRuntimePrinterRoute,
  traceDeviceOwnershipRestored,
} from '@/lib/device-runtime/device-session-registry';
import { printCustomerReceipt, printKitchenTicket, printBarTicket } from '@/lib/receipt-formatter';
import { recordOrderForSmartStock } from '@/lib/smart-recipe-stock-engine';
import type { BranchId } from '@/lib/erp-engine';

type Category = { id: string; label: string };
type ProductCard = {
  id: string;
  productId?: string;
  posKey?: string;
  catalogRevision?: string;
  sku?: string;
  barcode?: string;
  externalId?: string;
  legacyKey?: string;
  revision?: number;
  name: string;
  category: string;
  productType: ProductDomainType;
  printCategory?: string;
  price: number;
  allowComplimentary?: boolean;
  allowDiscount?: boolean;
  happyHourEligible?: boolean;
  productSnapshot?: Record<string, unknown>;
};
type PosClickDebugSnapshot = {
  event: string;
  at: string;
  source: string;
  tableId?: string | null;
  selectedTableId?: string;
  productId?: string;
  productName?: string;
  posKey?: string;
  catalogRevision?: string;
  productSnapshotStatus?: string;
  mutationId?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  reason?: string;
};
type OrderLine = {
  id: string;
  clientMutationId?: string;
  orderRevision?: number;
  updatedAtMs?: number;
  productId?: string;
  name: string;
  qty: number;
  note: string;
  price: number;
  category: string;
  printCategory?: string;
  sentQty: number;
  guestName?: string;
  spicePreference?: 'acili' | 'acisiz' | 'standart';
  cookingPreference?: 'standart' | 'az' | 'orta' | 'iyi';
  extrasNote?: string;
  removalNote?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  isReturn?: boolean;
  allowDiscount?: boolean;
  allowComplimentary?: boolean;
  happyHourEligible?: boolean;
  productSnapshot?: Record<string, unknown>;
};
type TableStatus = 'available' | 'occupied' | 'reserved';
type AuthoritativePaymentState = {
  orderId: string;
  orderStatus: string;
  orderTotal: number;
  paidTotal: number;
  remainingTotal: number;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    currency: string;
    receivedAt: string;
    reconciliationKey: string;
  }>;
};
type PosTable = {
  id: string;
  name: string;
  group: string;
  total: number;
  status: TableStatus;
  paymentRequested: boolean;
  guests: number;
  reservationName?: string;
  reservationTime?: string;
  reservationDate?: string;
  reservationEvent?: string;
  reservationDeposit?: number;
  note?: string;
  mergedFromIds?: string[];
  mergedSnapshot?: StoredTableMeta['mergedSnapshot'];
};
type UndoEntry = {
  snapshot: Record<string, OrderLine[]>;
  label: string;
};
type PaymentMethod = 'cash' | 'card' | 'mixed' | 'account' | 'meal' | 'euro' | 'dollar';
type PaymentScope = 'full' | 'split';
type SplitMode = 'person' | 'amount';
type ActivePadTarget = 'cash' | 'card' | 'splitAmount';
type AccountChargeFilter = 'all' | 'customer' | 'partner' | 'recent';

type OrderComposerProps = {
  initialTableId?: string;
  autoOpenPayment?: boolean;
};

const VAT_RATE = 0.1;
const RECENT_ACCOUNT_KEY = 'adisyon-recent-charge-accounts';
const EMPTY_ORDER_LINES: OrderLine[] = [];
const EMPTY_ORDERS_BY_TABLE: Record<string, OrderLine[]> = {};

function normalizeCategoryKey(category: string) {
  return category.trim().toLocaleLowerCase('tr-TR');
}

function deriveSaleProductCategories(products: ProductCard[]): Category[] {
  const seen = new Map<string, string>();
  products.forEach((product) => {
    if (product.productType !== 'sale_product' && product.productType !== 'combo_product') return;
    const category = product.category.trim();
    if (!category) return;
    const key = normalizeCategoryKey(category);
    if (!seen.has(key)) seen.set(key, category);
  });
  return [
    { id: 'all', label: 'Tümü' },
    ...Array.from(seen.values()).map((category) => ({ id: category, label: category })),
  ];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatForeignMoney(value: number, currency: 'EUR' | 'USD') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatGrossMoney(value: number) {
  return formatMoney(value);
}

function parseAmountInput(value: string) {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function cloneOrders(source: Record<string, OrderLine[]>) {
  return Object.fromEntries(
    Object.entries(source).map(([tableId, lines]) => [tableId, lines.map((line) => ({ ...line }))]),
  );
}

function areStringArraysEqual(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function areOrderMapsEqual(first: Record<string, OrderLine[]>, second: Record<string, OrderLine[]>) {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (!areStringArraysEqual(firstKeys.sort(), secondKeys.sort())) return false;

  return firstKeys.every((tableId) => {
    const firstLines = first[tableId] ?? EMPTY_ORDER_LINES;
    const secondLines = second[tableId] ?? EMPTY_ORDER_LINES;
    return (
      firstLines.length === secondLines.length &&
      firstLines.every((line, index) => JSON.stringify(line) === JSON.stringify(secondLines[index]))
    );
  });
}

const logOrderFlow = createRuntimeDiagnostics('adisyon-flow');
const SLOW_POS_MUTATION_MS = 3000;
const SLOW_PAYMENT_COMMIT_MS = 5000;

function businessNowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function businessDurationMs(startedAt: number) {
  return Math.round(businessNowMs() - startedAt);
}

function getProductSnapshotStatus(product: ProductCard) {
  const snapshot = product.productSnapshot;
  if (!snapshot) return 'missing';
  if (snapshot.posKey !== product.posKey) return 'posKey-mismatch';
  if (!product.catalogRevision) return 'missing-catalogRevision';
  if (!snapshot.revision) return 'missing-snapshotRevision';
  return 'ready';
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function ensureOrderProductMapping(product: ProductCard) {
  const mapping = getProductMapping(product.id, product.name);
  const validation = validateProductMapping(mapping);
  if (validation.valid) {
    return { mapping, autoCreated: false };
  }

  const autoMapping = upsertProductMapping(createAutoProductMapping({
    id: product.id,
    name: product.name,
    vatRate: 10,
    category: product.category,
  }));

  return { mapping: autoMapping, autoCreated: true };
}

function getProductCategoryByName(name: string, products: ProductCard[]) {
  return products.find((product) => product.name === name)?.category ?? 'mutfak';
}

function getProductPriceByName(name: string, products: ProductCard[]) {
  return getCatalogPriceByName(name, products) ?? 0;
}

function normalizeStoredOrders(source: Record<string, OrderLine[]>, products: ProductCard[]) {
  return Object.fromEntries(
    Object.entries(source).map(([tableId, lines]) => [
      tableId,
      lines.map((line) => ({
        ...line,
        category: line.category ?? getProductCategoryByName(line.name, products),
        printCategory: line.printCategory ?? products.find((product) => product.name === line.name)?.printCategory ?? line.category,
        sentQty: typeof line.sentQty === 'number' ? Math.min(line.sentQty, line.qty) : 0,
        spicePreference: line.spicePreference ?? 'standart',
        cookingPreference: line.cookingPreference ?? 'standart',
        extrasNote: line.extrasNote ?? '',
        removalNote: line.removalNote ?? '',
        complimentary: Boolean(line.complimentary),
        complimentaryReason: line.complimentaryReason ?? '',
        isReturn: Boolean(line.isReturn),
        guestName: line.guestName ?? '',
        allowDiscount: line.allowDiscount ?? true,
        allowComplimentary: line.allowComplimentary ?? true,
        happyHourEligible: line.happyHourEligible ?? false,
      })),
    ]),
  );
}

function getOrderLineSubtotal(line: OrderLine) {
  const base = line.qty * line.price;
  if (line.complimentary) return 0;
  if (line.isReturn) return -base;
  return base;
}

function getOrderLineUnitAmount(line: OrderLine) {
  if (line.complimentary) return 0;
  if (line.isReturn) return -line.price;
  return line.price;
}

function getOrderLineGrossUnitAmount(line: OrderLine) {
  return roundCurrency(getOrderLineUnitAmount(line));
}

function resolveInitialStatus(status: string): TableStatus {
  if (status === 'reserved') return 'reserved';
  if (status === 'occupied') return 'occupied';
  return 'available';
}

function cleanTableName(name: string) {
  return name
    .replace(/^Merkez\s+/i, '')
    .replace(/^Kadikoy\s+/i, '')
    .replace(/^Izmir\s+/i, '')
    .trim();
}

function deriveTableGroup(name: string) {
  return cleanTableName(name).split(' ')[0] ?? 'Salon';
}

const FIXED_GROUP_ORDER = ['Salon', 'Teras', 'Bahce', 'VIP', 'Bar'] as const;

function normalizeGroupName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function getGroupOrder(group: string) {
  const normalized = normalizeGroupName(group);
  const index = FIXED_GROUP_ORDER.findIndex((item) => item === normalized);
  return index === -1 ? FIXED_GROUP_ORDER.length : index;
}

function getTableNumber(name: string) {
  const match = name.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortTablesByGroupAndNumber<T extends { group: string; name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const groupCompare = getGroupOrder(a.group) - getGroupOrder(b.group);
    if (groupCompare !== 0) return groupCompare;

    const numberCompare = getTableNumber(a.name) - getTableNumber(b.name);
    if (numberCompare !== 0) return numberCompare;

    return a.name.localeCompare(b.name, 'tr');
  });
}

function getOrderGross(lines: OrderLine[]) {
  const subtotal = lines.reduce((sum, item) => sum + getOrderLineSubtotal(item), 0);
  return Number(subtotal.toFixed(2));
}

function formatReceiptDate(date: Date) {
  return date.toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const ESC = '\x1B';
const GS  = '\x1D';
const INIT        = ESC + '@';
const ALIGN_CTR   = ESC + 'a\x01';
const ALIGN_LEFT  = ESC + 'a\x00';
const BOLD_ON     = ESC + 'E\x01';
const BOLD_OFF    = ESC + 'E\x00';
const PAPER_CUT   = GS  + 'V\x00';
const COL = 32;

function padLine(left: string, right: string): string {
  const gap = COL - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

function buildReceiptText(input: {
  restaurantName: string;
  tableNumber: string;
  date: Date;
  items: Array<{ name: string; qty: number }>;
}) {
  const sep = '-'.repeat(COL);
  const parts: string[] = [
    INIT,
    ALIGN_CTR + BOLD_ON + input.restaurantName + BOLD_OFF,
    ALIGN_LEFT,
    `Masa: ${input.tableNumber}`,
    `Tarih: ${formatReceiptDate(input.date)}`,
    sep,
    ...input.items.map((item) => `${item.qty} x ${item.name}`),
    sep,
    '',
    PAPER_CUT,
  ];
  return parts.join('\n');
}

function buildCheckReceiptText(input: {
  restaurantName: string;
  tableNumber: string;
  date: Date;
  lines: Array<{ name: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  vat: number;
  total: number;
}) {
  const sep = '-'.repeat(COL);
  const header: string[] = [
    INIT,
    ALIGN_CTR + BOLD_ON + input.restaurantName + BOLD_OFF,
    ALIGN_CTR + 'HESAP ADISYONU',
    ALIGN_LEFT,
    `Masa: ${input.tableNumber}`,
    `Tarih: ${formatReceiptDate(input.date)}`,
    sep,
  ];

  const body = input.lines.flatMap((line) => [
    padLine(`${line.qty}x ${line.name}`, `${formatMoney(line.lineTotal)}`),
  ]);

  const footer: string[] = [
    sep,
    padLine('Ara Toplam:', formatMoney(input.subtotal)),
    padLine('KDV (%10):', formatMoney(input.vat)),
    BOLD_ON + padLine('TOPLAM:', formatMoney(input.total)) + BOLD_OFF,
    sep,
    '',
    PAPER_CUT,
  ];

  return [...header, ...body, ...footer].join('\n');
}

function extractTableNumber(tableName: string) {
  const match = tableName.match(/(\d+)/);
  return match?.[1] ?? tableName;
}


export function OrderComposer({ initialTableId, autoOpenPayment = false }: OrderComposerProps) {
  const router = useRouter();
  const [sessionState, setSessionState] = useState(() => getDefaultSessionState());
  const [companyState, setCompanyState] = useState(() => getDefaultCompanyState());
  const [accessState, setAccessState] = useState(() => getDefaultAccessState());
  const [tableLayoutState, setTableLayoutState] = useState(() => getDefaultTableLayoutState());
  const [integrationState, setIntegrationState] = useState(() => getDefaultIntegrationState());
  const [storedCatalogProducts, setStoredCatalogProducts] = useState<ProductCard[]>([]);
  const [storedSaleProducts, setStoredSaleProducts] = useState<StoredSaleProduct[]>([]);
  const [eventPricingEnabled, setEventPricingEnabled] = useState(false);
  const sourceProducts = storedCatalogProducts;
  const sourceCategories = useMemo(() => deriveSaleProductCategories(sourceProducts), [sourceProducts]);
  const runtimeSession = useMemo(
    () => hydrateRuntimeSessionContext({
      session: sessionState,
      permissions: accessState.currentPermissions,
    }),
    [accessState.currentPermissions, sessionState],
  );
  const activeBranchId = runtimeSession.context.branch.branchId;
  const currentUser = runtimeSession.context.user;
  const hasPermission = runtimeSession.context.permissions.can;

  const ensureProductMutationCanStart = useCallback(async (input: {
    source: 'product-grid' | 'search' | 'product-card';
    tableId?: string | null;
    productId?: string;
    productName?: string;
  }) => {
    if (isRuntimeAuthRequired()) {
      const authLock = getRuntimeAuthFailureSnapshot();
      if (sessionState.isAuthenticated) {
        console.warn('[adisyon-flow] stale auth runtime lock cleared before product mutation', {
          ...input,
          authLock,
        });
        resetRuntimeAuthFailureLock();
        return true;
      }

      const sessionResponse = await runtimeFetch('/api/auth/me', { cache: 'no-store' }).catch((error) => {
        console.error('[adisyon-flow] auth recovery check failed before product mutation', {
          ...input,
          authLock,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (sessionResponse?.ok) {
        const payload = await sessionResponse.json().catch(() => null) as {
          ok?: boolean;
          session?: Parameters<typeof hydrateSessionStateFromAuth>[0];
        } | null;
        if (payload?.ok && payload.session) {
          const hydrated = hydrateSessionStateFromAuth(payload.session);
          setSessionState(hydrated);
          resetRuntimeAuthFailureLock();
          console.warn('[adisyon-flow] stale auth runtime lock recovered before product mutation', {
            ...input,
            authLock,
          });
          return true;
        }
      }

      console.error('[adisyon-flow] product mutation blocked by auth runtime lock', {
        ...input,
        authLock,
      });
      setFeedbackMessage('Oturum gerekli. Lutfen tekrar giris yapin.');
      return false;
    }
    return true;
  }, [sessionState.isAuthenticated]);

  const baseTables = useMemo(
    () => {
      const layoutTables = tableLayoutState.tables
        .filter((table) => (activeBranchId === 'all' ? true : table.branchId === activeBranchId))
        .map((table) => ({
          id: table.id,
          name: cleanTableName(table.name),
          group: table.group,
          total: table.total,
          status: resolveInitialStatus(table.status),
          paymentRequested: table.paymentRequested ?? false,
        }));

      if (initialTableId && !layoutTables.some((table) => table.id === initialTableId)) {
        layoutTables.push({
          id: initialTableId,
          name: cleanTableName(initialTableId).replace(/^[A-Z]+-/, 'Masa ') || initialTableId,
          group: deriveTableGroup(initialTableId),
          total: 0,
          status: 'available',
          paymentRequested: false,
        });
      }

      return layoutTables;
    },
    [activeBranchId, initialTableId, tableLayoutState.tables],
  );

  const initialOrders = useMemo<Record<string, OrderLine[]>>(() => {
    const seeded: Record<string, OrderLine[]> = {};
    baseTables.forEach((table) => {
      seeded[table.id] = [];
    });
    return seeded;
  }, [baseTables]);

  const defaultTableId = baseTables[0]?.id ?? '';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [selectedTableId, setSelectedTableId] = useState<string>(() =>
    initialTableId && baseTables.some((table) => table.id === initialTableId) ? initialTableId : defaultTableId,
  );
  const [ordersByTable, setOrdersByTable] = useState<Record<string, OrderLine[]>>(initialOrders);
  const [ordersHydrated, setOrdersHydrated] = useState(false);
  const [paymentRequestedTables, setPaymentRequestedTables] = useState<string[]>([]);
  const [tableMetaById, setTableMetaById] = useState<Record<string, StoredTableMeta>>({});
  const [tableReservations, setTableReservations] = useState(() => loadStoredTableReservations());
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [lastMutatedLineId, setLastMutatedLineId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('Hazır');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [posMappingWarning, setPosMappingWarning] = useState('');
  const [posClickDebug, setPosClickDebug] = useState<PosClickDebugSnapshot | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [authoritativePaymentState, setAuthoritativePaymentState] = useState<AuthoritativePaymentState | null>(null);
  const [paymentExpanded, setPaymentExpanded] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentScope, setPaymentScope] = useState<PaymentScope>('full');
  const [splitMode, setSplitMode] = useState<SplitMode>('person');
  const [splitAmountInput, setSplitAmountInput] = useState('');
  const [activePadTarget, setActivePadTarget] = useState<ActivePadTarget>('cash');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountChargeFilter, setAccountChargeFilter] = useState<AccountChargeFilter>('all');
  const [quickAccountName, setQuickAccountName] = useState('');
  const [mixedAccountEnabled, setMixedAccountEnabled] = useState(false);
  const [recentAccountIds, setRecentAccountIds] = useState<string[]>([]);
  const [cashReceived, setCashReceived] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [euroRateInput, setEuroRateInput] = useState('43');
  const [dollarRateInput, setDollarRateInput] = useState('40');
  const [splitSelection, setSplitSelection] = useState<Record<string, number>>({});
  const [discountRateInput, setDiscountRateInput] = useState('0');
  const [discountAmountInput, setDiscountAmountInput] = useState('0');
  const [roundingDiscountEnabled, setRoundingDiscountEnabled] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const [tableActionsOpen, setTableActionsOpen] = useState(false);
  const [tableActionSection, setTableActionSection] = useState<'guest' | 'note' | 'merge' | 'move'>('guest');
  const [guestCountInput, setGuestCountInput] = useState('0');
  const [reservationNameInput, setReservationNameInput] = useState('');
  const [reservationTimeInput, setReservationTimeInput] = useState('');
  const [tableNoteInput, setTableNoteInput] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [moveTargetId, setMoveTargetId] = useState('');
  const [mergeSelection, setMergeSelection] = useState<Record<string, boolean>>({});
  const [productCardProduct, setProductCardProduct] = useState<ProductCard | null>(null);
  const [productCardQuantity, setProductCardQuantity] = useState('1');
  const [productCardNote, setProductCardNote] = useState('');
  const [productCardGuestName, setProductCardGuestName] = useState('');
  const [productCardSpicePreference, setProductCardSpicePreference] = useState<'acili' | 'acisiz' | 'standart'>('standart');
  const [productCardCookingPreference, setProductCardCookingPreference] = useState<'standart' | 'az' | 'orta' | 'iyi'>('standart');
  const [productCardExtrasNote, setProductCardExtrasNote] = useState('');
  const [productCardRemovalNote, setProductCardRemovalNote] = useState('');
  const [productCardComplimentary, setProductCardComplimentary] = useState(false);
  const [productCardComplimentaryReason, setProductCardComplimentaryReason] = useState('');
  const [productCardIsReturn, setProductCardIsReturn] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const refresh = () => {
      setSessionState(loadSessionState());
      setAccessState(loadAccessState());
      setTableLayoutState(loadTableLayoutState());
      setCompanyState(loadCompanyState());
    };

    refresh();

    const unsubscribeSession = subscribeToSessionChanges(refresh);
    const unsubscribeCompany = subscribeToCompanyChanges(refresh);
    const unsubscribeAccess = subscribeToAccessChanges(refresh);
    const unsubscribeTables = subscribeToTableLayoutChanges(refresh);

    return () => {
      unsubscribeSession();
      unsubscribeCompany();
      unsubscribeAccess();
      unsubscribeTables();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const refreshRemoteTableLayout = () => {
      void refreshTableLayoutState()
        .then((state) => {
          if (cancelled) return;
          setTableLayoutState(state);
        })
        .catch((error) => {
          if (cancelled) return;
          logOrderFlow('table-layout-refresh-failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    };

    const handleFocus = () => refreshRemoteTableLayout();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshRemoteTableLayout();
    };

    refreshRemoteTableLayout();
    const interval = window.setInterval(refreshRemoteTableLayout, 4000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setIntegrationState(loadIntegrationState());

    refresh();
    const unsubscribe = subscribeToIntegrationChanges(refresh);
    return () => unsubscribe();
  }, []);

  const deferredProductSearch = useDeferredValue(productSearch);
  const deferredAccountSearch = useDeferredValue(accountSearch);

  const holdDelayRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const lastPaymentGuardRef = useRef<{ tableId: string; total: number; at: number } | null>(null);
  const paymentInFlightRef = useRef(false);
  const lineMutationInFlightRef = useRef<Set<string>>(new Set());
  const previousItemCountsRef = useRef<Record<string, number>>({});
  const orderMutationGuardRef = useRef<PendingMutation | null>(null);
  const recordPosClickDebug = (event: string, snapshot: Omit<PosClickDebugSnapshot, 'event' | 'at'>) => {
    const nextSnapshot = { event, at: new Date().toISOString(), ...snapshot };
    setPosClickDebug(nextSnapshot);
    logOrderFlow(event, nextSnapshot);
  };
  const paymentRequestedSet = useMemo(() => new Set(paymentRequestedTables), [paymentRequestedTables]);
  const chargeAccounts = useMemo(
    () => [...seedAccounts, ...storedAccounts].filter((account) => account.type === 'customer' || account.type === 'partner'),
    [seedAccounts, storedAccounts],
  );
  const filteredChargeAccounts = useMemo(() => {
    const needle = deferredAccountSearch.trim().toLocaleLowerCase('tr-TR');
    const recentSet = new Set(recentAccountIds);

    return chargeAccounts
      .filter((account) => {
        if (accountChargeFilter === 'customer' && account.type !== 'customer') return false;
        if (accountChargeFilter === 'partner' && account.type !== 'partner') return false;
        if (accountChargeFilter === 'recent' && !recentSet.has(account.id)) return false;
        if (!needle) return true;
        return `${account.name} ${account.code} ${account.phone}`.toLocaleLowerCase('tr-TR').includes(needle);
      })
      .sort((a, b) => {
        const aRecent = recentAccountIds.indexOf(a.id);
        const bRecent = recentAccountIds.indexOf(b.id);
        if (aRecent !== -1 || bRecent !== -1) {
          if (aRecent === -1) return 1;
          if (bRecent === -1) return -1;
          return aRecent - bRecent;
        }
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [accountChargeFilter, chargeAccounts, deferredAccountSearch, recentAccountIds]);

  useEffect(() => {
    if (!selectedAccountId && chargeAccounts.length > 0) {
      setSelectedAccountId(chargeAccounts[0].id);
    }
  }, [chargeAccounts, selectedAccountId]);

  useEffect(() => {
    setRecentAccountIds(restoreRecentAccountIds(RECENT_ACCOUNT_KEY));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setStoredAccounts(loadStoredAccounts());
    };

    refresh();
    const unsubscribe = subscribeToStoredAccountChanges(refresh);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const refreshStoredProducts = () => {
      const stored = loadStoredSaleProducts();
      if (stored?.length) {
        setStoredSaleProducts((current) => (JSON.stringify(current) === JSON.stringify(stored) ? current : stored));
        setStoredCatalogProducts(buildPosCatalogFromStored(stored, { eventMode: eventPricingEnabled }));
        return;
      }

      setStoredSaleProducts([]);
      setStoredCatalogProducts(includeSeedData ? getDefaultPosCatalog() : []);
    };

    refreshStoredProducts();
    return subscribeToStoredSaleProductsChanges(refreshStoredProducts);
  }, [eventPricingEnabled, includeSeedData]);

  useEffect(() => {
    if (!storedSaleProducts.length) {
      setStoredCatalogProducts(includeSeedData ? getDefaultPosCatalog() : []);
      return;
    }
    setStoredCatalogProducts(buildPosCatalogFromStored(storedSaleProducts, { eventMode: eventPricingEnabled }));
  }, [eventPricingEnabled, includeSeedData, storedSaleProducts]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ channel: 'pos' });
    if (activeBranchId) params.set('branchId', activeBranchId);

    runtimeFetch(`/api/runtime/pos-catalog?${params.toString()}` as `/api/${string}`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then((response) => readJsonResponse(response).then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (cancelled) return;
        const catalog = payload.catalog as { catalogRevision?: string; checksum?: string; items?: ProductCard[] } | undefined;
        if (!response.ok || !Array.isArray(catalog?.items)) {
          logOrderFlow('runtime-catalog-hydration-skipped', {
            status: response.status,
            itemCount: catalog?.items?.length ?? 0,
            error: payload.error,
            message: payload.message,
          });
          return;
        }
        if (catalog.items.length === 0) {
          const localCreatedProducts = (loadStoredSaleProducts() ?? []).filter((product) => product.source === 'created');
          setStoredSaleProducts(localCreatedProducts);
          setStoredCatalogProducts(buildPosCatalogFromStored(localCreatedProducts, { eventMode: eventPricingEnabled }));
        } else {
          setStoredCatalogProducts(catalog.items);
        }
        logOrderFlow('runtime-catalog-hydrated', {
          branchId: activeBranchId,
          catalogRevision: catalog.catalogRevision,
          checksum: catalog.checksum,
          itemCount: catalog.items.length,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        logOrderFlow('runtime-catalog-hydration-failed', {
          branchId: activeBranchId,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, eventPricingEnabled]);

  useEffect(() => {
    setOrdersByTable((current) =>
      Object.fromEntries(
        Object.entries(current).map(([tableId, lines]) => [
          tableId,
          lines.map((line) => ({
            ...line,
            price: getProductPriceByName(line.name, sourceProducts) || line.price,
            category: line.category ?? getProductCategoryByName(line.name, sourceProducts),
            printCategory: line.printCategory ?? sourceProducts.find((product) => product.name === line.name)?.printCategory ?? line.category,
          })),
        ]),
      ),
    );
  }, [sourceProducts]);

  useEffect(() => {
    if (!lastAddedId) return;
    const timer = window.setTimeout(() => setLastAddedId(null), 220);
    return () => window.clearTimeout(timer);
  }, [lastAddedId]);

  useEffect(() => {
    if (!lastMutatedLineId) return;
    const timer = window.setTimeout(() => setLastMutatedLineId(null), 140);
    return () => window.clearTimeout(timer);
  }, [lastMutatedLineId]);

  useEffect(() => {
    if (!feedbackMessage || feedbackMessage === 'Hazır') return;
    const timer = window.setTimeout(() => setFeedbackMessage('Hazır'), 1200);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return sourceProducts;
    const selectedKey = normalizeCategoryKey(selectedCategory);
    return sourceProducts.filter((product) => normalizeCategoryKey(product.category) === selectedKey);
  }, [selectedCategory, sourceProducts]);
  useEffect(() => {
    if (selectedCategory === 'all') return;
    if (!sourceCategories.some((category) => category.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, sourceCategories]);

  const searchSuggestions = useMemo(() => {
    const query = deferredProductSearch.trim().toLocaleLowerCase('tr-TR');
    if (query.length < 3) return [];

    return sourceProducts
      .filter((product) => product.name.toLocaleLowerCase('tr-TR').includes(query))
      .slice(0, 8);
  }, [deferredProductSearch, sourceProducts]);

  const orderSummariesByTable = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(ordersByTable).map(([tableId, tableLines]) => [
          tableId,
          {
            quantity: tableLines.reduce((sum, item) => sum + item.qty, 0),
            total: getOrderGross(tableLines),
          },
        ]),
      ),
    [ordersByTable],
  );

  const activeReservationsByTable = useMemo(() => {
    const today = todayDateInput();
    const sorted = [...tableReservations]
      .filter((reservation) => reservation.date === today)
      .sort((a, b) => {
        const timeCompare = (a.time ?? '').localeCompare(b.time ?? '', 'tr');
        if (timeCompare !== 0) return timeCompare;
        return (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt, 'tr');
      });

    return new Map(sorted.map((reservation) => [reservation.tableId, reservation]));
  }, [tableReservations]);

  const allTables = useMemo<PosTable[]>(
    () =>
      baseTables.map((table) => {
        const summary = orderSummariesByTable[table.id] ?? { quantity: 0, total: 0 };
        const meta = tableMetaById[table.id] ?? {};
        const activeReservation = activeReservationsByTable.get(table.id);
        const paymentRequested = paymentRequestedSet.has(table.id) || table.paymentRequested;
        const reservationName = activeReservation?.guestName ?? meta.reservationName;
        const reservationTime = activeReservation?.time ?? meta.reservationTime;
        const reservationDate = activeReservation?.date ?? meta.reservationDate;
        const reservationEvent = activeReservation?.event ?? meta.reservationEvent;
        const reservationDeposit = activeReservation?.deposit ?? meta.reservationDeposit;
        const hasReservation = Boolean(reservationName);

        let status: TableStatus = table.status as TableStatus;
        if (hasReservation || table.status === 'reserved') {
          status = 'reserved';
        } else {
          status = summary.quantity > 0 ? 'occupied' : 'available';
        }

        return {
          ...table,
          total: summary.total,
          status,
          paymentRequested,
          guests: activeReservation?.guestCount ?? meta.guests ?? (summary.quantity > 0 ? 1 : 0),
          reservationName,
          reservationTime,
          reservationDate,
          reservationEvent,
          reservationDeposit,
          note: meta.note,
          mergedFromIds: meta.mergedFromIds,
          mergedSnapshot: meta.mergedSnapshot,
        };
      }),
    [activeReservationsByTable, baseTables, orderSummariesByTable, paymentRequestedSet, tableMetaById],
  );

  const currentTable = useMemo<PosTable | null>(
    () => allTables.find((item) => item.id === selectedTableId) ?? null,
    [allTables, selectedTableId],
  );

  const lines = currentTable ? ordersByTable[currentTable.id] ?? EMPTY_ORDER_LINES : EMPTY_ORDER_LINES;
  const reconcileAuthoritativeOrders = useCallback((
    current: Record<string, OrderLine[]>,
    incoming: Record<string, OrderLine[]>,
    source: PosOrderReconciliationSource,
  ) => {
    const activeTableId = currentTable?.id ?? selectedTableId;
    const result = reconcileRuntimeSyncSnapshot({
      current,
      incoming,
      activeTableId,
      source,
      pendingMutation: orderMutationGuardRef.current,
      diagnostics: logOrderFlow,
    });
    logOrderFlow('order-reconciliation-reducer', result.log);
    return result.ordersByTable;
  }, [currentTable?.id, selectedTableId]);
  const splitSelectionLineKey = lines.map((line) => `${line.id}:${line.qty}`).join('|');
  const itemCount = useMemo(() => lines.reduce((sum, item) => sum + item.qty, 0), [lines]);
  const guestLabels = useMemo(
    () => Array.from(new Set(lines.map((line) => line.guestName?.trim()).filter((value): value is string => Boolean(value)))),
    [lines],
  );
  const unsentLines = useMemo(
    () =>
      lines
        .map((line) => ({
          ...line,
          unsentQty: Math.max(line.qty - line.sentQty, 0),
        }))
        .filter((line) => line.unsentQty > 0),
    [lines],
  );
  const unsentItemCount = useMemo(() => unsentLines.reduce((sum, item) => sum + item.unsentQty, 0), [unsentLines]);
  const tenantPrinters = useMemo(
    () => registerRuntimeDevices({
      integrationState,
      tenant: runtimeSession.context.tenant,
      branch: runtimeSession.context.branch,
    }),
    [integrationState, runtimeSession.context.branch, runtimeSession.context.tenant],
  );
  useEffect(() => {
    traceRuntimeSessionHydrated(runtimeSession);
    traceDeviceOwnershipRestored(tenantPrinters);
    logOrderFlow('runtime-render-contract-initialized', {
      tenantId: runtimeSession.context.tenant.tenantId,
      branchId: runtimeSession.context.branch.branchId,
      isAuthenticated: runtimeSession.context.tenant.isAuthenticated,
      permissionCount: runtimeSession.context.permissions.permissions.length,
      deviceCount: tenantPrinters.activeDevices.length,
      defaultPrinter: tenantPrinters.defaultPrinter,
    });
  }, [runtimeSession, tenantPrinters]);
  const subtotal = useMemo(() => lines.reduce((sum, item) => sum + getOrderLineSubtotal(item), 0), [lines]);
  const vat = subtotal - (subtotal / (1 + VAT_RATE));
  
  const total = subtotal;

  const selectedSplitItemCount = useMemo(() => lines.reduce((sum, item) => sum + (splitSelection[item.id] ?? 0), 0), [lines, splitSelection]);
  const settlementSubtotal = subtotal;
  const settlementVat = vat;
  const settlementTotal = total;
  const discountEligibleTotal = useMemo(
    () => lines.reduce((sum, item) => (item.allowDiscount === false ? sum : sum + getOrderLineSubtotal(item)), 0),
    [lines],
  );
  const maxDiscountRate = currentUser.discountLimitRate ?? 0;
  const canApplyDiscount = hasPermission('discount.apply');
  const canUseRoundingDiscount = currentUser.canUseRoundingDiscount ?? false;
  const requestedDiscountRate = Math.min(Math.max(parseAmountInput(discountRateInput), 0), 100);
  const discountRate = Math.min(requestedDiscountRate, maxDiscountRate);
  const percentageDiscountAmount = roundCurrency(Math.max(discountEligibleTotal, 0) * (discountRate / 100));
  const totalAfterPercentageDiscount = Math.max(roundCurrency(settlementTotal - percentageDiscountAmount), 0);
  const requestedFixedDiscountAmount = canApplyDiscount ? Math.max(parseAmountInput(discountAmountInput), 0) : 0;
  const fixedDiscountAmount = Math.min(requestedFixedDiscountAmount, totalAfterPercentageDiscount);
  const totalAfterFixedDiscount = Math.max(roundCurrency(totalAfterPercentageDiscount - fixedDiscountAmount), 0);
  const roundingApplied = roundingDiscountEnabled && canUseRoundingDiscount;
  const roundedSettlementTotal = roundingApplied ? Math.floor(totalAfterFixedDiscount) : totalAfterFixedDiscount;
  const roundingDiscountAmount = roundCurrency(Math.max(totalAfterFixedDiscount - roundedSettlementTotal, 0));
  const activeReservationDeposit = useMemo(() => {
    if (!currentTable?.reservationDeposit) return 0;
    if (currentTable.reservationDate && currentTable.reservationDate !== todayDateInput()) return 0;
    return Math.max(currentTable.reservationDeposit, 0);
  }, [currentTable?.reservationDate, currentTable?.reservationDeposit]);
  const discountedSettlementTotal = roundCurrency(Math.max(roundedSettlementTotal - activeReservationDeposit, 0));
  const remainingSettlementTotal = authoritativePaymentState?.orderStatus === 'open'
    ? roundCurrency(Math.min(authoritativePaymentState.remainingTotal, discountedSettlementTotal))
    : discountedSettlementTotal;

  useEffect(() => {
    logOrderFlow('ProductCard rendered', {
      source: 'product-grid',
      productCount: filteredProducts.length,
      tableId: currentTable?.id ?? null,
      canCreateOrder: Boolean(currentTable && hasPermission('orders.create')),
      catalogRevisions: Array.from(new Set(filteredProducts.map((product) => product.catalogRevision ?? 'missing'))).slice(0, 8),
      missingSnapshotCount: filteredProducts.filter((product) => getProductSnapshotStatus(product) !== 'ready').length,
    });
  }, [currentTable?.id, filteredProducts, hasPermission]);
  const totalDiscountAmount = roundCurrency(percentageDiscountAmount + fixedDiscountAmount + roundingDiscountAmount);
  const discountReasonRequired = totalDiscountAmount > 0;
  const splitSelectedSubtotal = useMemo(
    () =>
      lines.reduce((sum, item) => {
        const selectedQty = Math.min(splitSelection[item.id] ?? 0, item.qty);
        const signedLinePrice = item.complimentary ? 0 : item.isReturn ? -item.price : item.price;
        return sum + (selectedQty * signedLinePrice);
      }, 0),
    [lines, splitSelection],
  );
  const splitSelectedTotal = roundCurrency(splitSelectedSubtotal);
  const splitAmountValue = roundCurrency(parseAmountInput(splitAmountInput));
  const splitTargetTotal = paymentScope === 'split'
    ? splitMode === 'person'
      ? splitSelectedTotal
      : Math.min(splitAmountValue, remainingSettlementTotal)
    : remainingSettlementTotal;
  const paymentTargetTotal = roundCurrency(Math.max(splitTargetTotal, 0));

  useEffect(() => {
    if (!paymentOpen) return;
    setPaymentMethod('cash');
    setPaymentScope('full');
    setSplitMode('person');
    setSplitAmountInput('');
    setActivePadTarget('cash');
    setPaymentExpanded(true);
    setCashReceived(remainingSettlementTotal.toFixed(2));
    setCardAmount('0');
    setSelectedAccountId(chargeAccounts[0]?.id ?? '');
    setSplitSelection(Object.fromEntries(lines.map((line) => [line.id, 0])));
    setDiscountRateInput('0');
    setDiscountAmountInput('0');
    setRoundingDiscountEnabled(false);
    setDiscountReason('');
  }, [paymentOpen, remainingSettlementTotal, currentTable?.id, splitSelectionLineKey]);

  useEffect(() => {
    if (!currentTable) return;

    const previousCount = previousItemCountsRef.current[currentTable.id] ?? itemCount;
    previousItemCountsRef.current[currentTable.id] = itemCount;

    if (previousCount === itemCount) return;

    const now = new Date().toISOString();
    const currentMeta = getStoredTableMeta();
    const tableMeta = currentMeta[currentTable.id] ?? {};

    if (itemCount > 0) {
      setStoredTableMeta({
        ...currentMeta,
        [currentTable.id]: {
          ...tableMeta,
          guests: tableMeta.guests ?? Math.max(currentTable.guests ?? 1, 1),
          openedAt: tableMeta.openedAt ?? now,
          lastActionAt: now,
        },
      });
      return;
    }

    setStoredTableMeta({
      ...currentMeta,
      [currentTable.id]: {
        ...tableMeta,
        guests: 0,
        openedAt: undefined,
        lastActionAt: now,
      },
    });
  }, [currentTable, itemCount]);

  useEffect(() => {
    if (lines.length === 0) {
      setPaymentOpen(false);
      setPaymentScope('full');
      setPaymentExpanded(true);
      setSplitSelection({});
      setDiscountRateInput('0');
      setDiscountAmountInput('0');
      setRoundingDiscountEnabled(false);
      setDiscountReason('');
    }
  }, [lines.length]);

  useEffect(() => {
    if (!autoOpenPayment || paymentOpen || !currentTable || lines.length === 0) return;
    setPaymentOpen(true);
    setPaymentExpanded(true);
  }, [autoOpenPayment, currentTable, lines.length, paymentOpen]);

  useEffect(() => {
    setSplitSelection((current) => {
      if (lines.length === 0) {
        return Object.keys(current).length === 0 ? current : {};
      }

      const next = Object.fromEntries(
        lines.map((line) => {
          const value = current[line.id] ?? 0;
          return [line.id, Math.min(Math.max(value, 0), line.qty)];
        }),
      ) as Record<string, number>;

      const same =
        Object.keys(next).length === Object.keys(current).length &&
        Object.entries(next).every(([key, value]) => current[key] === value);

      return same ? current : next;
    });
  }, [splitSelectionLineKey]);

  useEffect(() => {
    return () => {
      if (holdDelayRef.current) window.clearTimeout(holdDelayRef.current);
      if (holdIntervalRef.current) window.clearInterval(holdIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const syncPaymentRequested = () => {
      const nextPaymentRequestedTables = getPaymentRequestedTableIds();
      const nextTableMeta = getStoredTableMeta();

      setPaymentRequestedTables((current) =>
        areStringArraysEqual(current, nextPaymentRequestedTables) ? current : nextPaymentRequestedTables,
      );
      setTableMetaById((current) =>
        JSON.stringify(current) === JSON.stringify(nextTableMeta) ? current : nextTableMeta,
      );
    };

    syncPaymentRequested();
    const unsubscribe = subscribeToPaymentRequestedChanges(syncPaymentRequested);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const refreshReservations = () => {
      setTableReservations(loadStoredTableReservations());
    };

    refreshReservations();
    return subscribeToStoredTableReservations(refreshReservations);
  }, []);

  useEffect(() => {
    if (isRuntimeAuthRequired()) {
      setOrdersHydrated(true);
      logOrderFlow('authoritative-orders-hydration-stopped', {
        reason: 'AUTH_REQUIRED',
      });
      return;
    }
    void hydrateAuthoritativeRuntime<OrderLine>({
      initialOrders,
      normalizeOrders: (orders) => normalizeStoredOrders(orders, sourceProducts),
      getPendingMutation: () => orderMutationGuardRef.current,
      diagnostics: logOrderFlow,
    })
      .then((result) => {
        if (result.snapshot) {
          setOrdersByTable((current) => reconcileAuthoritativeOrders(current, result.snapshot?.ordersByTable ?? EMPTY_ORDERS_BY_TABLE, 'initial-hydration'));
        }
        setOrdersHydrated(true);
      })
      .catch((error) => {
        if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
          logOrderFlow('authoritative-orders-hydration-stopped', {
            reason: 'AUTH_REQUIRED',
          });
          setOrdersHydrated(true);
          return;
        }
        logOrderFlow('authoritative-orders-hydration-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        setOrdersHydrated(true);
      });
  }, [initialOrders, reconcileAuthoritativeOrders, sourceProducts]);

  useEffect(() => {
    if (!ordersHydrated) return;
    const activeTableId = currentTable?.id ?? selectedTableId;
    const activePayload = activeTableId ? ordersByTable[activeTableId] ?? EMPTY_ORDER_LINES : EMPTY_ORDER_LINES;
    logOrderFlow('orders-persisted', {
      selectedTableId,
      activeOrderId: activeTableId || null,
      currentLineCount: activePayload.length,
      tableCount: Object.keys(ordersByTable).length,
    });
  }, [currentTable?.id, ordersByTable, ordersHydrated, selectedTableId]);

  useEffect(() => {
    if (!ordersHydrated || typeof window === 'undefined') return;
    if (isRuntimeAuthRequired()) return;
    let cancelled = false;

    const syncAuthoritativeOrders = (source: PosOrderReconciliationSource) => {
      if (cancelled || isRuntimeAuthRequired()) return;
      void refreshAuthoritativeOrdersByTable<OrderLine>()
        .then((serverOrders) => {
          if (cancelled) return;
          const normalized = normalizeStoredOrders(serverOrders, sourceProducts);
          setOrdersByTable((current) => reconcileAuthoritativeOrders(current, normalized, source));
        })
        .catch((error) => {
          if (cancelled) return;
          logOrderFlow('authoritative-orders-background-sync-failed', {
            source,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    };

    const handleFocus = () => syncAuthoritativeOrders('focus');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncAuthoritativeOrders('focus');
    };

    syncAuthoritativeOrders('manual-refresh');
    const interval = window.setInterval(() => syncAuthoritativeOrders('interval'), 4000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [ordersHydrated, reconcileAuthoritativeOrders, sourceProducts]);

  useEffect(() => {
    logOrderFlow('authoritative-orders-background-sync-disabled', {
      reason: 'product-recovery-uses-bounded-table-order-refresh',
      activeEndpoint: '/api/pos/table-orders',
    });
    logOrderFlow('offline-auto-sync-disabled', {
      reason: 'product-recovery-minimal-runtime',
    });
  }, []);

  useEffect(() => {
    const nextTotals = Object.fromEntries(
      baseTables.map((table) => {
        const lineItems = ordersByTable[table.id] ?? [];
        const subtotalValue = lineItems.reduce((sum, item) => sum + getOrderLineSubtotal(item), 0);
        const grossTotal = Number(subtotalValue.toFixed(2));
        return [table.id, grossTotal];
      }),
    );

    persistTableLiveTotals(nextTotals);
  }, [baseTables, ordersByTable]);

  useEffect(() => {
    if (!currentTable) return;
    setGuestCountInput(String(currentTable.guests ?? 0));
    setReservationNameInput(currentTable.reservationName ?? '');
    setReservationTimeInput(currentTable.reservationTime ?? '');
    setTableNoteInput(currentTable.note ?? '');
    setMergeTargetId('');
    setMoveTargetId('');
    setMergeSelection(
      Object.fromEntries(((ordersByTable[currentTable.id] ?? []) as OrderLine[]).map((line) => [line.id, true])),
    );
  }, [currentTable?.id, currentTable?.guests, currentTable?.reservationName, currentTable?.reservationTime, currentTable?.note, ordersByTable]);

  useEffect(() => {
    if (selectedTableId && baseTables.some((table) => table.id === selectedTableId)) return;

    const nextTableId =
      initialTableId && baseTables.some((table) => table.id === initialTableId)
        ? initialTableId
        : defaultTableId;

    if (nextTableId !== selectedTableId) {
      setSelectedTableId(nextTableId);
    }
  }, [baseTables, defaultTableId, initialTableId, selectedTableId]);

  const mergeTargets = useMemo(
    () =>
      sortTablesByGroupAndNumber(
        allTables.filter((table) => table.id !== currentTable?.id && table.status !== 'reserved'),
      ),
    [allTables, currentTable?.id],
  );

  const moveTargets = useMemo(
    () =>
      sortTablesByGroupAndNumber(
        allTables.filter((table) => table.id !== currentTable?.id && table.total === 0 && table.status !== 'reserved'),
      ),
    [allTables, currentTable?.id],
  );

  const saveTableMeta = (nextMeta: Record<string, StoredTableMeta>) => {
    setTableMetaById(nextMeta);
    setStoredTableMeta(nextMeta);
  };

  const stopRepeater = () => {
    if (holdDelayRef.current) {
      window.clearTimeout(holdDelayRef.current);
      holdDelayRef.current = null;
    }
    if (holdIntervalRef.current) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  const updatePaymentRequested = (tableId: string, requested: boolean) => {
    persistTablePaymentRequested(tableId, requested);
    setPaymentRequestedTables((current) => {
      const next = new Set(current);
      if (requested) {
        next.add(tableId);
      } else {
        next.delete(tableId);
      }
      return [...next];
    });
  };

  const rememberUndo = (snapshot: Record<string, OrderLine[]>, label: string) => {
    setUndoStack((current) => [{ snapshot: cloneOrders(snapshot), label }, ...current].slice(0, 20));
  };

  const saveGuestCount = () => {
    if (!currentTable) return;
    const nextGuests = Math.max(Number(guestCountInput) || 0, 0);
    saveTableMeta({
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: nextGuests,
      },
    });
    setFeedbackMessage(`Misafir sayisi ${nextGuests} olarak guncellendi`);
  };

  const reserveTable = () => {
    if (!currentTable) return;
    const reservationName = reservationNameInput.trim();
    if (!reservationName) {
      setFeedbackMessage('Once misafir adi girin');
      return;
    }

    saveTableMeta({
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: Math.max(Number(guestCountInput) || 0, 1),
        reservationName,
        reservationTime: reservationTimeInput.trim() || undefined,
        note: tableNoteInput.trim() || undefined,
      },
    });
    setFeedbackMessage(`${reservationName} icin rezervasyon kaydedildi`);
  };

  const clearTableMeta = () => {
    if (!currentTable) return;
    saveTableMeta({
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: lines.length > 0 ? Math.max(Number(guestCountInput) || 1, 1) : 0,
        reservationName: undefined,
        reservationTime: undefined,
        note: undefined,
        mergedFromIds: undefined,
        mergedSnapshot: undefined,
      },
    });
    setFeedbackMessage('Masa bilgileri temizlendi');
  };

  const saveTableNote = () => {
    if (!currentTable) return;
    saveTableMeta({
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: Math.max(Number(guestCountInput) || 0, 0),
        note: tableNoteInput.trim() || undefined,
      },
    });
    setFeedbackMessage('Masa notu kaydedildi');
  };

  const mergeCurrentTable = () => {
    const mergeStartedAt = businessNowMs();
    if (!currentTable || !mergeTargetId) {
      console.error('[business-flow] table merge blocked', { currentTableId: currentTable?.id, mergeTargetId, tenantId: sessionState.tenantId, timestamp: new Date().toISOString() });
      setFeedbackMessage('Birlestirme icin kaynak ve hedef masa secin.');
      return;
    }
    const targetTable = allTables.find((table) => table.id === mergeTargetId);
    if (!targetTable) {
      console.error('[business-flow] table merge target missing', { mergeTargetId, tenantId: sessionState.tenantId, timestamp: new Date().toISOString() });
      setFeedbackMessage('Hedef masa bulunamadi.');
      return;
    }

    const sourceOrders = ordersByTable[currentTable.id] ?? [];
    const selectedOrders = sourceOrders.filter((line) => mergeSelection[line.id] ?? true);
    const remainingOrders = sourceOrders.filter((line) => !(mergeSelection[line.id] ?? true));
    if (selectedOrders.length === 0) {
      setFeedbackMessage('Birleştirilecek ürün seçin');
      return;
    }
    const targetOrders = ordersByTable[mergeTargetId] ?? [];
    const mergedOrders = [
      ...targetOrders,
      ...selectedOrders.map((line, index) => ({ ...line, id: `${mergeTargetId}-merged-${line.id}-${index}` })),
    ];
    const nextOrders = {
      ...ordersByTable,
      [currentTable.id]: remainingOrders,
      [mergeTargetId]: mergedOrders,
    };

    const nextMeta: Record<string, StoredTableMeta> = {
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: remainingOrders.length > 0 ? currentTable.guests : 0,
        reservationName: remainingOrders.length > 0 ? currentTable.reservationName : undefined,
        reservationTime: remainingOrders.length > 0 ? currentTable.reservationTime : undefined,
        note: remainingOrders.length > 0 ? currentTable.note : undefined,
        mergedFromIds: remainingOrders.length > 0 ? currentTable.mergedFromIds : undefined,
        mergedSnapshot: remainingOrders.length > 0 ? currentTable.mergedSnapshot : undefined,
      },
      [mergeTargetId]: {
        ...tableMetaById[mergeTargetId],
        guests: (targetTable.guests ?? 0) + (remainingOrders.length === 0 ? currentTable.guests ?? 0 : 0),
        note: tableMetaById[mergeTargetId]?.note ?? currentTable.note,
        mergedFromIds: remainingOrders.length === 0 ? [...(tableMetaById[mergeTargetId]?.mergedFromIds ?? []), currentTable.id] : tableMetaById[mergeTargetId]?.mergedFromIds,
        mergedSnapshot: remainingOrders.length === 0 ? {
          sourceOrders: {
            ...(tableMetaById[mergeTargetId]?.mergedSnapshot?.sourceOrders ?? {}),
            [currentTable.id]: sourceOrders,
          },
          sourceMeta: {
            ...(tableMetaById[mergeTargetId]?.mergedSnapshot?.sourceMeta ?? {}),
            [currentTable.id]: {
              guests: currentTable.guests,
              reservationName: currentTable.reservationName,
              reservationTime: currentTable.reservationTime,
              note: currentTable.note,
            },
          },
        } : tableMetaById[mergeTargetId]?.mergedSnapshot,
      },
    };

    rememberUndo(ordersByTable, 'Masa birleştirildi');
    console.log('[business-flow] table merge commit', {
      sourceTableId: currentTable.id,
      targetTableId: mergeTargetId,
      tenantId: sessionState.tenantId,
      runtimeScope: 'tenant',
      movedLineCount: selectedOrders.length,
      remainingLineCount: remainingOrders.length,
      durationMs: businessDurationMs(mergeStartedAt),
      timestamp: new Date().toISOString(),
    });
    replaceAuthoritativeOrdersByTable(nextOrders);
    setOrdersByTable(nextOrders);
    saveTableMeta(nextMeta);
    updatePaymentRequested(currentTable.id, false);
    updatePaymentRequested(mergeTargetId, false);
    setSelectedTableId(mergeTargetId);
    router.replace(`/orders?tableId=${mergeTargetId}`);
    setFeedbackMessage(remainingOrders.length === 0 ? `${currentTable.name} ${targetTable.name} ile birleştirildi` : `Seçilen ürünler ${targetTable.name} masasına aktarıldı`);
  };

  const moveCurrentTable = () => {
    const moveStartedAt = businessNowMs();
    if (!currentTable || !moveTargetId) {
      console.error('[business-flow] table move blocked', { currentTableId: currentTable?.id, moveTargetId, tenantId: sessionState.tenantId, timestamp: new Date().toISOString() });
      setFeedbackMessage('Tasima icin kaynak ve hedef masa secin.');
      return;
    }
    const targetTable = allTables.find((table) => table.id === moveTargetId);
    if (!targetTable) {
      console.error('[business-flow] table move target missing', { moveTargetId, tenantId: sessionState.tenantId, timestamp: new Date().toISOString() });
      setFeedbackMessage('Hedef masa bulunamadi.');
      return;
    }

    const sourceOrders = ordersByTable[currentTable.id] ?? [];
    const nextOrders = {
      ...ordersByTable,
      [currentTable.id]: [],
      [moveTargetId]: sourceOrders,
    };

    const nextMeta: Record<string, StoredTableMeta> = {
      ...tableMetaById,
      [currentTable.id]: {
        ...tableMetaById[currentTable.id],
        guests: 0,
        reservationName: undefined,
        reservationTime: undefined,
        note: undefined,
        mergedFromIds: undefined,
        mergedSnapshot: undefined,
      },
      [moveTargetId]: {
        ...tableMetaById[moveTargetId],
        guests: currentTable.guests,
        note: currentTable.note,
      },
    };

    rememberUndo(ordersByTable, 'Masa taşındı');
    console.log('[business-flow] table move commit', {
      sourceTableId: currentTable.id,
      targetTableId: moveTargetId,
      tenantId: sessionState.tenantId,
      runtimeScope: 'tenant',
      movedLineCount: sourceOrders.length,
      durationMs: businessDurationMs(moveStartedAt),
      timestamp: new Date().toISOString(),
    });
    replaceAuthoritativeOrdersByTable(nextOrders);
    setOrdersByTable(nextOrders);
    saveTableMeta(nextMeta);
    updatePaymentRequested(currentTable.id, false);
    updatePaymentRequested(moveTargetId, false);
    setSelectedTableId(moveTargetId);
    router.replace(`/orders?tableId=${moveTargetId}`);
    setFeedbackMessage(`${currentTable.name} ${targetTable.name} masasına taşındı`);
  };

  const splitMergedTable = () => {
    if (!currentTable?.mergedFromIds?.length || !currentTable.mergedSnapshot) {
      console.error('[business-flow] split merged table blocked', {
        currentTableId: currentTable?.id,
        mergedFromIds: currentTable?.mergedFromIds,
        hasMergedSnapshot: Boolean(currentTable?.mergedSnapshot),
      });
      setFeedbackMessage('Ayrilacak masa birlesimi bulunamadi.');
      return;
    }

    const sourceIds = currentTable.mergedFromIds;
    const nextOrders = { ...ordersByTable, [currentTable.id]: [] };

    sourceIds.forEach((sourceId) => {
      nextOrders[sourceId] = (currentTable.mergedSnapshot?.sourceOrders[sourceId] ?? []) as OrderLine[];
    });

    const nextMeta = { ...tableMetaById };
    sourceIds.forEach((sourceId) => {
      nextMeta[sourceId] = currentTable.mergedSnapshot?.sourceMeta[sourceId] ?? {};
    });
    nextMeta[currentTable.id] = {
      ...tableMetaById[currentTable.id],
      guests: 0,
      mergedFromIds: undefined,
      mergedSnapshot: undefined,
    };

    rememberUndo(ordersByTable, 'Masa birleşimi ayrıldı');
    replaceAuthoritativeOrdersByTable(nextOrders);
    setOrdersByTable(nextOrders);
    saveTableMeta(nextMeta);
    setFeedbackMessage('Birleşim geri alındı');
  };

  const openProductCard = (product: ProductCard) => {
    if (!currentTable || !hasPermission('orders.create')) {
      console.error('[business-flow] product card open blocked', {
        tableId: currentTable?.id,
        productId: product.id,
        productName: product.name,
        hasCreatePermission: hasPermission('orders.create'),
      });
      setFeedbackMessage(!currentTable ? 'Urun detayini acmak icin once masa secin.' : 'Bu kullanici urun ekleme yetkisine sahip degil.');
      return;
    }
    const mappingResult = ensureOrderProductMapping(product);
    setPosMappingWarning(mappingResult.autoCreated ? `${product.name} için otomatik POS PLU eşleştirmesi oluşturuldu.` : '');
    setProductCardProduct(product);
    setProductCardQuantity('1');
    setProductCardNote('');
    setProductCardGuestName('');
    setProductCardSpicePreference('standart');
    setProductCardCookingPreference('standart');
    setProductCardExtrasNote('');
    setProductCardRemovalNote('');
    setProductCardComplimentary(false);
    setProductCardComplimentaryReason('');
    setProductCardIsReturn(false);
  };

  const addProductToOrder = async (product: ProductCard, source: 'product-grid' | 'search' = 'product-grid') => {
    const productName = normalizeProductName(product.name);
    console.log('[adisyon-flow] product click received', {
      source,
      tableId: currentTable?.id ?? null,
      selectedTableId,
      productId: product.id,
      productName,
      canCreateOrder: Boolean(currentTable && hasPermission('orders.create')),
      isAuthenticated: sessionState.isAuthenticated,
      authLock: getRuntimeAuthFailureSnapshot(),
    });
    if (!await ensureProductMutationCanStart({
      source,
      tableId: currentTable?.id ?? selectedTableId,
      productId: product.id,
      productName,
    })) {
      setFeedbackMessage('Oturum gerekli. Lütfen tekrar giriş yapın.');
      return;
    }
    recordPosClickDebug('ProductCard clicked', {
      source,
      tableId: currentTable?.id ?? null,
      productId: product.id,
      productName,
      posKey: product.posKey ?? product.id,
      catalogRevision: product.catalogRevision,
      productSnapshotStatus: getProductSnapshotStatus(product),
      payload: {
        runtimeIdentity: {
          productId: product.productId,
          posKey: product.posKey ?? product.id,
          catalogRevision: product.catalogRevision,
          snapshotPosKey: product.productSnapshot?.posKey,
          snapshotRevision: product.productSnapshot?.revision,
          productType: product.productType,
        },
      },
    });
    if (!currentTable) {
      console.error('[adisyon-flow] product mutation blocked: missing table', {
        source,
        selectedTableId,
        productId: product.id,
        productName: product.name,
      });
      recordPosClickDebug('add-product-blocked', {
        source,
        reason: 'missing-table',
        productId: product.id,
        productName: product.name,
        posKey: product.posKey ?? product.id,
        catalogRevision: product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(product),
        selectedTableId,
      });
      setFeedbackMessage('Ürün eklemek için önce masa seçin');
      return;
    }
    if (!hasPermission('orders.create')) {
      console.error('[adisyon-flow] product mutation blocked: permission denied', {
        source,
        tableId: currentTable.id,
        productId: product.id,
        productName: product.name,
        permissions: runtimeSession.context.permissions.permissions,
        role: runtimeSession.context.permissions.role,
      });
      recordPosClickDebug('add-product-blocked', {
        source,
        reason: 'permission-denied',
        productId: product.id,
        productName: product.name,
        posKey: product.posKey ?? product.id,
        catalogRevision: product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(product),
        tableId: currentTable.id,
      });
      setFeedbackMessage('Bu kullanıcı ürün ekleme yetkisine sahip değil');
      return;
    }
    if (!isSellableProductType(product.productType)) {
      logOrderFlow('add-product-blocked', {
        source,
        reason: 'inventory-product-in-pos-catalog',
        productId: product.id,
        productName: product.name,
        productType: product.productType,
        tableId: currentTable.id,
      });
      setFeedbackMessage(`${product.name} stok kalemi; adisyona eklenemez`);
      return;
    }
    const mappingResult = ensureOrderProductMapping(product);
    if (mappingResult.autoCreated) {
      setPosMappingWarning(`${product.name} için otomatik POS PLU eşleştirmesi oluşturuldu.`);
      logOrderFlow('product-mapping-autocreated', {
        source,
        productId: product.id,
        productName: product.name,
        tableId: currentTable.id,
      });
    } else {
      setPosMappingWarning('');
    }

    const storedProduct = storedSaleProducts.find((item) => item.id === product.id || normalizeProductName(item.name) === productName);
    const resolvedUnitPrice = storedProduct
      ? resolveSaleProductPrice(storedProduct, { at: new Date(), eventMode: eventPricingEnabled })
      : product.price;
    const complimentaryAllowed = storedProduct?.allowComplimentary ?? product.allowComplimentary ?? true;
    const discountAllowed = storedProduct?.allowDiscount ?? product.allowDiscount ?? true;
    const happyHourEligible = storedProduct?.happyHourEligible ?? product.happyHourEligible ?? false;

    const tableId = currentTable.id;
    const mutation = createOrderMutation({
      tableId,
      source,
      product: {
        id: product.id,
        productId: product.productId,
        posKey: product.posKey ?? product.id,
        catalogRevision: product.catalogRevision,
        sku: product.sku,
        barcode: product.barcode,
        externalId: product.externalId,
        legacyKey: product.legacyKey,
        revision: product.revision,
        productSnapshot: product.productSnapshot,
        name: productName,
        productType: product.productType,
        price: resolvedUnitPrice,
        category: product.category,
        printCategory: storedProduct?.category ?? product.printCategory ?? product.category,
        allowDiscount: discountAllowed,
        allowComplimentary: complimentaryAllowed,
        happyHourEligible,
      },
    }, logOrderFlow);
    orderMutationGuardRef.current = createPendingMutation(mutation);
    updatePaymentRequested(currentTable.id, false);
    const optimisticLine = createOptimisticLine({
      mutation,
      price: resolvedUnitPrice,
    }, logOrderFlow) satisfies OrderLine;
    setOrdersByTable((current) => appendOptimisticLine(current, mutation, optimisticLine));
    persistTableLiveTotals({ [tableId]: getOrderGross([...(ordersByTable[tableId] ?? EMPTY_ORDER_LINES), optimisticLine]) });
    setLastAddedId(product.id);
    setLastMutatedLineId(optimisticLine.id);
    setFeedbackMessage(`${product.name} ekleniyor...`);
    recordPosClickDebug('mutation dispatched', {
      source,
      tableId,
      mutationId: mutation.mutationId,
      productId: product.id,
      productName: product.name,
      posKey: mutation.product.posKey,
      catalogRevision: mutation.product.catalogRevision,
      productSnapshotStatus: getProductSnapshotStatus(product),
      payload: {
        tableId,
        mutationId: mutation.mutationId,
        product: mutation.product,
      },
    });

    const mutationStartedAt = businessNowMs();
    try {
      logOrderFlow('add-product-db-mutation-start', {
        source,
        tableId,
        mutationId: mutation.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        timestamp: new Date().toISOString(),
        sessionTenantId: sessionState.tenantId,
        sessionBranchId: sessionState.activeBranchId,
        sessionRole: sessionState.currentUser.role,
        isAuthenticated: sessionState.isAuthenticated,
        productId: product.id,
        productName: product.name,
        previousLineCount: (ordersByTable[tableId] ?? EMPTY_ORDER_LINES).length,
      });

      const result = commitOrderMutation(mutation, await dispatchOrderMutation<OrderLine>(mutation, logOrderFlow));

      const nextOrders = normalizeStoredOrders(
        {
          ...initialOrders,
          ...result.ordersByTable,
        },
        sourceProducts,
      );
      let committedLines: OrderLine[] = nextOrders[tableId] ?? EMPTY_ORDER_LINES;
      setOrdersByTable((current) => {
        const merged = reconcileAuthoritativeOrders(current, nextOrders, 'mutation-result');
        committedLines = merged[tableId] ?? EMPTY_ORDER_LINES;
        replaceAuthoritativeOrdersByTable(merged);
        persistTableLiveTotals({ [tableId]: getOrderGross(committedLines) });
        return merged;
      });
      const durationMs = businessDurationMs(mutationStartedAt);
      logOrderFlow('add-product-db-mutation-complete', {
        source,
        tableId,
        mutationId: result.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
        productId: product.id,
        productName: product.name,
        nextLineCount: committedLines.length,
        total: getOrderGross(committedLines),
      });
      if (durationMs > SLOW_POS_MUTATION_MS) {
        console.warn('[business-flow] slow product mutation', {
          source,
          tableId,
          mutationId: result.mutationId,
          tenantId: sessionState.tenantId,
          durationMs,
          slowThresholdMs: SLOW_POS_MUTATION_MS,
        });
      }
      recordPosClickDebug('mutation committed', {
        source,
        tableId,
        mutationId: result.mutationId,
        productId: product.id,
        productName: product.name,
        posKey: mutation.product.posKey,
        catalogRevision: mutation.product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(product),
        result: {
          nextLineCount: committedLines.length,
          total: getOrderGross(committedLines),
        },
      });
      setLastAddedId(product.id);
      setLastMutatedLineId(committedLines[committedLines.length - 1]?.id ?? null);
      setFeedbackMessage(`${product.name} adisyona eklendi`);
      setProductSearch('');
    } catch (error) {
      const durationMs = businessDurationMs(mutationStartedAt);
      setOrdersByTable((current) => rollbackOrderMutation(current, mutation));
      logOrderFlow('add-product-db-mutation-failed', {
        source,
        tableId,
        mutationId: mutation.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
        productId: product.id,
        productName: product.name,
        message: error instanceof Error ? error.message : String(error),
      });
      recordPosClickDebug('mutation failed', {
        source,
        tableId,
        mutationId: mutation.mutationId,
        productId: product.id,
        productName: product.name,
        posKey: mutation.product.posKey,
        catalogRevision: mutation.product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(product),
        reason: error instanceof Error ? error.message : String(error),
      });
      setFeedbackMessage('Ürün eklenemedi. Bağlantıyı kontrol edin.');
    }
  };

  const closeProductCard = () => {
    setProductCardProduct(null);
    setProductCardQuantity('1');
    setProductCardNote('');
    setProductCardGuestName('');
    setProductCardSpicePreference('standart');
    setProductCardCookingPreference('standart');
    setProductCardExtrasNote('');
    setProductCardRemovalNote('');
    setProductCardComplimentary(false);
    setProductCardComplimentaryReason('');
    setProductCardIsReturn(false);
  };

  const createQuickCustomerAccount = () => {
    const name = quickAccountName.trim();
    if (!name) {
      setFeedbackMessage('Yeni cari için isim girin');
      return null;
    }

    const account: Account = {
      id: `cus-quick-${Date.now()}`,
      code: `CUS-${Date.now().toString().slice(-6)}`,
      name,
      type: 'customer',
      openingBalance: 0,
      phone: '',
      address: '',
      taxOffice: '',
      taxNumber: '',
      invoiceTitle: name,
    };

    appendStoredAccount(account);
    setStoredAccounts((current) => [account, ...current]);
    setSelectedAccountId(account.id);
    setAccountSearch(name);
    setQuickAccountName('');
    setFeedbackMessage(`${name} için hızlı cari kart açıldı`);
    return account;
  };

  const addProduct = async () => {
    console.log('[adisyon-flow] product-card submit received', {
      tableId: currentTable?.id ?? null,
      selectedTableId,
      productId: productCardProduct?.id,
      productName: productCardProduct?.name,
      canCreateOrder: Boolean(currentTable && productCardProduct && hasPermission('orders.create')),
      isAuthenticated: sessionState.isAuthenticated,
      authLock: getRuntimeAuthFailureSnapshot(),
    });
    if (!currentTable || !productCardProduct) {
      console.error('[adisyon-flow] product-card mutation blocked: missing table or product', {
        tableId: currentTable?.id ?? null,
        selectedTableId,
        productId: productCardProduct?.id,
        productName: productCardProduct?.name,
      });
      setFeedbackMessage(!currentTable ? 'Urun eklemek icin once masa secin' : 'Urun secimi bulunamadi');
      return;
    }
    if (!hasPermission('orders.create')) {
      console.error('[adisyon-flow] product-card mutation blocked: permission denied', {
        tableId: currentTable.id,
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        permissions: runtimeSession.context.permissions.permissions,
        role: runtimeSession.context.permissions.role,
      });
      setFeedbackMessage('Bu kullanici urun ekleme yetkisine sahip degil');
      return;
    }
    if (!await ensureProductMutationCanStart({
      source: 'product-card',
      tableId: currentTable.id,
      productId: productCardProduct.id,
      productName: productCardProduct.name,
    })) {
      setFeedbackMessage('Oturum gerekli. Lütfen tekrar giriş yapın.');
      return;
    }
    recordPosClickDebug('ProductCard clicked', {
      source: 'product-card',
      tableId: currentTable.id,
      productId: productCardProduct.id,
      productName: productCardProduct.name,
      posKey: productCardProduct.posKey ?? productCardProduct.id,
      catalogRevision: productCardProduct.catalogRevision,
      productSnapshotStatus: getProductSnapshotStatus(productCardProduct),
    });
    if (!isSellableProductType(productCardProduct.productType)) {
      setFeedbackMessage(`${productCardProduct.name} stok kalemi; adisyona eklenemez`);
      return;
    }
    const mappingResult = ensureOrderProductMapping(productCardProduct);
    setPosMappingWarning(mappingResult.autoCreated ? `${productCardProduct.name} için otomatik POS PLU eşleştirmesi oluşturuldu.` : '');
    updatePaymentRequested(currentTable.id, false);

    const qtyToAdd = Math.max(Number(productCardQuantity) || 1, 1);
    const normalizedGuestName = productCardGuestName.trim();
    const normalizedNote = productCardNote.trim();
    const normalizedExtrasNote = productCardExtrasNote.trim();
    const normalizedRemovalNote = productCardRemovalNote.trim();
    const resolvedUnitPrice = productCardResolvedUnitPrice;
    const complimentaryAllowed = productCardStoredProduct?.allowComplimentary ?? productCardProduct.allowComplimentary ?? true;
    const discountAllowed = productCardStoredProduct?.allowDiscount ?? productCardProduct.allowDiscount ?? true;
    const happyHourEligible = productCardStoredProduct?.happyHourEligible ?? productCardProduct.happyHourEligible ?? false;
    const effectiveComplimentary = complimentaryAllowed ? productCardComplimentary : false;
    const normalizedComplimentaryReason = effectiveComplimentary ? productCardComplimentaryReason.trim() : '';
    const tableId = currentTable.id;
    const mutation = createOrderMutation({
      tableId,
      source: 'product-card',
      product: {
        id: productCardProduct.id,
        productId: productCardProduct.productId,
        posKey: productCardProduct.posKey ?? productCardProduct.id,
        catalogRevision: productCardProduct.catalogRevision,
        sku: productCardProduct.sku,
        barcode: productCardProduct.barcode,
        externalId: productCardProduct.externalId,
        legacyKey: productCardProduct.legacyKey,
        revision: productCardProduct.revision,
        productSnapshot: productCardProduct.productSnapshot,
        name: productCardProduct.name,
        productType: productCardProduct.productType,
        price: resolvedUnitPrice,
        category: productCardProduct.category,
        printCategory: productCardStoredProduct?.category ?? productCardProduct.printCategory ?? productCardProduct.category,
        allowDiscount: discountAllowed,
        allowComplimentary: complimentaryAllowed,
        happyHourEligible,
      },
      quantity: qtyToAdd,
      note: normalizedNote,
      guestName: normalizedGuestName || undefined,
      spicePreference: productCardSpicePreference,
      cookingPreference: productCardCookingPreference,
      extrasNote: normalizedExtrasNote || undefined,
      removalNote: normalizedRemovalNote || undefined,
      complimentary: effectiveComplimentary,
      complimentaryReason: normalizedComplimentaryReason || undefined,
      isReturn: productCardIsReturn,
    }, logOrderFlow);
    orderMutationGuardRef.current = createPendingMutation(mutation);
    const optimisticLine = createOptimisticLine({
      mutation,
      price: resolvedUnitPrice,
    }, logOrderFlow) satisfies OrderLine;
    setOrdersByTable((current) => appendOptimisticLine(current, mutation, optimisticLine));
    persistTableLiveTotals({ [tableId]: getOrderGross([...(ordersByTable[tableId] ?? EMPTY_ORDER_LINES), optimisticLine]) });
    setLastAddedId(productCardProduct.id);
    setLastMutatedLineId(optimisticLine.id);
    setFeedbackMessage(`${productCardProduct.name} ekleniyor...`);
    recordPosClickDebug('mutation dispatched', {
      source: 'product-card',
      tableId,
      mutationId: mutation.mutationId,
      productId: productCardProduct.id,
      productName: productCardProduct.name,
      posKey: mutation.product.posKey,
      catalogRevision: mutation.product.catalogRevision,
      productSnapshotStatus: getProductSnapshotStatus(productCardProduct),
      payload: { tableId, mutationId: mutation.mutationId, product: mutation.product },
    });

    const mutationStartedAt = businessNowMs();
    try {
      logOrderFlow('add-product-db-mutation-start', {
        source: 'product-card',
        tableId,
        mutationId: mutation.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        timestamp: new Date().toISOString(),
        sessionTenantId: sessionState.tenantId,
        sessionBranchId: sessionState.activeBranchId,
        sessionRole: sessionState.currentUser.role,
        isAuthenticated: sessionState.isAuthenticated,
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        quantity: qtyToAdd,
        previousLineCount: (ordersByTable[tableId] ?? EMPTY_ORDER_LINES).length,
      });

      const result = commitOrderMutation(mutation, await dispatchOrderMutation<OrderLine>(mutation, logOrderFlow));

      const nextOrders = normalizeStoredOrders(
        {
          ...initialOrders,
          ...result.ordersByTable,
        },
        sourceProducts,
      );
      let committedLines: OrderLine[] = nextOrders[tableId] ?? EMPTY_ORDER_LINES;
      setOrdersByTable((current) => {
        const merged = reconcileAuthoritativeOrders(current, nextOrders, 'mutation-result');
        committedLines = merged[tableId] ?? EMPTY_ORDER_LINES;
        replaceAuthoritativeOrdersByTable(merged);
        persistTableLiveTotals({ [tableId]: getOrderGross(committedLines) });
        return merged;
      });
      const touchedLineId = committedLines[committedLines.length - 1]?.id ?? null;
      const durationMs = businessDurationMs(mutationStartedAt);
      logOrderFlow('add-product-db-mutation-complete', {
        source: 'product-card',
        tableId,
        mutationId: result.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        nextLineCount: committedLines.length,
        total: getOrderGross(committedLines),
      });
      if (durationMs > SLOW_POS_MUTATION_MS) {
        console.warn('[business-flow] slow product mutation', {
          source: 'product-card',
          tableId,
          mutationId: result.mutationId,
          tenantId: sessionState.tenantId,
          durationMs,
          slowThresholdMs: SLOW_POS_MUTATION_MS,
        });
      }
      recordPosClickDebug('mutation committed', {
        source: 'product-card',
        tableId,
        mutationId: result.mutationId,
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        posKey: mutation.product.posKey,
        catalogRevision: mutation.product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(productCardProduct),
        result: {
          nextLineCount: committedLines.length,
          total: getOrderGross(committedLines),
        },
      });
      setLastAddedId(productCardProduct.id);
      setLastMutatedLineId(touchedLineId);
      setFeedbackMessage(`${productCardProduct.name} adisyona eklendi`);
      setProductSearch('');
      closeProductCard();
    } catch (error) {
      const durationMs = businessDurationMs(mutationStartedAt);
      setOrdersByTable((current) => rollbackOrderMutation(current, mutation));
      logOrderFlow('add-product-db-mutation-failed', {
        source: 'product-card',
        tableId,
        mutationId: mutation.mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        message: error instanceof Error ? error.message : String(error),
      });
      recordPosClickDebug('mutation failed', {
        source: 'product-card',
        tableId,
        mutationId: mutation.mutationId,
        productId: productCardProduct.id,
        productName: productCardProduct.name,
        posKey: mutation.product.posKey,
        catalogRevision: mutation.product.catalogRevision,
        productSnapshotStatus: getProductSnapshotStatus(productCardProduct),
        reason: error instanceof Error ? error.message : String(error),
      });
      setFeedbackMessage('Ürün eklenemedi. Bağlantıyı kontrol edin.');
    }
  };

  const applyGuestSplitSelection = (guestName: string) => {
    setSplitSelection(
      Object.fromEntries(
        lines.map((line) => [line.id, line.guestName?.trim() === guestName ? line.qty : 0]),
      ) as Record<string, number>,
    );
  };

  const clearGuestSplitSelection = () => {
    setSplitSelection(Object.fromEntries(lines.map((line) => [line.id, 0])) as Record<string, number>);
  };

  const persistLineMutation = async (input: { action: 'update_line_quantity' | 'remove_line'; lineId: string; quantity?: number; tableId: string }) => {
    const mutationId = `${input.tableId}-${input.lineId}-${input.action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inFlightKey = `${input.tableId}:${input.lineId}`;
    if (lineMutationInFlightRef.current.has(inFlightKey)) {
      console.warn('[business-flow] line mutation skipped while in flight', {
        tableId: input.tableId,
        lineId: input.lineId,
        action: input.action,
        quantity: input.quantity,
        tenantId: sessionState.tenantId,
        mutationId,
        inFlightCount: lineMutationInFlightRef.current.size,
        timestamp: new Date().toISOString(),
      });
      setFeedbackMessage('Bu satir guncelleniyor. Bir saniye sonra tekrar deneyin.');
      return;
    }
    lineMutationInFlightRef.current.add(inFlightKey);
    const mutationStartedAt = businessNowMs();
    try {
      logOrderFlow('line-mutation-start', {
        tableId: input.tableId,
        lineId: input.lineId,
        action: input.action,
        quantity: input.quantity,
        mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        timestamp: new Date().toISOString(),
      });
      const response = await runtimeFetch('/api/pos/table-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: input.action,
          tableId: input.tableId,
          lineId: input.lineId,
          quantity: input.quantity,
          mutationId,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; ordersByTable?: Record<string, OrderLine[]>; error?: string; reason?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.reason ?? payload?.error ?? `line mutation failed (${response.status})`);
      }
      if (payload.ordersByTable) {
        const nextOrders = normalizeStoredOrders(payload.ordersByTable, sourceProducts);
        setOrdersByTable((current) => {
          const merged = reconcileAuthoritativeOrders(current, nextOrders, 'mutation-result');
          replaceAuthoritativeOrdersByTable(merged);
          persistTableLiveTotals({ [input.tableId]: getOrderGross(merged[input.tableId] ?? EMPTY_ORDER_LINES) });
          return merged;
        });
      }
      const durationMs = businessDurationMs(mutationStartedAt);
      logOrderFlow('line-mutation-complete', {
        tableId: input.tableId,
        lineId: input.lineId,
        action: input.action,
        quantity: input.quantity,
        mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
      });
      if (durationMs > SLOW_POS_MUTATION_MS) {
        console.warn('[business-flow] slow line mutation', {
          tableId: input.tableId,
          lineId: input.lineId,
          action: input.action,
          mutationId,
          tenantId: sessionState.tenantId,
          durationMs,
          slowThresholdMs: SLOW_POS_MUTATION_MS,
        });
      }
    } catch (error) {
      const durationMs = businessDurationMs(mutationStartedAt);
      console.error('[business-flow] line mutation failed', {
        tableId: input.tableId,
        lineId: input.lineId,
        action: input.action,
        quantity: input.quantity,
        mutationId,
        tenantId: sessionState.tenantId,
        runtimeScope: 'tenant',
        durationMs,
        timestamp: new Date().toISOString(),
        error,
      });
      setFeedbackMessage('Adisyon degisikligi kaydedilemedi. Sayfayi yenileyip tekrar deneyin.');
    } finally {
      lineMutationInFlightRef.current.delete(inFlightKey);
    }
  };

  const changeLineQuantity = (lineId: string, delta: number) => {
    if (!currentTable) return;
    updatePaymentRequested(currentTable.id, false);
    const tableId = currentTable.id;
    const target = lines.find((line) => line.id === lineId);
    if (!target) {
      console.error('[business-flow] line quantity change failed', { tableId, lineId, delta, reason: 'line-not-found' });
      setFeedbackMessage('Adisyon satiri bulunamadi.');
      return;
    }
    const nextQuantity = Math.max(target.qty + delta, 0);
    const action = nextQuantity > 0 ? 'update_line_quantity' : 'remove_line';

    setOrdersByTable((current) => {
      rememberUndo(current, 'Adisyon g\u00fcncellendi');
      const currentLines = current[tableId] ?? [];
      const nextLines = currentLines
        .map((line) => {
          if (line.id !== lineId) {
            return line;
          }

          const nextQty = line.qty + delta;
          return {
            ...line,
            qty: nextQty,
            sentQty: Math.min(line.sentQty, nextQty),
          };
        })
        .filter((line) => line.qty > 0);

      setFeedbackMessage(delta > 0 ? `${target?.name ?? '\u00dcr\u00fcn'} art\u0131r\u0131ld\u0131` : `${target?.name ?? '\u00dcr\u00fcn'} azalt\u0131ld\u0131`);
      return { ...current, [tableId]: nextLines };
    });
    void persistLineMutation({ action, tableId, lineId, quantity: nextQuantity });

    setLastMutatedLineId(lineId);
  };

  const returnLine = (lineId: string) => {
    if (!currentTable) return;
    updatePaymentRequested(currentTable.id, false);
    const tableId = currentTable.id;
    const target = lines.find((line) => line.id === lineId);
    if (!target) {
      console.error('[business-flow] line return failed', { tableId, lineId, reason: 'line-not-found' });
      setFeedbackMessage('Iade alinacak satir bulunamadi.');
      return;
    }
    const nextQuantity = Math.max(target.qty - 1, 0);
    const action = nextQuantity > 0 ? 'update_line_quantity' : 'remove_line';

    setOrdersByTable((current) => {
      rememberUndo(current, 'Ürün iade alındı');
      const currentLines = current[tableId] ?? [];
      const nextLines = currentLines
        .map((line) => {
          if (line.id !== lineId) {
            return line;
          }

          const nextQty = line.qty - 1;
          return {
            ...line,
            qty: nextQty,
            sentQty: Math.min(line.sentQty, nextQty),
          };
        })
        .filter((line) => line.qty > 0);

      setFeedbackMessage(`${target?.name ?? 'Ürün'} iade alindi`);
      return { ...current, [tableId]: nextLines };
    });
    void persistLineMutation({ action, tableId, lineId, quantity: nextQuantity });

    setLastMutatedLineId(lineId);
  };

  const removeLine = (lineId: string) => {
    if (!currentTable) return;
    updatePaymentRequested(currentTable.id, false);
    const tableId = currentTable.id;
    const target = lines.find((line) => line.id === lineId);
    if (!target) {
      console.error('[business-flow] line remove failed', { tableId, lineId, reason: 'line-not-found' });
      setFeedbackMessage('Silinecek satir bulunamadi.');
      return;
    }

    setOrdersByTable((current) => {
      rememberUndo(current, 'Ürün silindi');
      const currentLines = current[tableId] ?? [];
      const nextLines = currentLines.filter((line) => line.id !== lineId);

      setFeedbackMessage(`${target?.name ?? 'Ürün'} silindi`);
      return { ...current, [tableId]: nextLines };
    });
    void persistLineMutation({ action: 'remove_line', tableId, lineId, quantity: 0 });

    setLastMutatedLineId(lineId);
  };

  const changeSplitQuantity = (lineId: string, delta: number) => {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;

    setSplitSelection((current) => {
      const currentValue = current[lineId] ?? 0;
      const nextValue = Math.min(Math.max(currentValue + delta, 0), line.qty);
      return { ...current, [lineId]: nextValue };
    });
  };

  const undoLastAction = () => {
    setUndoStack((current) => {
      const [latest, ...rest] = current;
      if (!latest) return current;
      setOrdersByTable(cloneOrders(latest.snapshot));
      setFeedbackMessage(`${latest.label} geri al\u0131nd\u0131`);
      return rest;
    });
  };

  const startRepeatAction = (action: () => void) => {
    stopRepeater();
    action();
    holdDelayRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        action();
      }, 95);
    }, 260);
  };

  const setScope = (scope: PaymentScope) => {
    setPaymentScope(scope);
    if (scope === 'full') {
      setCashReceived(discountedSettlementTotal.toFixed(2));
      setCardAmount('0');
      setFeedbackMessage('T\u00fcm hesap tahsilat\u0131na ge\u00e7ildi');
      return;
    }

    setCashReceived('0');
    setCardAmount('0');
    setSelectedAccountId(chargeAccounts[0]?.id ?? '');
    setSplitSelection(Object.fromEntries(lines.map((line) => [line.id, 0])));
    setDiscountRateInput('0');
    setDiscountAmountInput('0');
    setRoundingDiscountEnabled(false);
    setDiscountReason('');
    setFeedbackMessage('Par\u00e7al\u0131 hesap se\u00e7imi haz\u0131r');
  };

  const startPayment = () => {
    if (!currentTable || lines.length === 0 || !hasPermission('payments.take')) {
      console.error('[business-flow] payment open blocked', {
        currentTableId: currentTable?.id,
        lineCount: lines.length,
        hasPaymentPermission: hasPermission('payments.take'),
      });
      setFeedbackMessage(!currentTable ? 'Once masa secin.' : lines.length === 0 ? 'Odeme icin adisyon bos.' : 'Odeme yetkiniz yok.');
      return;
    }
    setPaymentOpen((current) => !current);
    if (!paymentOpen) setPaymentExpanded(true);
    setFeedbackMessage(paymentOpen ? 'Haz\u0131r' : 'Tahsilat tutar\u0131n\u0131 girin');
  };

  const sendOrder = async () => {
    if (!currentTable || lines.length === 0 || !hasPermission('orders.edit')) {
      console.error('[business-flow] send order blocked', {
        currentTableId: currentTable?.id,
        lineCount: lines.length,
        hasEditPermission: hasPermission('orders.edit'),
      });
      setFeedbackMessage(!currentTable ? 'Once masa secin.' : lines.length === 0 ? 'Gonderilecek urun yok.' : 'Siparis gonderme yetkiniz yok.');
      return;
    }
    if (unsentLines.length === 0) {
      setFeedbackMessage('Kaydedilecek yeni ürün yok');
      return;
    }

    const persistOrderState = async (action: 'save_order' | 'mark_order_sent') => {
      const mutationId = `${currentTable.id}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await runtimeFetch('/api/pos/table-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          tableId: currentTable.id,
          mutationId,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; ordersByTable?: Record<string, OrderLine[]>; error?: string; reason?: string } | null;
      if (!response.ok || !payload?.ok || !payload.ordersByTable) {
        throw new Error(payload?.reason ?? payload?.error ?? `${action} failed (${response.status})`);
      }

      const nextOrders = normalizeStoredOrders(payload.ordersByTable, sourceProducts);
      replaceAuthoritativeOrdersByTable(nextOrders);
      setOrdersByTable(nextOrders);
      persistTableLiveTotals({ [currentTable.id]: getOrderGross(nextOrders[currentTable.id] ?? EMPTY_ORDER_LINES) });
      return mutationId;
    };

    try {
      await persistOrderState('save_order');
      setPaymentOpen(false);
    } catch (error) {
      console.error('[business-flow] order save failed', {
        tableId: currentTable.id,
        tenantId: sessionState.tenantId,
        timestamp: new Date().toISOString(),
        error,
      });
      setFeedbackMessage('Adisyon sunucuya kaydedilemedi. Bağlantıyı kontrol edip tekrar deneyin.');
      return;
    }

    const ensureRuntimePrinters = async () => {
      const latest = loadIntegrationState();
      const activeNonFiscal = latest.printerDevices.filter((device) => device.status !== 'Pasif' && device.deviceType !== 'fiscal_pos');
      const hasActive = activeNonFiscal.length > 0;

      if (hasActive) return latest;

      try {
        const agentPrinters = await readBridgePrinterNames();
        if (agentPrinters.length === 0) return latest;

        const existingNames = new Set(latest.printerDevices.map((device) => device.name));
        const newDevices = agentPrinters
          .filter((name) => !existingNames.has(name))
          .map((name, index) => ({
            id: `auto-${Date.now()}-${index}`,
            name,
            role: 'Otomatik Algılanan Yazıcı',
            deviceType: 'receipt_printer' as const,
            connectionType: 'usb' as const,
            systemName: name,
            ip: '',
            port: 0,
            status: 'Aktif' as const,
            queue: 0,
            retry: '10 sn',
            backup: 'Yok',
            group: 'Otomatik',
          }));

        const mergedDevices = [...latest.printerDevices, ...newDevices];
        if (mergedDevices.length === latest.printerDevices.length) return latest;

        const nextState = {
          ...latest,
          printerDevices: mergedDevices,
          printerSettings: {
            ...latest.printerSettings,
            defaultPrinter: latest.printerSettings.defaultPrinter || mergedDevices[0]?.name || '',
            kitchenPrinter: latest.printerSettings.kitchenPrinter || mergedDevices[0]?.name || '',
            barPrinter: latest.printerSettings.barPrinter || mergedDevices[0]?.name || '',
          },
        };

        saveIntegrationState(nextState);
        const refreshed = loadIntegrationState();
        setIntegrationState(refreshed);
        return refreshed;
      } catch (printerDiscoveryError) {
        console.error('[business-flow] printer discovery failed', printerDiscoveryError);
        return latest;
      }
    };

    const runtimeIntegrationState = await ensureRuntimePrinters();
    const runtimeTenantPrinters = registerRuntimeDevices({
      integrationState: runtimeIntegrationState,
      tenant: runtimeSession.context.tenant,
      branch: runtimeSession.context.branch,
    });
    if (!runtimeTenantPrinters.defaultPrinter) {
      setFeedbackMessage('Adisyon kaydedildi. Yazıcı bulunamadı; Local Agent açıkken Entegrasyonlar > Sistem yazıcılarını tara yapın.');
      return;
    }

    const groupedByPrinter = unsentLines.reduce<Record<string, Array<{
      name: string;
      qty: number;
      category: string;
      printCategory: string;
      note?: string;
      extrasNote?: string;
      removalNote?: string;
      complimentaryReason?: string;
    }>>>((groups, line) => {
      const category = line.printCategory ?? line.category;
      const printerName = resolveRuntimePrinterRoute({
        category,
        integrationState: runtimeIntegrationState,
        ownership: runtimeTenantPrinters,
      });

      if (!groups[printerName]) {
        groups[printerName] = [];
      }

      groups[printerName].push({
        name: line.name,
        qty: line.unsentQty,
        category: line.category,
        printCategory: category,
        note: line.note,
        extrasNote: line.extrasNote,
        removalNote: line.removalNote,
        complimentaryReason: line.complimentaryReason,
      });

      return groups;
    }, {});

    const restaurantName = companyState.tradeName || 'Adisyum';
    const branchName = companyState.branchName || '';
    const logoUrl = companyState.logoUrl || '';
    const tableNumber = extractTableNumber(currentTable.name);
    const isFirstOrder = lines.every((line) => line.sentQty === 0);

    const printResults = await Promise.all(
      Object.entries(groupedByPrinter).map(async ([printerName, items]) => {
        // Determine if this is a kitchen or bar ticket
        const isBar = items.some((item) => isRuntimeBarCategory(item.printCategory));

        const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
        const fallbackPrinter = runtimeTenantPrinters.defaultPrinter;

        try {
          if (isBar) {
            await printBarTicket({
              ticketType: 'bar',
              printerName,
              isAdditionalOrder: !isFirstOrder,
              settings: {
                restaurantName,
                branchName,
                logoUrl,
                paperWidth: '80mm',
              },
              order: {
                table: tableNumber,
                items: items
                  .map((item) => ({
                    name: String(item.name ?? '').trim(),
                    qty: Math.max(0, Math.floor(Number(item.qty ?? 0))),
                    price: 0,
                    note: item.note ?? '',
                    extrasNote: item.extrasNote ?? '',
                    removalNote: item.removalNote ?? '',
                    complimentaryReason: item.complimentaryReason ?? '',
                  }))
                  .filter((item) => item.qty > 0 && item.name.length > 0),
              },
            });
          } else {
            await printKitchenTicket({
              ticketType: 'kitchen',
              printerName,
              isAdditionalOrder: !isFirstOrder,
              settings: {
                restaurantName,
                branchName,
                logoUrl,
                paperWidth: '80mm',
              },
              order: {
                table: tableNumber,
                items: items
                  .map((item) => ({
                    name: String(item.name ?? '').trim(),
                    qty: Math.max(0, Math.floor(Number(item.qty ?? 0))),
                    price: 0,
                    note: item.note ?? '',
                    extrasNote: item.extrasNote ?? '',
                    removalNote: item.removalNote ?? '',
                    complimentaryReason: item.complimentaryReason ?? '',
                  }))
                  .filter((item) => item.qty > 0 && item.name.length > 0),
              },
            });
          }
          return { printerName, qty: totalQty, ok: true as const };
        } catch (error) {
          if (fallbackPrinter && fallbackPrinter !== printerName) {
            try {
              if (isBar) {
                await printBarTicket({
                  ticketType: 'bar',
                  printerName: fallbackPrinter,
                  isAdditionalOrder: !isFirstOrder,
                  settings: {
                    restaurantName,
                    branchName,
                    logoUrl,
                    paperWidth: '80mm',
                  },
                  order: {
                    table: tableNumber,
                    items: items
                      .map((item) => ({
                        name: String(item.name ?? '').trim(),
                        qty: Math.max(0, Math.floor(Number(item.qty ?? 0))),
                        price: 0,
                        note: item.note ?? '',
                        extrasNote: item.extrasNote ?? '',
                        removalNote: item.removalNote ?? '',
                        complimentaryReason: item.complimentaryReason ?? '',
                      }))
                      .filter((item) => item.qty > 0 && item.name.length > 0),
                  },
                });
              } else {
                await printKitchenTicket({
                  ticketType: 'kitchen',
                  printerName: fallbackPrinter,
                  isAdditionalOrder: !isFirstOrder,
                  settings: {
                    restaurantName,
                    branchName,
                    logoUrl,
                    paperWidth: '80mm',
                  },
                  order: {
                    table: tableNumber,
                    items: items
                      .map((item) => ({
                        name: String(item.name ?? '').trim(),
                        qty: Math.max(0, Math.floor(Number(item.qty ?? 0))),
                        price: 0,
                        note: item.note ?? '',
                        extrasNote: item.extrasNote ?? '',
                        removalNote: item.removalNote ?? '',
                        complimentaryReason: item.complimentaryReason ?? '',
                      }))
                      .filter((item) => item.qty > 0 && item.name.length > 0),
                  },
                });
              }
              return {
                printerName: `${printerName} -> ${fallbackPrinter}`,
                qty: totalQty,
                ok: true as const,
              };
            } catch (fallbackPrintError) {
              console.error('[business-flow] fallback kitchen/bar print failed', {
                printerName,
                fallbackPrinter,
                error: fallbackPrintError,
              });
            }
          }

          return {
            printerName,
            qty: totalQty,
            ok: false as const,
            error: error instanceof Error ? error.message : 'Local agent erişilemedi',
          };
        }
      }),
    );

    const successfulPrints = printResults.filter((result) => result.ok);
    const failedPrints = printResults.filter((result) => !result.ok);

    if (failedPrints.length > 0) {
      const failedPrinterNames = failedPrints.map((result) => result.printerName).join(', ');
      setFeedbackMessage(`Adisyon kaydedildi fakat yazdırma hatası var: ${failedPrinterNames}. Local agent çalışmıyor olabilir.`);
      return;
    }

    try {
      await persistOrderState('mark_order_sent');
    } catch (error) {
      console.error('[business-flow] printed order sent-state save failed', {
        tableId: currentTable.id,
        tenantId: sessionState.tenantId,
        timestamp: new Date().toISOString(),
        error,
      });
      setFeedbackMessage('Adisyon yazdırıldı fakat gönderim durumu kaydedilemedi. Tekrar kontrol edin.');
      return;
    }

    const branchIdForStock = resolveStockRuntimeBranchId(activeBranchId) as BranchId;
    try {
      recordOrderForSmartStock(
        branchIdForStock,
        unsentLines.map((line) => ({
          id: line.id,
          name: line.name,
          qty: line.unsentQty,
          note: [line.note, line.extrasNote, line.removalNote].filter(Boolean).join(' '),
        })),
      );
    } catch (stockRuntimeError) {
      console.error('[business-flow] smart stock record failed', stockRuntimeError);
    }

    setFeedbackMessage(
      successfulPrints
        .map((result) => `${result.printerName}: ${result.qty} ürün yazdırıldı`)
        .join(' | '),
    );
  };

  const sendCheckToTable = async () => {
    if (!currentTable || lines.length === 0 || !hasPermission('orders.edit')) {
      console.error('[business-flow] check print blocked', {
        currentTableId: currentTable?.id,
        lineCount: lines.length,
        hasEditPermission: hasPermission('orders.edit'),
      });
      setFeedbackMessage(!currentTable ? 'Once masa secin.' : lines.length === 0 ? 'Yazdirilacak adisyon yok.' : 'Adisyon yazdirma yetkiniz yok.');
      return;
    }

    const runtimeCompanyState = loadCompanyState();
    const runtimeIntegrationState = loadIntegrationState();
    const runtimeTenantPrinters = registerRuntimeDevices({
      integrationState: runtimeIntegrationState,
      tenant: runtimeSession.context.tenant,
      branch: runtimeSession.context.branch,
    });
    if (!runtimeTenantPrinters.defaultPrinter) {
      setFeedbackMessage('Hesap adisyonu için varsayılan yazıcı bulunamadı.');
      return;
    }

    const tableNumber = extractTableNumber(currentTable.name);
    const isFirstOrder = lines.every((line) => line.sentQty === 0);

    const defaultPrinter = runtimeTenantPrinters.defaultPrinter;
    const kitchenPrinter = runtimeTenantPrinters.kitchenPrinter;
    const primaryPrinter = kitchenPrinter || defaultPrinter;
    let printedPrinter = primaryPrinter;
    const receiptItems = lines.map((line) => ({
      id: line.id,
      name: line.name,
      qty: line.qty,
      price: getOrderLineGrossUnitAmount(line),
      category: line.category,
    }));
    const receiptTotal = roundCurrency(receiptItems.reduce((sum, item) => sum + (item.qty * item.price), 0));

    try {
      await printCustomerReceipt({
        printerName: primaryPrinter,
        settings: {
          restaurantName: runtimeCompanyState.tradeName || 'Adisyum',
          branchName: runtimeCompanyState.branchName || '',
          logoUrl: runtimeCompanyState.logoUrl || '',
          footerText: runtimeCompanyState.receiptFooter || 'Afiyet olsun',
          paperWidth: runtimeCompanyState.receiptPaperWidth || '80mm',
          receiptTitle: runtimeCompanyState.receiptTitle || 'ADİSYON',
          showLogo: runtimeCompanyState.receiptShowLogo,
          showBranch: runtimeCompanyState.receiptShowBranch,
          showDate: runtimeCompanyState.receiptShowDate,
          showTable: runtimeCompanyState.receiptShowTable,
          showItemHeader: runtimeCompanyState.receiptShowItemHeader,
          headerScale: runtimeCompanyState.receiptHeaderScale,
          itemScale: runtimeCompanyState.receiptItemScale,
          totalScale: runtimeCompanyState.receiptTotalScale,
        },
        order: {
          table: tableNumber,
          createdAt: new Date(),
          subtotal: receiptTotal,
          discount: 0,
          total: receiptTotal,
          netTotal: receiptTotal,
          items: receiptItems,
        },
      });
    } catch {
      if (defaultPrinter && defaultPrinter !== primaryPrinter) {
        try {
          await printCustomerReceipt({
            printerName: defaultPrinter,
            settings: {
              restaurantName: runtimeCompanyState.tradeName || 'Adisyum',
              branchName: runtimeCompanyState.branchName || '',
              logoUrl: runtimeCompanyState.logoUrl || '',
              footerText: runtimeCompanyState.receiptFooter || 'Afiyet olsun',
              paperWidth: runtimeCompanyState.receiptPaperWidth || '80mm',
              receiptTitle: runtimeCompanyState.receiptTitle || 'ADİSYON',
              showLogo: runtimeCompanyState.receiptShowLogo,
              showBranch: runtimeCompanyState.receiptShowBranch,
              showDate: runtimeCompanyState.receiptShowDate,
              showTable: runtimeCompanyState.receiptShowTable,
              showItemHeader: runtimeCompanyState.receiptShowItemHeader,
              headerScale: runtimeCompanyState.receiptHeaderScale,
              itemScale: runtimeCompanyState.receiptItemScale,
              totalScale: runtimeCompanyState.receiptTotalScale,
            },
            order: {
              table: tableNumber,
              createdAt: new Date(),
              subtotal: receiptTotal,
              discount: 0,
              total: receiptTotal,
              netTotal: receiptTotal,
              items: receiptItems,
            },
          });
          printedPrinter = defaultPrinter;
        } catch {
          setFeedbackMessage('Hesap adisyonu gönderilemedi. Local agent veya yazıcıyı kontrol edin.');
          return;
        }
      } else {
        setFeedbackMessage('Hesap adisyonu gönderilemedi. Local agent veya yazıcıyı kontrol edin.');
        return;
      }
    }

    updatePaymentRequested(currentTable.id, true);
    setPaymentOpen(false);
    setFeedbackMessage(`Hesap adisyonu yazdırıldı (${printedPrinter}) ${isFirstOrder ? '(İlk Adisyon)' : ''}`);
  };
  const selectedAccount = chargeAccounts.find((account) => account.id === selectedAccountId) ?? null;
    const paymentLabel = paymentMethod === 'cash'
      ? 'Nakit'
      : paymentMethod === 'card'
        ? 'Kart'
        : paymentMethod === 'mixed'
          ? 'Karma'
          : paymentMethod === 'meal'
            ? 'Yemek kartı'
            : paymentMethod === 'euro'
              ? 'Euro'
              : paymentMethod === 'dollar'
                ? 'Dolar'
                : 'Cari hesap';
  const cashValue = parseAmountInput(cashReceived);
  const cardValue = parseAmountInput(cardAmount);
  const euroRate = Math.max(parseAmountInput(euroRateInput), 0);
  const dollarRate = Math.max(parseAmountInput(dollarRateInput), 0);
  const euroPaymentAmount = euroRate > 0 ? roundCurrency(paymentTargetTotal / euroRate) : 0;
  const dollarPaymentAmount = dollarRate > 0 ? roundCurrency(paymentTargetTotal / dollarRate) : 0;
  const mixedCashCardAmount = roundCurrency(cashValue + cardValue);
  const mixedAccountRemainder = paymentMethod === 'mixed' && mixedAccountEnabled ? Math.max(roundCurrency(paymentTargetTotal - mixedCashCardAmount), 0) : 0;
    const paidAmount = paymentMethod === 'cash'
      ? cashValue
      : paymentMethod === 'card' || paymentMethod === 'meal' || paymentMethod === 'euro' || paymentMethod === 'dollar'
        ? paymentTargetTotal
        : paymentMethod === 'mixed'
          ? mixedCashCardAmount + mixedAccountRemainder
          : discountedSettlementTotal;
  const remainingAmount = Math.max(roundCurrency(paymentTargetTotal - paidAmount), 0);
  const changeAmount = Math.max(roundCurrency(paidAmount - paymentTargetTotal), 0);

  useEffect(() => {
    if (!paymentOpen) return;
    if (paymentMethod === 'cash') {
      setCashReceived(paymentTargetTotal.toFixed(2));
    }
  }, [paymentMethod, paymentOpen, paymentTargetTotal]);

  function updatePadValue(current: string, key: string, integerOnly = false) {
    if (key === 'clear') return '';
    if (key === 'back') return current.slice(0, -1);
    if (key === ',' && !integerOnly) {
      if (current.includes('.')) return current;
      return current.length === 0 ? '0.' : `${current}.`;
    }
    if (key === ',' && integerOnly) return current;
    if (key === '00') return current.length === 0 ? '0' : `${current}00`;
    return current === '0' ? key : `${current}${key}`;
  }

  function handlePadPress(key: string) {
    if (activePadTarget === 'cash') {
      setCashReceived((current) => updatePadValue(current, key));
      return;
    }

    if (activePadTarget === 'splitAmount') {
      setSplitAmountInput((current) => updatePadValue(current, key));
      return;
    }

    setCardAmount((current) => updatePadValue(current, key));
  }

  const postAccountCharge = (account: Account, amount: number, description: string) => {
    appendStoredFinanceAccountTransaction(
      buildFinanceTransaction({
        accountId: account.id,
        type: account.type === 'partner' ? 'partner_charge' : 'customer_charge',
        amount: roundCurrency(amount),
        description,
        date: new Date().toISOString().slice(0, 10),
      }),
    );

    setRecentAccountIds((current) => {
      const next = [account.id, ...current.filter((id) => id !== account.id)].slice(0, 5);
      persistRecentAccountIds(RECENT_ACCOUNT_KEY, next);
      return next;
    });
  };

  const recordPaymentJournal = (tableName: string, amount: number, mutationId: string) => {
    const date = new Date().toISOString().slice(0, 10);
    const entries = [] as ReturnType<typeof buildPaymentJournalEntry>[];
    const sourceId = currentTable?.id ?? tableName;
    const reconciliationBase = `${sourceId}:${mutationId}`;

    if (paymentMethod === 'cash') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:cash`,
          date,
          amount: roundCurrency(amount),
          method: 'cash',
          source: 'table',
          sourceId,
          label: `${tableName} adisyon tahsilatı`,
        }),
      );
    } else if (paymentMethod === 'card') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:card`,
          date,
          amount: roundCurrency(amount),
          method: 'card',
          source: 'table',
          sourceId,
          label: `${tableName} adisyon tahsilatı`,
        }),
      );
    } else if (paymentMethod === 'meal') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:meal`,
          date,
          amount: roundCurrency(amount),
          method: 'meal',
          source: 'table',
          sourceId,
          label: `${tableName} yemek kartı tahsilatı`,
        }),
      );
    } else if (paymentMethod === 'euro') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:euro`,
          date,
          amount: roundCurrency(amount),
          method: 'euro',
          source: 'table',
          sourceId,
          label: `${tableName} euro tahsilatı (${formatForeignMoney(euroPaymentAmount, 'EUR')} / kur ${euroRate.toLocaleString('tr-TR')})`,
        }),
      );
    } else if (paymentMethod === 'dollar') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:dollar`,
          date,
          amount: roundCurrency(amount),
          method: 'dollar',
          source: 'table',
          sourceId,
          label: `${tableName} dolar tahsilatı (${formatForeignMoney(dollarPaymentAmount, 'USD')} / kur ${dollarRate.toLocaleString('tr-TR')})`,
        }),
      );
    } else if (paymentMethod === 'account') {
      entries.push(
        buildPaymentJournalEntry({
          reconciliationKey: `${reconciliationBase}:account`,
          date,
          amount: roundCurrency(amount),
          method: 'account',
          source: 'table',
          sourceId,
          label: `${tableName} cari tahsilat`,
        }),
      );
    } else if (paymentMethod === 'mixed') {
      const cashPart = Math.min(roundCurrency(cashValue), roundCurrency(amount));
      const remainderAfterCash = Math.max(roundCurrency(amount - cashPart), 0);
      const cardPart = Math.min(roundCurrency(cardValue), remainderAfterCash);
      const accountPart = mixedAccountEnabled ? Math.max(roundCurrency(amount - cashPart - cardPart), 0) : 0;

      if (cashPart > 0) {
        entries.push(
          buildPaymentJournalEntry({
            reconciliationKey: `${reconciliationBase}:cash`,
            date,
            amount: cashPart,
            method: 'cash',
            source: 'table',
            sourceId,
            label: `${tableName} karma tahsilat - nakit`,
          }),
        );
      }
      if (cardPart > 0) {
        entries.push(
          buildPaymentJournalEntry({
            reconciliationKey: `${reconciliationBase}:card`,
            date,
            amount: cardPart,
            method: 'card',
            source: 'table',
            sourceId,
            label: `${tableName} karma tahsilat - kart`,
          }),
        );
      }
      if (accountPart > 0) {
        entries.push(
          buildPaymentJournalEntry({
            reconciliationKey: `${reconciliationBase}:account`,
            date,
            amount: accountPart,
            method: 'account',
            source: 'table',
            sourceId,
            label: `${tableName} karma tahsilat - cari`,
          }),
        );
      }
    }

    if (entries.length > 0) {
      appendPaymentJournalEntries(entries);
    }
  };

  const mutateAuthoritativePayment = async (
    action: 'get_payment_state' | 'add_partial_payment' | 'finalize_payment',
    tableId: string,
    amount: number,
    mutationId: string,
  ) => {
    const reconciliationKey = `${tableId}:${mutationId}`;
    const response = await runtimeFetch('/api/pos/table-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        mutationId,
        tableId,
        payment: {
          amount: roundCurrency(amount),
          method: paymentMethod,
          scope: paymentScope,
          currency: 'TRY',
          receivedAt: new Date().toISOString(),
          reconciliationKey,
          cashAmount: paymentMethod === 'cash' ? roundCurrency(amount) : paymentMethod === 'mixed' ? roundCurrency(cashValue) : 0,
          cardAmount: paymentMethod === 'card' ? roundCurrency(amount) : paymentMethod === 'mixed' ? roundCurrency(cardValue) : 0,
          accountAmount: paymentMethod === 'account' ? roundCurrency(amount) : paymentMethod === 'mixed' ? roundCurrency(mixedAccountRemainder) : 0,
          accountId: selectedAccount?.id,
          accountName: selectedAccount?.name,
          accountType: selectedAccount?.type,
        },
      }),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      ordersByTable?: Record<string, OrderLine[]>;
      paymentState?: AuthoritativePaymentState;
      paymentCreated?: boolean;
      error?: string;
    } | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? `Tahsilat isteği başarısız: ${response.status}`);
    }
    if (payload.ordersByTable) {
      replaceAuthoritativeOrdersByTable(payload.ordersByTable);
      setOrdersByTable(payload.ordersByTable);
    }
    if (payload.paymentState) setAuthoritativePaymentState(payload.paymentState);
    return payload;
  };

  useEffect(() => {
    if (!paymentOpen || !currentTable?.id || lines.length === 0) return;
    setAuthoritativePaymentState(null);
    const mutationId = `${currentTable.id}-payment-state-${Date.now()}`;
    void mutateAuthoritativePayment('get_payment_state', currentTable.id, 0, mutationId).catch((error) => {
      console.error('[payment-flow] authoritative payment state load failed', {
        tableId: currentTable.id,
        tenantId: sessionState.tenantId,
        error,
      });
      setFeedbackMessage('Ödeme durumu sunucudan okunamadı. Lütfen tekrar deneyin.');
    });
  // Payment state refreshes when a different table payment panel opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOpen, currentTable?.id]);

  const releasePaymentSubmission = () => {
    paymentInFlightRef.current = false;
    setPaymentSubmitting(false);
  };

  const completePayment = async () => {
    if (!currentTable || lines.length === 0 || !hasPermission('payments.take')) {
      console.error('[business-flow] payment complete blocked', {
        currentTableId: currentTable?.id,
        lineCount: lines.length,
        hasPaymentPermission: hasPermission('payments.take'),
      });
      setFeedbackMessage(!currentTable ? 'Once masa secin.' : lines.length === 0 ? 'Adisyon bos.' : 'Odeme yetkiniz yok.');
      return;
    }
    const duplicateGuard = lastPaymentGuardRef.current;
    if (
      duplicateGuard &&
      duplicateGuard.tableId === currentTable.id &&
      duplicateGuard.total === paymentTargetTotal &&
      Date.now() - duplicateGuard.at < 6000
    ) {
      setFeedbackMessage('Aynı ödeme az önce alındı. Tekrarı engellendi.');
      return;
    }
    if (paymentScope === 'split' && paymentTargetTotal <= 0) {
      setFeedbackMessage('Önce bölünecek tutarı belirleyin');
      return;
    }
    if (paymentScope === 'split' && splitMode === 'person' && selectedSplitItemCount === 0) {
      setFeedbackMessage('Önce ödeme alınacak ürünleri seçin');
      return;
    }
    if (paymentMethod === 'euro' && euroRate <= 0) {
      setFeedbackMessage('Euro kuru girin');
      return;
    }
    if (paymentMethod === 'dollar' && dollarRate <= 0) {
      setFeedbackMessage('Dolar kuru girin');
      return;
    }
    if (paidAmount < paymentTargetTotal) {
      setFeedbackMessage('Tahsilat tutar\u0131 toplam\u0131 kar\u015f\u0131lam\u0131yor');
      return;
    }
    if (discountReasonRequired && discountReason.trim().length === 0) {
      setFeedbackMessage('İskonto için açıklama girin');
      return;
    }
    if (paymentMethod === 'account' && !selectedAccount) {
      setFeedbackMessage('Cari hesap seçin');
      return;
    }
    if (paymentMethod === 'mixed' && mixedAccountEnabled && mixedAccountRemainder > 0 && !selectedAccount) {
      setFeedbackMessage('Kalan tutarı cariye atmak için cari hesap seçin');
      return;
    }
    if (paymentInFlightRef.current) {
      console.warn('[business-flow] duplicate payment submit blocked', {
        tableId: currentTable.id,
        tenantId: sessionState.tenantId,
        paymentTargetTotal,
        paymentScope,
        timestamp: new Date().toISOString(),
      });
      setFeedbackMessage('Tahsilat isleniyor. Lutfen sonucu bekleyin.');
      return;
    }

    const currentTableId = currentTable.id;
    const paymentMutationId = `${currentTableId}-payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const paymentStartedAt = businessNowMs();
    const isPartialPayment = paymentScope === 'split' && paymentTargetTotal < remainingSettlementTotal;
    paymentInFlightRef.current = true;
    setPaymentSubmitting(true);
    lastPaymentGuardRef.current = { tableId: currentTableId, total: paymentTargetTotal, at: Date.now() };
    console.log('[business-flow] payment commit started', {
      tableId: currentTableId,
      tenantId: sessionState.tenantId,
      mutationId: paymentMutationId,
      runtimeScope: 'tenant',
      lineCount: lines.length,
      paymentScope,
      paymentMethod,
      paymentTargetTotal,
      discountedSettlementTotal,
      timestamp: new Date().toISOString(),
    });

    if (paymentScope === 'split' && splitMode === 'person') {
      const paidItems = lines.filter((line) => (splitSelection[line.id] ?? 0) > 0);
      let paymentResult: Awaited<ReturnType<typeof mutateAuthoritativePayment>>;
      try {
        paymentResult = await mutateAuthoritativePayment('add_partial_payment', currentTableId, paymentTargetTotal, paymentMutationId);
      } catch (error) {
        console.error('[payment-flow] authoritative partial payment failed', {
          tableId: currentTableId,
          tenantId: sessionState.tenantId,
          mutationId: paymentMutationId,
          amount: paymentTargetTotal,
          error,
        });
        setFeedbackMessage('Parçalı tahsilat sunucuya yazılamadı. Kasa/cari kaydı yapılmadı.');
        releasePaymentSubmission();
        return;
      }
      if (paymentResult.paymentCreated !== false) recordPaymentJournal(currentTable.name, paymentTargetTotal, paymentMutationId);
      if (paymentResult.paymentCreated !== false && paymentMethod === 'account' && selectedAccount) {
        postAccountCharge(
          selectedAccount,
          paymentTargetTotal,
          `${currentTable.name} masa adisyonu - ${paidItems.length} kalem cariye işlendi`,
        );
          queueOfflinePaymentSnapshot({
            tenantId: sessionState.tenantId,
            branchId: sessionState.activeBranchId,
            tableId: currentTableId,
            payload: {
              tableName: currentTable.name,
              paymentLabel,
              paymentMethod,
              paymentScope,
              splitMode,
              total: paymentTargetTotal,
              lines: lines.map((line) => ({
                id: line.id,
                name: line.name,
                qty: line.qty,
                price: line.price,
                sentQty: line.sentQty,
              })),
            },
          });
      }
      setPaymentScope('full');
      setSplitMode('person');
      setSplitAmountInput('');
      setSplitSelection({});
      setCashReceived(String(paymentResult.paymentState?.remainingTotal ?? ''));
      setCardAmount('');
      updatePaymentRequested(currentTableId, false);
      const durationMs = businessDurationMs(paymentStartedAt);
      console.log('[business-flow] payment split commit completed', {
        tableId: currentTableId,
        tenantId: sessionState.tenantId,
        mutationId: paymentMutationId,
        paidItemCount: paidItems.length,
        amount: paymentTargetTotal,
        durationMs,
        timestamp: new Date().toISOString(),
      });
      if (durationMs > SLOW_PAYMENT_COMMIT_MS) {
        console.warn('[business-flow] slow payment commit', {
          tableId: currentTableId,
          tenantId: sessionState.tenantId,
          mutationId: paymentMutationId,
          paymentScope,
          durationMs,
          slowThresholdMs: SLOW_PAYMENT_COMMIT_MS,
        });
      }
      setDiscountRateInput('0');
      setRoundingDiscountEnabled(false);
      setDiscountReason('');
      setFeedbackMessage(`${paidItems.length} kalem için ${formatMoney(paymentTargetTotal)} tahsil edildi. Kalan: ${formatMoney(paymentResult.paymentState?.remainingTotal ?? 0)}`);
      releasePaymentSubmission();
      return;
    }

    if (isPartialPayment) {
      let paymentResult: Awaited<ReturnType<typeof mutateAuthoritativePayment>>;
      try {
        paymentResult = await mutateAuthoritativePayment('add_partial_payment', currentTableId, paymentTargetTotal, paymentMutationId);
      } catch (error) {
        console.error('[payment-flow] authoritative partial payment failed', {
          tableId: currentTableId,
          tenantId: sessionState.tenantId,
          mutationId: paymentMutationId,
          amount: paymentTargetTotal,
          error,
        });
        setFeedbackMessage('Parçalı tahsilat sunucuya yazılamadı. Kasa/cari kaydı yapılmadı.');
        releasePaymentSubmission();
        return;
      }
      if (paymentResult.paymentCreated !== false) recordPaymentJournal(currentTable.name, paymentTargetTotal, paymentMutationId);
      if (paymentResult.paymentCreated !== false && paymentMethod === 'account' && selectedAccount) {
        postAccountCharge(
          selectedAccount,
          paymentTargetTotal,
          `${currentTable.name} masa adisyonu - kısmi tutar cariye işlendi`,
        );
      }
      setPaymentScope('full');
      setSplitMode('person');
      setSplitAmountInput('');
      setCashReceived(String(paymentResult.paymentState?.remainingTotal ?? ''));
      setCardAmount('');
      setDiscountRateInput('0');
      setRoundingDiscountEnabled(false);
      setDiscountReason('');
      updatePaymentRequested(currentTableId, false);
      const durationMs = businessDurationMs(paymentStartedAt);
      console.log('[business-flow] payment partial commit completed', {
        tableId: currentTableId,
        tenantId: sessionState.tenantId,
        mutationId: paymentMutationId,
        amount: paymentTargetTotal,
        remaining: paymentResult.paymentState?.remainingTotal,
        durationMs,
        timestamp: new Date().toISOString(),
      });
      if (durationMs > SLOW_PAYMENT_COMMIT_MS) {
        console.warn('[business-flow] slow payment commit', {
          tableId: currentTableId,
          tenantId: sessionState.tenantId,
          mutationId: paymentMutationId,
          paymentScope,
          durationMs,
          slowThresholdMs: SLOW_PAYMENT_COMMIT_MS,
        });
      }
      setFeedbackMessage(`${formatMoney(paymentTargetTotal)} tahsil edildi, kalan ${formatMoney(paymentResult.paymentState?.remainingTotal ?? 0)}`);
      releasePaymentSubmission();
      return;
    }

    let paymentResult: Awaited<ReturnType<typeof mutateAuthoritativePayment>>;
    try {
      paymentResult = await mutateAuthoritativePayment('finalize_payment', currentTableId, paymentTargetTotal, paymentMutationId);
    } catch (error) {
      console.error('[business-flow] payment table close failed', {
        tableId: currentTableId,
        tenantId: sessionState.tenantId,
        mutationId: paymentMutationId,
        amount: paymentTargetTotal,
        durationMs: businessDurationMs(paymentStartedAt),
        timestamp: new Date().toISOString(),
        error,
      });
      setFeedbackMessage('Tahsilat sunucuya yazilamadi. Kasa/cari kaydi yapilmadi; lutfen tekrar deneyin.');
      releasePaymentSubmission();
      return;
    }

    if (paymentResult.paymentCreated !== false && paymentMethod === 'account' && selectedAccount) {
      postAccountCharge(
        selectedAccount,
        paymentTargetTotal,
        `${currentTable.name} masa adisyonu cari hesaba işlendi`,
      );
    }
    if (paymentResult.paymentCreated !== false && paymentMethod === 'mixed' && mixedAccountEnabled && mixedAccountRemainder > 0 && selectedAccount) {
      postAccountCharge(
        selectedAccount,
        mixedAccountRemainder,
        `${currentTable.name} masa adisyonu - karma tahsilat kalan tutar`,
      );
    }
    if (paymentResult.paymentCreated !== false) recordPaymentJournal(currentTable.name, paymentTargetTotal, paymentMutationId);

    setOrdersByTable((current) => {
      rememberUndo(current, `${paymentLabel} tahsilat\u0131`);
      return { ...current, [currentTableId]: [] };
    });
    replaceAuthoritativeOrdersByTable({ ...ordersByTable, [currentTableId]: [] });
    persistTableLiveTotals({ [currentTableId]: 0 });

    setPaymentOpen(false);
    setPaymentScope('full');
    setSplitMode('person');
    setSplitAmountInput('');
    setSplitSelection({});
    setCashReceived('');
    setCardAmount('');
    setMixedAccountEnabled(false);
    updatePaymentRequested(currentTableId, false);
    const fullPaymentDurationMs = businessDurationMs(paymentStartedAt);
    console.log('[business-flow] payment full commit completed', {
      tableId: currentTableId,
      tenantId: sessionState.tenantId,
      mutationId: paymentMutationId,
      amount: paymentTargetTotal,
      paymentMethod,
      durationMs: fullPaymentDurationMs,
      timestamp: new Date().toISOString(),
    });
    if (fullPaymentDurationMs > SLOW_PAYMENT_COMMIT_MS) {
      console.warn('[business-flow] slow payment commit', {
        tableId: currentTableId,
        tenantId: sessionState.tenantId,
        mutationId: paymentMutationId,
        paymentScope,
        durationMs: fullPaymentDurationMs,
        slowThresholdMs: SLOW_PAYMENT_COMMIT_MS,
      });
    }
    releasePaymentSubmission();
    setDiscountRateInput('0');
    setRoundingDiscountEnabled(false);
    setDiscountReason('');
    setFeedbackMessage(`${formatMoney(paymentTargetTotal)} ${paymentLabel.toLowerCase()} tahsil edildi`);
  };

  const canSendOrder = Boolean(currentTable && lines.length > 0 && hasPermission('orders.edit'));
  const canSendCheck = Boolean(currentTable && lines.length > 0 && hasPermission('orders.edit'));
  const canTakePayment = Boolean(currentTable && lines.length > 0 && hasPermission('payments.take'));
  const canCompleteSplit = paymentScope === 'split' ? paymentTargetTotal > 0 : true;
  const canCompleteAccount = paymentMethod === 'account'
    ? Boolean(selectedAccount)
    : paymentMethod === 'mixed' && mixedAccountEnabled && mixedAccountRemainder > 0
      ? Boolean(selectedAccount)
      : true;
  const paymentSubmitLabel = paymentScope === 'split'
    ? 'Parçalı tahsilat ekle'
    : (authoritativePaymentState?.paidTotal ?? 0) > 0
      ? 'Kalan bakiyeyi tahsil et'
      : 'Tahsilatı tamamla';

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tagName = element.tagName.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || element.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        if (event.key !== 'Escape') return;
      }
      if (event.key === '/') {
        event.preventDefault();
        productSearchRef.current?.focus();
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        startPayment();
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSendOrder) void sendOrder();
      }
      if (event.key === 'Escape') {
        setPaymentOpen(false);
        setProductCardProduct(null);
        setTableActionsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSendOrder, sendOrder, startPayment]);

  const productCardStoredProduct = useMemo(
    () => (productCardProduct ? storedSaleProducts.find((item) => item.id === productCardProduct.id || item.name === productCardProduct.name) ?? null : null),
    [productCardProduct, storedSaleProducts],
  );
  const productCardResolvedUnitPrice = useMemo(
    () => (productCardStoredProduct ? resolveSaleProductPrice(productCardStoredProduct, { at: new Date(), eventMode: eventPricingEnabled }) : productCardProduct?.price ?? 0),
    [eventPricingEnabled, productCardProduct?.price, productCardStoredProduct],
  );
  const productCardOptionMode = useMemo<'food' | 'drink' | 'dessert'>(() => {
    const category = (productCardStoredProduct?.category ?? productCardProduct?.category ?? '').toLocaleLowerCase('tr-TR');
    const name = (productCardProduct?.name ?? '').toLocaleLowerCase('tr-TR');

    if (category.includes('icecek') || category.includes('içecek') || category.includes('kahve') || /kahve|latte|espresso|cappuccino|çay|cay|meyve suyu|su|cola|kola|limonata|ayran/.test(name)) {
      return 'drink';
    }

    if (category.includes('tatli') || category.includes('tatlı') || /tatlı|tatli|tiramisu|pasta|sütlaç|sutlac|baklava|dondurma/.test(name)) {
      return 'dessert';
    }

    return 'food';
  }, [productCardProduct?.category, productCardProduct?.name, productCardStoredProduct?.category]);
  const productCardTotalPreview = useMemo(
    () => (Math.max(Number(productCardQuantity) || 1, 1)) * (productCardComplimentary ? 0 : productCardIsReturn ? -productCardResolvedUnitPrice : productCardResolvedUnitPrice),
    [productCardComplimentary, productCardIsReturn, productCardQuantity, productCardResolvedUnitPrice],
  );
  const appendProductCardNote = (value: string) => {
    setProductCardNote((current) => {
      const parts = current
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      return parts.includes(value) ? current : [...parts, value].join(', ');
    });
  };
  const showPosDiagnostics = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_POS_DEBUG === '1';
  const mutationGuard = orderMutationGuardRef.current;
  const paymentPanel = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0B1220] text-slate-100">
      <div className="border-b border-white/10 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Tahsilat</p>
            <p className="mt-1 text-[1.7rem] font-bold leading-none tracking-tight text-white">{formatMoney(paymentTargetTotal)}</p>
            <p className="mt-1.5 text-xs font-medium text-slate-400">
              {paymentScope === 'split'
                ? splitMode === 'person'
                  ? `${selectedSplitItemCount} ürün seçili`
                  : 'Tutara gore bol'
                : 'Tum hesap'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('cash');
                setPaymentScope('full');
                setCashReceived(paymentTargetTotal.toFixed(2));
                setCardAmount('0');
                setActivePadTarget('cash');
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Hızlı nakit
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('card');
                setPaymentScope('full');
                setCardAmount(paymentTargetTotal.toFixed(2));
                setCashReceived('0');
                setActivePadTarget('card');
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-700"
            >
              Hızlı kart
            </button>
            <button
              type="button"
              onClick={() => setPaymentExpanded((current) => !current)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#111827] px-3 text-xs font-semibold text-slate-100 transition duration-150 hover:bg-[#172033]"
            >
              {paymentExpanded ? 'Minimal' : 'Detay'}
            </button>
            <button
              type="button"
              onClick={() => setPaymentOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-slate-100 transition duration-150 hover:bg-[#172033] active:scale-[0.97]"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/10 bg-[#111827] px-3 py-2.5 sm:px-4">
        <div className="grid gap-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(86px,1fr))] gap-2">
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('cash');
                setActivePadTarget('cash');
              }}
              className={paymentMethod === 'cash' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Nakit
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={paymentMethod === 'card' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-sky-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Kart
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('mixed');
                setActivePadTarget('cash');
              }}
              className={paymentMethod === 'mixed' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-violet-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Karma
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('account')}
              className={paymentMethod === 'account' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-amber-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Cari
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('meal')}
              className={paymentMethod === 'meal' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-orange-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Yemek
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('euro')}
              className={paymentMethod === 'euro' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-cyan-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Euro
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('dollar')}
              className={paymentMethod === 'dollar' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-lime-600 px-2 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-2 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Dolar
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentScope('full')}
              className={paymentScope === 'full' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-3 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Tamami
            </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentScope('split');
                            setSplitMode('person');
                            setActivePadTarget('cash');
                          }}
                          className={paymentScope === 'split' && splitMode === 'person' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-3 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
                        >
                          Kisi
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentScope('split');
                setSplitMode('amount');
                setActivePadTarget('splitAmount');
              }}
              className={paymentScope === 'split' && splitMode === 'amount' ? 'inline-flex h-9 items-center justify-center rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white' : 'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-[#0B1220] px-3 text-xs font-semibold text-slate-100 transition hover:bg-[#172033]'}
            >
              Tutar
            </button>
          </div>
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 gap-2.5 overflow-y-auto px-3 py-2.5 pb-28 sm:px-4 ${paymentExpanded ? 'xl:grid-cols-[minmax(0,1fr)_290px]' : ''}`}>
        <div className="grid content-start gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-2.5">
            <div className="grid gap-2.5">
              {paymentScope === 'split' && splitMode === 'person' ? (
                <div className="rounded-2xl border border-emerald-500 bg-slate-900 px-4 py-3 text-left shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Seçilen ürünler</p>
                  <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">{selectedSplitItemCount} kalem</p>
                  <p className="mt-1.5 text-xs text-slate-400">Sağ listeden seçtiklerin burada toplanır.</p>
                  {guestLabels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {guestLabels.map((guestName) => (
                        <button
                          key={`guest-${guestName}`}
                          type="button"
                          onClick={() => applyGuestSplitSelection(guestName)}
                          className="inline-flex h-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                        >
                          {guestName}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={clearGuestSplitSelection}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-slate-600 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                      >
                        Temizle
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-2 max-h-28 space-y-1.5 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                    {lines.filter((line) => (splitSelection[line.id] ?? 0) > 0).length > 0 ? (
                      lines
                        .filter((line) => (splitSelection[line.id] ?? 0) > 0)
                        .map((line) => (
                          <div key={`split-${line.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-white">{line.name}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">{splitSelection[line.id] ?? 0} adet</p>
                            </div>
                            <span className="shrink-0 text-[13px] font-semibold text-emerald-300">
                              {formatGrossMoney((splitSelection[line.id] ?? 0) * getOrderLineUnitAmount(line))}
                            </span>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
                        Henüz ürün seçilmedi
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {paymentScope === 'split' && splitMode === 'amount' ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-left shadow-sm ${activePadTarget === 'splitAmount' ? 'border-violet-400 bg-slate-900 ring-1 ring-violet-300/60' : 'border-slate-300 bg-slate-900'}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Bolunecek tutar</p>
                  <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">
                    {splitAmountInput ? formatMoney(splitAmountValue) : formatMoney(0)}
                  </p>
                  <input
                    value={splitAmountInput}
                    onFocus={() => setActivePadTarget('splitAmount')}
                    onChange={(event) => setSplitAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="Tutar gir"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">Toplamdan düşülecek tutarı yaz.</p>
                </div>
              ) : null}

              {paymentMethod === 'cash' ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-left shadow-sm ${activePadTarget === 'cash' ? 'border-emerald-500 bg-slate-900 ring-1 ring-emerald-300/60' : 'border-slate-300 bg-slate-900'}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Alinan nakit</p>
                  <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">
                    {cashReceived ? formatMoney(cashValue) : formatMoney(0)}
                  </p>
                  <input
                    value={cashReceived}
                    onFocus={() => setActivePadTarget('cash')}
                    onChange={(event) => setCashReceived(event.target.value)}
                    inputMode="decimal"
                    placeholder="Nakit gir"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400"
                  />
                  <p className="mt-1.5 text-xs font-medium text-slate-300">Para ustu: {formatMoney(changeAmount)}</p>
                </div>
              ) : paymentMethod === 'mixed' ? (
                <div className="grid gap-2.5 md:grid-cols-2">
                  <div
                    className={`rounded-2xl border px-4 py-3 text-left shadow-sm ${activePadTarget === 'cash' ? 'border-emerald-500 bg-slate-900 ring-1 ring-emerald-300/60' : 'border-slate-300 bg-slate-900'}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Nakit</p>
                    <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">
                      {cashReceived ? formatMoney(cashValue) : formatMoney(0)}
                    </p>
                    <input
                      value={cashReceived}
                      onFocus={() => setActivePadTarget('cash')}
                      onChange={(event) => setCashReceived(event.target.value)}
                      inputMode="decimal"
                      placeholder="Nakit gir"
                      className="mt-2 h-10 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-left shadow-sm ${activePadTarget === 'card' ? 'border-violet-400 bg-slate-900 ring-1 ring-violet-300/60' : 'border-slate-300 bg-slate-900'}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Kart</p>
                    <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">
                      {cardAmount ? formatMoney(cardValue) : formatMoney(0)}
                    </p>
                    <input
                      value={cardAmount}
                      onFocus={() => setActivePadTarget('card')}
                      onChange={(event) => setCardAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="Kart gir"
                      className="mt-2 h-10 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-[#111827] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-100">Kalanı cariye aktar</p>
                      <p className="mt-0.5 text-xs font-medium text-amber-300/85">
                        Kalan: {formatMoney(Math.max(paymentTargetTotal - mixedCashCardAmount, 0))}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={mixedAccountEnabled}
                      onChange={(event) => setMixedAccountEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-amber-300 bg-[#0B1220] text-amber-500"
                    />
                  </label>
                  {mixedAccountEnabled ? (
                    <div className="md:col-span-2 grid gap-2 rounded-2xl border border-amber-400/25 bg-[#111827] px-4 py-3">
                      <select
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccountId(event.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
                      >
                        {chargeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} - {account.type === 'partner' ? 'Ortak' : 'Müşteri'}
                          </option>
                        ))}
                      </select>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={quickAccountName}
                          onChange={(event) => setQuickAccountName(event.target.value)}
                          placeholder="Cari yoksa hızlı kart adı"
                          className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          onClick={createQuickCustomerAccount}
                          className="h-10 rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white"
                        >
                          Cari aç
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : paymentMethod === 'account' ? (
                <div className="rounded-2xl border border-amber-400/30 bg-[#111827] px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Cari hesap</p>
                      <p className="mt-1 text-sm font-medium text-slate-300">Adisyon tutarını müşteri ya da ortak hesabına borç olarak işle.</p>
                    </div>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-100">
                      {formatMoney(paymentTargetTotal)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2">
                      <Search className="h-4 w-4 shrink-0 text-amber-300" />
                      <input
                        value={accountSearch}
                        onChange={(event) => setAccountSearch(event.target.value)}
                        placeholder="Cari ara..."
                        className="h-8 w-full border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500"
                      />
                    </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'Tümü' },
                      { value: 'customer', label: 'Müşteri' },
                      { value: 'partner', label: 'Ortak' },
                        { value: 'recent', label: 'Son' },
                      ].map((filter) => (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() => setAccountChargeFilter(filter.value as AccountChargeFilter)}
                          className={accountChargeFilter === filter.value ? 'inline-flex h-8 items-center justify-center rounded-full bg-amber-600 px-3 text-xs font-semibold text-white' : 'inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-[#0B1220] px-3 text-xs font-semibold text-slate-200 transition hover:bg-[#172033]'}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-2 rounded-xl border border-dashed border-amber-400/30 bg-[#0B1220] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        value={quickAccountName}
                        onChange={(event) => setQuickAccountName(event.target.value)}
                        placeholder="Hızlı cari kart adı"
                        className="h-9 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={createQuickCustomerAccount}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700"
                      >
                        Cari kart aç
                      </button>
                    </div>
                    {filteredChargeAccounts.length > 0 ? filteredChargeAccounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setSelectedAccountId(account.id)}
                        className={selectedAccountId === account.id ? 'flex items-center justify-between rounded-xl border border-amber-400/45 bg-amber-500/12 px-3 py-3 text-left shadow-sm' : 'flex items-center justify-between rounded-xl border border-white/10 bg-[#0B1220] px-3 py-3 text-left transition hover:bg-[#172033]'}
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{account.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{account.type === 'partner' ? 'Ortak hesabı' : 'Müşteri carisi'} · {account.code}</p>
                        </div>
                        <span className={selectedAccountId === account.id ? 'rounded-full bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-100' : 'rounded-full bg-white/8 px-2 py-1 text-[11px] font-semibold text-slate-300'}>
                          {account.type === 'partner' ? 'Ortak' : 'Müşteri'}
                        </span>
                      </button>
                    )) : (
                      <div className="rounded-xl border border-dashed border-amber-400/30 bg-[#0B1220] px-3 py-4 text-center text-xs font-medium text-amber-200">
                        Cari bulunamadı
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-400 bg-slate-900 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                    {paymentMethod === 'meal' ? 'Yemek kartı tahsilat' : paymentMethod === 'euro' ? 'Euro tahsilat' : paymentMethod === 'dollar' ? 'Dolar tahsilat' : 'Kart tahsilat'}
                  </p>
                  {paymentMethod === 'euro' || paymentMethod === 'dollar' ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">TL karşılığı</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatMoney(paymentTargetTotal)}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0B1220] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Alınacak {paymentMethod === 'euro' ? 'Euro' : 'Dolar'}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-cyan-200">
                          {paymentMethod === 'euro'
                            ? formatForeignMoney(euroPaymentAmount, 'EUR')
                            : formatForeignMoney(dollarPaymentAmount, 'USD')}
                        </p>
                      </div>
                      <label className="sm:col-span-2 grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Kur ({paymentMethod === 'euro' ? '1 Euro' : '1 Dolar'} = TL)
                        </span>
                        <input
                          value={paymentMethod === 'euro' ? euroRateInput : dollarRateInput}
                          onChange={(event) => paymentMethod === 'euro' ? setEuroRateInput(event.target.value) : setDollarRateInput(event.target.value)}
                          inputMode="decimal"
                          className="h-10 rounded-xl border border-white/10 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-xl font-bold leading-none tracking-tight text-white">{formatMoney(paymentTargetTotal)}</p>
                      <p className="mt-1.5 text-xs text-slate-400">Tek dokunuşla ödeme hazır.</p>
                    </>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tahsil edilecek</span>
                  <span className="font-semibold text-[#0F172A]">{formatMoney(paymentTargetTotal)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-slate-500">Kalan</span>
                  <span className={`font-semibold ${remainingAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatMoney(remainingAmount)}</span>
                </div>
                {paymentMethod === 'cash' ? (
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-slate-500">Para ustu</span>
                    <span className="font-semibold text-[#0F172A]">{formatMoney(changeAmount)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        </div>

        {paymentExpanded ? (
        <div className="grid content-start gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-2.5">
            <p className="text-sm font-semibold text-[#0F172A]">Hızlı ödeme özeti</p>
            <div className="mt-2 space-y-1 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Adisyon toplami</span>
                <span className="font-semibold text-[#0F172A]">{formatMoney(settlementTotal)}</span>
              </div>
              {totalDiscountAmount > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Toplam iskonto</span>
                  <span className="font-semibold text-emerald-700">- {formatMoney(totalDiscountAmount)}</span>
                </div>
              ) : null}
              {activeReservationDeposit > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Kapora düşümü</span>
                  <span className="font-semibold text-emerald-700">- {formatMoney(activeReservationDeposit)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Net toplam</span>
                <span className="font-semibold text-[#0F172A]">{formatMoney(discountedSettlementTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ödenen toplam</span>
                <span className="font-semibold text-emerald-700">{formatMoney(authoritativePaymentState?.paidTotal ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Kalan bakiye</span>
                <span className="font-semibold text-rose-700">{formatMoney(remainingSettlementTotal)}</span>
              </div>
              {paymentScope === 'split' ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Bu islem</span>
                  <span className="font-semibold text-[#0F172A]">{formatMoney(paymentTargetTotal)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Yontem</span>
                <span className="font-semibold text-[#0F172A]">
                  {paymentMethod === 'cash' ? 'Nakit' : paymentMethod === 'card' ? 'Kart' : paymentMethod === 'mixed' ? 'Karma' : paymentMethod === 'meal' ? 'Yemek kartı' : paymentMethod === 'euro' ? 'Euro' : paymentMethod === 'dollar' ? 'Dolar' : 'Cari'}
                </span>
              </div>
              {paymentMethod === 'account' && selectedAccount ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Cari hesap</span>
                  <span className="font-semibold text-[#0F172A]">{selectedAccount.name}</span>
                </div>
              ) : null}
            </div>
          </div>

          {authoritativePaymentState?.payments.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-2.5">
              <p className="text-sm font-semibold text-[#0F172A]">Tahsilat geçmişi</p>
              <div className="mt-2 grid gap-1.5">
                {authoritativePaymentState.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-600">
                      {payment.method === 'cash' ? 'Nakit' : payment.method === 'card' ? 'Kart' : payment.method === 'account' ? 'Cari' : payment.method}
                    </span>
                    <span className="font-semibold text-[#0F172A]">{formatMoney(payment.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">İskonto</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Yüzde veya küsurat yuvarlama uygula.</p>
              </div>
              {canApplyDiscount ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  Max %{maxDiscountRate}
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  Yetki yok
                </span>
              )}
            </div>

            <div className="mt-2.5 grid gap-2.5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Yüzde iskonto
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={discountRateInput}
                    onChange={(event) => setDiscountRateInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    disabled={!canApplyDiscount}
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <span className="text-sm font-semibold text-slate-500">%</span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Tutar iskontosu
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={discountAmountInput}
                    onChange={(event) => setDiscountAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    disabled={!canApplyDiscount}
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <span className="text-sm font-semibold text-slate-500">?</span>
                </div>
              </div>

              <label className={`flex items-center justify-between rounded-xl border px-3 py-1.5 ${canUseRoundingDiscount ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-slate-100 opacity-60'}`}>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Küsurat yuvarla</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Tutarı tam sayıya indir.</p>
                </div>
                <input
                  type="checkbox"
                  checked={roundingDiscountEnabled}
                  onChange={(event) => setRoundingDiscountEnabled(event.target.checked)}
                  disabled={!canUseRoundingDiscount}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
              </label>

              {(discountReasonRequired || discountRate > 0 || fixedDiscountAmount > 0 || roundingDiscountEnabled) ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    İskonto açıklaması
                  </label>
                  <input
                    value={discountReason}
                    onChange={(event) => setDiscountReason(event.target.value)}
                    placeholder="Neden iskonto yapildi?"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none placeholder:text-slate-400"
                  />
                </div>
              ) : null}

              {(percentageDiscountAmount > 0 || fixedDiscountAmount > 0 || roundingDiscountAmount > 0) ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  {percentageDiscountAmount > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Yüzde iskonto</span>
                      <span className="font-semibold text-emerald-700">- {formatMoney(percentageDiscountAmount)}</span>
                    </div>
                  ) : null}
                  {fixedDiscountAmount > 0 ? (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-slate-600">Tutar iskontosu</span>
                      <span className="font-semibold text-emerald-700">- {formatMoney(fixedDiscountAmount)}</span>
                    </div>
                  ) : null}
                  {roundingDiscountAmount > 0 ? (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-slate-600">Yuvarlama</span>
                      <span className="font-semibold text-emerald-700">- {formatMoney(roundingDiscountAmount)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-0 z-20 -mx-3 grid gap-2.5 border-t border-white/10 bg-[#0B1220]/95 px-3 py-3 shadow-[0_-18px_36px_rgba(11,18,32,0.55)] backdrop-blur [padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)] sm:-mx-4 sm:px-4">
            <button
              type="button"
              onClick={completePayment}
              disabled={paymentSubmitting || !canCompleteSplit || !canCompleteAccount || paidAmount < paymentTargetTotal || paymentTargetTotal <= 0}
              className="inline-flex h-15 w-full items-center justify-center rounded-[1rem] bg-emerald-600 px-4 text-[17px] font-bold text-white shadow-[0_16px_30px_rgba(5,150,105,0.28)] transition duration-150 hover:-translate-y-[1px] hover:bg-emerald-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paymentSubmitting ? 'Tahsilat işleniyor...' : paymentSubmitLabel}
            </button>
            <button
              type="button"
              onClick={() => setPaymentOpen(false)}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-50 active:scale-[0.97]"
            >
              Vazgec
            </button>
          </div>
        </div>
        ) : (
          <div className="sticky bottom-0 z-20 -mx-3 grid content-start gap-2 border-t border-white/10 bg-[#0B1220]/95 px-3 py-3 shadow-[0_-18px_36px_rgba(11,18,32,0.55)] backdrop-blur [padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)] sm:-mx-4 sm:px-4">
            <button
              type="button"
              onClick={completePayment}
              disabled={paymentSubmitting || !canCompleteSplit || !canCompleteAccount || paidAmount < paymentTargetTotal || paymentTargetTotal <= 0}
              className="inline-flex h-15 w-full items-center justify-center rounded-[1rem] bg-emerald-600 px-4 text-[17px] font-bold text-white shadow-[0_16px_30px_rgba(5,150,105,0.28)] transition duration-150 hover:-translate-y-[1px] hover:bg-emerald-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paymentSubmitting ? 'Tahsilat işleniyor...' : paymentSubmitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
    <div className="dark-pos grid min-h-0 w-full gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:h-[calc(100vh-2rem)] xl:min-h-[720px]">
      <section className={`app-panel pos-products-panel flex min-h-0 flex-col overflow-hidden rounded-[1.4rem] ${paymentOpen ? 'h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)] sm:h-auto sm:max-h-none' : ''}`}>
        {paymentOpen ? paymentPanel : (
        <>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="relative">
            {posMappingWarning ? (
              <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
                {posMappingWarning}
              </div>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="product-search" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Hızlı ürün arama
                </label>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  id="product-search"
                  ref={productSearchRef}
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Ürün ara... en az 3 harf yaz"
                  className="h-8 w-full border-0 bg-transparent px-0 text-sm font-medium text-[#0F172A] outline-none placeholder:text-slate-400"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Tüm kategorilerde arar. Ürüne dokununca adisyona eklenir.</p>
            </div>

            {searchSuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
                {searchSuggestions.map((product) => (
                  <button
                    key={`search-${product.id}`}
                    type="button"
                    onClick={() => addProductToOrder(product, 'search')}
                    aria-disabled={!currentTable || !hasPermission('orders.create')}
                    data-pos-key={product.posKey ?? product.id}
                    data-catalog-revision={product.catalogRevision ?? ''}
                    data-snapshot-status={getProductSnapshotStatus(product)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0 ${!currentTable || !hasPermission('orders.create') ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0F172A]">{normalizeProductName(product.name)}</p>
                      <p className="mt-1 text-xs text-slate-500">{sourceCategories.find((category) => category.id === product.category)?.label ?? 'Ürün'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-[#2563EB]">{formatGrossMoney(product.price)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
            <aside className="rounded-[1rem] border border-slate-200 bg-white p-3 shadow-sm lg:min-h-0 lg:overflow-auto">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Kategoriler</p>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{sourceCategories.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {sourceCategories.map((category) => {
                  const active = selectedCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={active ? 'app-button-primary min-h-[42px] justify-start px-3 py-2 text-sm lg:w-full' : 'app-button-secondary min-h-[42px] justify-start px-3 py-2 text-sm lg:w-full'}
                    >
                      {category.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEventPricingEnabled((current) => !current)}
                  className={eventPricingEnabled ? 'app-button-primary min-h-[42px] w-full justify-start px-3 py-2 text-sm' : 'app-button-secondary min-h-[42px] w-full justify-start px-3 py-2 text-sm'}
                >
                  Event fiyat modu
                </button>
              </div>
            </aside>

            <div className="min-h-0 overflow-auto">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredProducts.map((product) => {
                  const activeFlash = lastAddedId === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProductToOrder(product, 'product-grid')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          addProductToOrder(product, 'product-grid');
                        }
                      }}
                      aria-disabled={!currentTable || !hasPermission('orders.create')}
                      data-pos-key={product.posKey ?? product.id}
                      data-catalog-revision={product.catalogRevision ?? ''}
                      data-snapshot-status={getProductSnapshotStatus(product)}
                      className={`${activeFlash ? 'border-[#60A5FA] bg-[#EFF6FF] shadow-[0_1px_2px_rgba(37,99,235,0.08),0_12px_22px_rgba(37,99,235,0.12)] pos-pop-in' : 'border-slate-200 bg-white hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_20px_rgba(15,23,42,0.08)] active:scale-[0.97]'} app-card app-card-interactive pos-product-tile flex min-h-[122px] flex-col justify-between rounded-[0.95rem] border p-3 text-left transition duration-150 ${!currentTable || !hasPermission('orders.create') ? 'cursor-not-allowed opacity-60' : ''}`}
                      aria-label={`${normalizeProductName(product.name)} ekle`}
                    >
                      <div className="space-y-1">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] shadow-sm">
                          <Plus className="h-3.5 w-3.5" />
                        </span>
                        <p className="line-clamp-2 font-semibold tracking-tight text-[#0F172A] text-[0.88rem]">
                          {normalizeProductName(product.name)}
                        </p>
                      </div>

                      <div className="pt-1">
                        <p className="font-semibold tracking-tight text-[#2563EB] text-[1rem]">
                          {formatGrossMoney(product.price)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </section>

      <aside className="app-panel pos-order-panel pos-order-shell flex min-h-0 flex-col overflow-visible rounded-[1.4rem] border-[#BFDBFE] bg-gradient-to-b from-white to-[#F8FBFF] xl:overflow-hidden shadow-[0_1px_2px_rgba(37,99,235,0.06),0_18px_40px_rgba(37,99,235,0.12)]">
        <div className="pos-order-top pos-sticky-total-bar border-b border-slate-200 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Masa</p>
              <h2 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-[#0F172A]">
                {currentTable ? currentTable.name : 'Masa seçin'}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-medium text-slate-500">{currentTable?.group ?? 'Masa grubu'}</span>
                <span className="text-slate-300">·</span>
                <span className="font-medium text-slate-500">{currentTable?.guests ?? 0} misafir</span>
                {currentTable?.paymentRequested ? (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-amber-600">Ödeme bekleniyor</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentOpen(false);
                  setProductCardProduct(null);
                  setTableActionsOpen(false);
                  logOrderFlow('leave-order-screen', {
                    selectedTableId,
                    activeOrderId: currentTable?.id ?? null,
                    lineCount: lines.length,
                  });
                  router.push('/floor');
                }}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Masalara dön
              </button>
              <button
                type="button"
                onClick={() => setTableActionsOpen((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/75 px-3 text-[13px] font-semibold text-white shadow-sm transition hover:border-slate-500 hover:bg-slate-800"
              >
                İşlemler {tableActionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <div className="pos-sticky-total shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2563EB]">Toplam</p>
                <strong className="block text-[24px] font-bold leading-none tracking-tight text-[#0F172A] drop-shadow-[0_0_12px_rgba(59,130,246,0.18)]">
                  {formatMoney(paymentOpen ? discountedSettlementTotal : total)}
                </strong>
              </div>
            </div>
          </div>
          {!isOnline ? (
            <div className="mt-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              İnternet yok. Sipariş ve yazdırma kuyrukta tutulur, bağlantı gelince eşitlenir.
            </div>
          ) : null}
        </div>
        <div className="pos-order-middle min-h-0 flex-1 overflow-visible px-4 py-3 xl:overflow-auto">
          {tableActionsOpen && currentTable ? (
            <div className="pos-table-actions-panel mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setTableActionSection((current) => current === 'guest' ? 'note' : 'guest')}
                    className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold tracking-tight text-[#0F172A]">Misafir sayısı</span>
                    {tableActionSection === 'guest' ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {tableActionSection === 'guest' ? (
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="grid gap-2">
                        <input
                          value={guestCountInput}
                          onChange={(event) => setGuestCountInput(event.target.value)}
                          inputMode="numeric"
                          placeholder="Misafir sayisi"
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={saveGuestCount} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-900 px-4 text-sm font-semibold text-white">
                          Misafiri kaydet
                        </button>
                        <button type="button" onClick={clearTableMeta} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                          Temizle
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setTableActionSection((current) => current === 'note' ? 'merge' : 'note')}
                    className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold tracking-tight text-[#0F172A]">Masa notu</span>
                    {tableActionSection === 'note' ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {tableActionSection === 'note' ? (
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="grid gap-2">
                        <textarea
                          value={tableNoteInput}
                          onChange={(event) => setTableNoteInput(event.target.value)}
                          placeholder="Masa notu"
                          className="min-h-[88px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F172A] outline-none"
                        />
                        <button type="button" onClick={saveTableNote} className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                          Masa bilgisini kaydet
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setTableActionSection((current) => current === 'merge' ? 'move' : 'merge')}
                    className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold tracking-tight text-[#0F172A]">Masa birleştir</span>
                    {tableActionSection === 'merge' ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {tableActionSection === 'merge' ? (
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="grid gap-2">
                        <select
                          value={mergeTargetId}
                          onChange={(event) => setMergeTargetId(event.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-white outline-none"
                        >
                          <option value="">Hedef masa seç</option>
                          {mergeTargets.map((table) => (
                            <option key={table.id} value={table.id}>{table.name}</option>
                          ))}
                        </select>
                        <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/50 p-2">
                          {(ordersByTable[currentTable.id] ?? []).length > 0 ? (
                            (ordersByTable[currentTable.id] ?? []).map((line) => (
                              <label key={`merge-line-${line.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-white">{line.name}</p>
                                  <p className="mt-0.5 text-xs text-slate-300">{line.qty} adet · {formatMoney(getOrderLineUnitAmount(line) * line.qty)}</p>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={mergeSelection[line.id] ?? true}
                                  onChange={(event) =>
                                    setMergeSelection((current) => ({
                                      ...current,
                                      [line.id]: event.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-blue-500"
                                />
                              </label>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-300">
                              Bu masada taşınacak ürün yok
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={mergeCurrentTable} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
                          Birlestir
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setTableActionSection((current) => current === 'move' ? 'guest' : 'move')}
                    className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold tracking-tight text-[#0F172A]">Masa taşı</span>
                    {tableActionSection === 'move' ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>
                  {tableActionSection === 'move' ? (
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="grid gap-2">
                        <select
                          value={moveTargetId}
                          onChange={(event) => setMoveTargetId(event.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-white outline-none"
                        >
                          <option value="">Boş masa seç</option>
                          {moveTargets.map((table) => (
                            <option key={table.id} value={table.id}>{table.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={moveCurrentTable} className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                          Tasi
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {currentTable.mergedFromIds?.length ? (
                  <div className="flex justify-start">
                    <button type="button" onClick={splitMergedTable} className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800">
                      Birlesimi ayir
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Adisyon</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-[#0F172A]">{'Masadaki ürünler'}</h3>
            </div>
            <div className="flex items-center gap-2">
              {unsentItemCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Yeni {unsentItemCount}
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{lines.length} kalem</span>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="app-panel-soft rounded-2xl p-6 text-center">
              <p className="text-base font-semibold text-[#0F172A]">{'Henüz ürün eklenmedi'}</p>
              <p className="mt-2 text-sm text-slate-500">{'Soldaki ürün kutucuklarına dokunarak siparişi hemen başlatın.'}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220]">
              {lines.map((item) => {
                const isFresh = lastMutatedLineId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-b border-white/10 px-2 py-1 transition-all duration-150 last:border-b-0 ${isFresh ? 'pos-pop-in bg-sky-500/12 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.18)]' : 'bg-[#111827]'}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[12px] font-medium leading-none tracking-normal text-slate-100">{item.name}</p>
                        {paymentOpen && paymentScope === 'split' ? (
                          <span className="text-[8px] font-semibold leading-none text-sky-700">
                            Secim {splitSelection[item.id] ?? 0}/{item.qty}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {paymentOpen && paymentScope === 'split' && splitMode === 'person' ? (
                      <div className="inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-0.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => changeSplitQuantity(item.id, -1)}
                          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-[6px] border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.96]"
                        >
                          <Minus className="h-2 w-2" />
                        </button>
                        <span className="min-w-5 text-center text-[10px] font-bold leading-none text-emerald-800">{splitSelection[item.id] ?? 0}</span>
                        <button
                          type="button"
                          onClick={() => changeSplitQuantity(item.id, 1)}
                          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-[6px] bg-emerald-600 text-white transition hover:bg-emerald-700 active:scale-[0.96]"
                        >
                          <Plus className="h-2 w-2" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#0B1220] px-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => changeLineQuantity(item.id, -1)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] border border-white/10 bg-[#111827] text-slate-200 transition hover:bg-[#172033] active:scale-[0.96]"
                        >
                          <Minus className="h-2 w-2" />
                        </button>
                        <span className="min-w-4 text-center text-[11px] font-semibold leading-none text-slate-100">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => changeLineQuantity(item.id, 1)}
                          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-[6px] bg-[#2563EB] text-white transition hover:bg-[#1D4ED8] active:scale-[0.96]"
                        >
                          <Plus className="h-2 w-2" />
                        </button>
                      </div>
                    )}

                    <div className="min-w-[4.3rem] text-right">
                      <span className="block text-[11px] font-semibold leading-none text-slate-100">
                        {paymentOpen && paymentScope === 'split' && splitMode === 'person' && (splitSelection[item.id] ?? 0) > 0
                          ? formatGrossMoney((splitSelection[item.id] ?? 0) * getOrderLineUnitAmount(item))
                          : formatGrossMoney(getOrderLineSubtotal(item))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pos-order-bottom min-h-0 overflow-visible border-t border-slate-200 px-4 py-3 xl:overflow-y-auto">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={startPayment}
              disabled={!canTakePayment}
              className="pos-payment-cta inline-flex h-13 w-full items-center justify-center gap-2 rounded-[0.95rem] bg-gradient-to-r from-[#059669] via-[#10B981] to-[#34D399] text-[15px] font-bold text-white shadow-[0_1px_2px_rgba(5,150,105,0.16),0_14px_30px_rgba(5,150,105,0.24)] transition duration-150 hover:-translate-y-[1px] hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-5 w-5" /> {paymentOpen ? 'Tahsilatı kapat' : 'Ödeme al'}
            </button>

            <button
              type="button"
              onClick={sendOrder}
              disabled={!canSendOrder}
              className="pos-primary-cta h-12 text-[14px] shadow-[0_1px_2px_rgba(37,99,235,0.16),0_14px_28px_rgba(37,99,235,0.22)] w-full rounded-[0.95rem] bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#60A5FA] font-semibold text-white transition duration-150 hover:-translate-y-[1px] hover:brightness-105 hover:shadow-[0_1px_2px_rgba(37,99,235,0.2),0_18px_34px_rgba(37,99,235,0.28)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Send className="h-4.5 w-4.5" /> {unsentItemCount > 0 ? `Kaydet ve yazdır (${unsentItemCount})` : 'Kaydet ve yazdır'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!canSendCheck) {
                  console.error('[business-flow] check print click blocked', {
                    currentTableId: currentTable?.id,
                    lineCount: lines.length,
                    hasEditPermission: hasPermission('orders.edit'),
                  });
                  setFeedbackMessage(!currentTable ? 'Once masa secin.' : lines.length === 0 ? 'Yazdirilacak adisyon yok.' : 'Adisyon yazdirma yetkiniz yok.');
                  return;
                }
                void sendCheckToTable();
              }}
              aria-disabled={!canSendCheck}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[14px] font-semibold transition duration-150 active:scale-[0.97] ${
                canSendCheck
                  ? 'border border-fuchsia-400/70 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-500 text-white shadow-[0_1px_2px_rgba(217,70,239,0.18),0_14px_28px_rgba(244,63,94,0.22)] hover:-translate-y-[1px] hover:brightness-105'
                  : 'cursor-not-allowed border border-slate-500 bg-[#334155] text-white shadow-none'
              }`}
            >
              <Send className="h-4.5 w-4.5" /> {'Hesap adisyonu gönder'}
            </button>
          </div>

        </div>
      </aside>
    </div>
    {showPosDiagnostics ? (
      <div className="fixed bottom-3 left-3 z-[90] max-w-sm rounded-2xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-[11px] font-mono text-slate-100 shadow-2xl backdrop-blur">
        <p>POS diagnostics</p>
        <p>selectedTableId: {selectedTableId || '-'}</p>
        <p>activeOrderId: {currentTable?.id ?? '-'}</p>
        <p>lineCount: {lines.length}</p>
        <p>isOnline: {String(isOnline)}</p>
        <p>paymentOpen: {String(paymentOpen)}</p>
        <p>tableActionsOpen: {String(tableActionsOpen)}</p>
        <p>pendingMutation: {mutationGuard ? `${mutationGuard.source}:${Date.now() - mutationGuard.at}ms` : '-'}</p>
        <p>catalogItems: {sourceProducts.length}</p>
        <p>catalogRevision: {sourceProducts[0]?.catalogRevision ?? '-'}</p>
        <p>runtimeReady: {String(sourceProducts.every((product) => product.posKey && product.catalogRevision && product.productSnapshot))}</p>
        <p>lastClick: {posClickDebug ? `${posClickDebug.source}:${posClickDebug.event}` : '-'}</p>
        {posClickDebug ? (
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900/80 p-2 text-[10px] leading-snug">
            {JSON.stringify({
              posKey: posClickDebug.posKey,
              revision: posClickDebug.payload?.product && typeof posClickDebug.payload.product === 'object' ? (posClickDebug.payload.product as Record<string, unknown>).revision : undefined,
              catalogRevision: posClickDebug.catalogRevision,
              productSnapshotStatus: posClickDebug.productSnapshotStatus,
              mutationId: posClickDebug.mutationId,
              reason: posClickDebug.reason,
              payload: posClickDebug.payload,
              result: posClickDebug.result,
            }, null, 2)}
          </pre>
        ) : null}
      </div>
    ) : null}
    {productCardProduct ? (
      <div className="fixed inset-0 z-[130] flex items-start justify-center bg-slate-950/60 px-4 py-4 backdrop-blur-sm sm:items-center sm:py-6">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.3)]">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ürün kartı</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">{productCardProduct.name}</h3>
              <p className="mt-1 text-sm text-slate-500">Adet, not, kişi ve servis kurallarını siparişe eklemeden önce netleştirin.</p>
            </div>
            <button
              type="button"
              onClick={closeProductCard}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5">
          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Uygulanan birim fiyat</p>
              <p className="mt-1 text-lg font-bold tracking-tight text-[#0F172A]">{formatGrossMoney(productCardResolvedUnitPrice)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Anlık Ürün toplamı</p>
              <p className="mt-1 text-lg font-bold tracking-tight text-[#0F172A]">{formatGrossMoney(productCardTotalPreview)}</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sipariş bilgisi</p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Adet</label>
                <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setProductCardQuantity(String(Math.max((Number(productCardQuantity) || 1) - 1, 1)))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    value={productCardQuantity}
                    onChange={(event) => setProductCardQuantity(event.target.value)}
                    inputMode="numeric"
                    className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm font-semibold text-[#0F172A] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setProductCardQuantity(String(Math.max((Number(productCardQuantity) || 1) + 1, 1)))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Kişi adı</label>
                <input
                  value={productCardGuestName}
                  onChange={(event) => setProductCardGuestName(event.target.value)}
                  placeholder="Örn: Ali"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none"
                />
                {guestLabels.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {guestLabels.map((guestName) => (
                      <button
                        key={`card-guest-${guestName}`}
                        type="button"
                        onClick={() => setProductCardGuestName(guestName)}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700"
                      >
                        {guestName}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ürün notu</label>
                <textarea
                  value={productCardNote}
                  onChange={(event) => setProductCardNote(event.target.value)}
                  placeholder={productCardOptionMode === 'drink' ? 'Örn: buzsuz, az şeker, yulaf sütü' : productCardOptionMode === 'dessert' ? 'Örn: sos ayrı, çileksiz' : 'Örn: soğansız, az pişmiş, sos ayrı'}
                  className="min-h-[80px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-[#0F172A] outline-none sm:min-h-[96px]"
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {productCardOptionMode === 'drink' ? 'İçecek seçenekleri' : productCardOptionMode === 'dessert' ? 'Tatlı seçenekleri' : 'Yiyecek seçenekleri'}
              </p>
              {productCardOptionMode === 'food' ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Lezzet tercihi</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'standart', label: 'Standart' },
                        { value: 'acili', label: 'Acılı' },
                        { value: 'acisiz', label: 'Acısız' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setProductCardSpicePreference(option.value as 'acili' | 'acisiz' | 'standart')}
                          className={productCardSpicePreference === option.value ? 'inline-flex h-11 items-center justify-center rounded-2xl bg-amber-500 px-3 text-sm font-semibold text-white' : 'inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700'}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pişirme derecesi</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'standart', label: 'Standart' },
                        { value: 'az', label: 'Az pişmiş' },
                        { value: 'orta', label: 'Orta' },
                        { value: 'iyi', label: 'İyi pişmiş' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setProductCardCookingPreference(option.value as 'standart' | 'az' | 'orta' | 'iyi')}
                          className={productCardCookingPreference === option.value ? 'inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-3 text-sm font-semibold text-white' : 'inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700'}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : productCardOptionMode === 'drink' ? (
                <div className="grid gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Servis tercihi</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Buzlu', 'Buzsuz', 'Az buz', 'Soğuk', 'Sıcak', 'Ilık'].map((option) => (
                        <button key={option} type="button" onClick={() => appendProductCardNote(option)} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50">
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Şeker / süt</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Şekersiz', 'Az şeker', 'Şekerli', 'Yulaf sütü', 'Laktozsuz', 'Ekstra shot'].map((option) => (
                        <button key={option} type="button" onClick={() => appendProductCardNote(option)} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50">
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tatlı tercihi</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Sos ayrı', 'Sossuz', 'Çileksiz', 'Fındıksız', 'Isıtılsın', 'Soğuk servis'].map((option) => (
                      <button key={option} type="button" onClick={() => appendProductCardNote(option)} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-pink-300 hover:bg-pink-50">
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ekstra istek</label>
                <input
                  value={productCardExtrasNote}
                  onChange={(event) => setProductCardExtrasNote(event.target.value)}
                  placeholder={productCardOptionMode === 'drink' ? 'Örn: yulaf sütü, ekstra shot, limonlu' : productCardOptionMode === 'dessert' ? 'Örn: sos ayrı, dondurma ekle' : 'Örn: ekstra kaşar, ekstra sos'}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Çıkarılacak içerik</label>
                <input
                  value={productCardRemovalNote}
                  onChange={(event) => setProductCardRemovalNote(event.target.value)}
                  placeholder={productCardOptionMode === 'drink' ? 'Örn: buz yok, pipet yok, limon yok' : productCardOptionMode === 'dessert' ? 'Örn: çilek yok, fındık yok' : 'Örn: soğan yok, turşu yok'}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none"
                />
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">İkram</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {productCardProduct.allowComplimentary === false ? 'Bu ürün için ikram kapalı.' : 'Bu ürün ücretlendirilmesin.'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={productCardComplimentary}
                  onChange={(event) => setProductCardComplimentary(event.target.checked)}
                  disabled={productCardProduct.allowComplimentary === false}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
              </label>

              {productCardComplimentary ? (
                <input
                  value={productCardComplimentaryReason}
                  onChange={(event) => setProductCardComplimentaryReason(event.target.value)}
                  placeholder="İkram açıklaması"
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] outline-none"
                />
              ) : null}

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">İade</p>
                  <p className="mt-0.5 text-xs text-slate-500">Ürünü eksi tutarla siparişe ekle.</p>
                </div>
                <input
                  type="checkbox"
                  checked={productCardIsReturn}
                  onChange={(event) => setProductCardIsReturn(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600"
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ürün toplamı</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A]">
                  {formatGrossMoney(productCardTotalPreview)}
                </p>
              </div>

              <button
                type="button"
                onClick={addProduct}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#2563EB] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)]"
              >
                Siparişi adisyona ekle
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
