'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightLeft, BarChart3, Clock3, GitMerge, NotebookPen, Receipt, ShieldCheck, TrendingUp, UsersRound, Wallet, X } from 'lucide-react';
import { TableFilters, type StatusFilter } from '@/components/floor/table-filters';
import { TableSetupPanel } from '@/components/floor/table-setup-panel';
import { TablesGrid } from '@/components/floor/tables-grid';
import type { FloorTableStatus } from '@/components/floor/table-card';
import {
  getPaymentRequestedTableIds,
  getStoredOrdersByTable,
  getStoredTableMeta,
  getTableLiveTotals,
  replaceStoredTableMeta,
  replaceTableLiveTotals,
  setTableLiveTotals,
  setTablePaymentRequested,
  subscribeToPaymentRequestedChanges,
  type StoredTableMeta,
} from '@/lib/table-payment-state';
import {
  getAuthoritativeOrdersDiagnostics,
  refreshAuthoritativeOrdersByTable,
  replaceAuthoritativeOrdersByTable,
  subscribeToAuthoritativeOrders,
  type AuthoritativeOrdersDiagnostics,
} from '@/lib/client/authoritative-table-orders';
import { getDefaultSessionState, loadSessionState, subscribeToSessionChanges } from '@/lib/session-store';
import {
  getDefaultTableLayoutState,
  loadTableLayoutState,
  refreshTableLayoutState,
  saveTableLayoutState,
  subscribeToTableLayoutChanges,
  type StoredFloorTable,
} from '@/lib/table-layout-store';
import {
  buildStoredTableReservation,
  loadStoredTableReservations,
  removeStoredTableReservation,
  saveStoredTableReservations,
  subscribeToStoredTableReservations,
  upsertStoredTableReservation,
  type StoredTableReservation,
} from '@/lib/table-reservation-store';
import {
  appendStoredTreasuryMovements,
  removeStoredTreasuryMovementIds,
} from '@/lib/treasury-runtime-store';
import {
  createAuthoritativeFinanceAccountMovement,
  removeStoredFinanceAccountTransactionIds,
} from '@/lib/finance-runtime-store';
import { appendStoredAccount, loadStoredAccounts, subscribeToStoredAccountChanges } from '@/lib/account-store';
import { erpAccounts, type Account, type TreasuryMovement } from '@/lib/erp-engine';
import { useSeedBusinessDataEnabled } from '@/lib/tenant-clean-start';
import { getDefaultDeliveryState, loadDeliveryState, subscribeToDeliveryChanges } from '@/lib/delivery-store';
import { loadPaymentJournal, subscribeToPaymentJournalChanges, type PaymentJournalEntry } from '@/lib/payment-journal-store';
import {
  appendDailyCashMovement,
  loadDailyCashMovements,
  subscribeToDailyCashMovementChanges,
  type StoredDailyCashMovement,
} from '@/lib/daily-cash-store';

type TableRecord = StoredFloorTable;
type OrderLine = {
  id: string;
  name: string;
  qty: number;
  note: string;
  price: number;
  category?: string;
  sentQty?: number;
  complimentary?: boolean;
  isReturn?: boolean;
};

type LocalTableRecord = TableRecord & {
  reservationName?: string;
  reservationPhone?: string;
  reservationStatus?: 'arrived' | 'no_show' | 'waiting';
  reservationTime?: string;
  reservationDate?: string;
  reservationEvent?: string;
  reservationDeposit?: number;
  note?: string;
  openedAt?: string;
  lastActionAt?: string;
  mergedFromIds?: string[];
  mergedSnapshot?: StoredTableMeta['mergedSnapshot'];
};
type FloorTab = 'overview' | 'reservation' | 'setup' | 'report';
type ActionMode = null | { type: 'move' | 'merge'; sourceId: string };
type MergeSelectionPanel = {
  sourceId: string;
  targetId: string;
  selected: Record<string, boolean>;
} | null;
type NoteDraft = {
  guests: string;
  reservationName: string;
  reservationPhone: string;
  reservationStatus: 'arrived' | 'no_show' | 'waiting';
  reservationTime: string;
  note: string;
};
type ReservationDraft = {
  reservationId: string;
  tableId: string;
  guestName: string;
  phone: string;
  date: string;
  time: string;
  event: string;
  deposit: string;
  depositMethod: 'cash' | 'bank' | 'pos' | 'account';
  depositAccountId: string;
  guestCount: string;
  status: 'arrived' | 'no_show' | 'waiting';
};

const FIXED_GROUPS = ['Salon', 'Teras', 'Bahce', 'VIP', 'Bar'] as const;
function normalizeGroupName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function cleanTableName(name: string) {
  return name
    .replace(/^Merkez\s+/i, '')
    .replace(/^Kadikoy\s+/i, '')
    .replace(/^Izmir\s+/i, '')
    .trim();
}

function getGroupOrder(group: string) {
  const normalized = normalizeGroupName(group);
  const index = FIXED_GROUPS.findIndex((item) => item === normalized);
  return index === -1 ? FIXED_GROUPS.length : index;
}

function getTableNumber(name: string) {
  const match = name.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortTables<T extends { group: string; name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const groupCompare = getGroupOrder(a.group) - getGroupOrder(b.group);
    if (groupCompare !== 0) return groupCompare;

    const numberCompare = getTableNumber(a.name) - getTableNumber(b.name);
    if (numberCompare !== 0) return numberCompare;

    return a.name.localeCompare(b.name, 'tr');
  });
}

function groupPrefix(group: string) {
  const upper = group.toLocaleUpperCase('tr-TR');
  if (upper.includes('SALON')) return 'S';
  if (upper.includes('TERAS')) return 'T';
  if (upper.includes('BAHCE')) return 'B';
  if (upper.includes('VIP')) return 'V';
  if (upper.includes('BAR')) return 'R';
  return upper.slice(0, 1) || 'M';
}

function getSeededTableGrossTotal(table: TableRecord) {
  return table.total;
}

function reservationMatchesDate(table: LocalTableRecord, date: string) {
  if (!table.reservationName && table.status !== 'reserved') return false;
  return (table.reservationDate ?? todayDateInput()) === date;
}

function mapStatus(table: LocalTableRecord & { paymentRequested: boolean; total: number }, date = todayDateInput()): FloorTableStatus {
  if (reservationMatchesDate(table, date)) return 'reserved';
  if (table.paymentRequested) return 'payment';
  if (table.total > 0) return 'occupied';
  return 'available';
}

function getOrderGross(lines: OrderLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return Number(subtotal.toFixed(2));
}

function getAuthoritativeOrderGross(lines: OrderLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + (line.complimentary ? 0 : line.qty * line.price * (line.isReturn ? -1 : 1)), 0);
  return Number(subtotal.toFixed(2));
}

function buildLiveTotalsForKnownTables(knownTables: Pick<LocalTableRecord, 'id'>[], serverOrders: Record<string, OrderLine[]>) {
  const allKnownTableIds = [...new Set([
    ...knownTables.map((table) => table.id),
    ...Object.keys(serverOrders),
  ])];

  return Object.fromEntries(
    allKnownTableIds.map((tableId) => [
      tableId,
      getAuthoritativeOrderGross(serverOrders[tableId] ?? []),
    ]),
  );
}

function formatTRY(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToInputDate(value: string, days: number) {
  const base = new Date(`${value}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return todayDateInput();
  }
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function compareReservationTimes(a?: string, b?: string) {
  return (a ?? '').localeCompare(b ?? '', 'tr');
}

function getDepositMovementId(reservationId: string) {
  return `reservation-deposit-${reservationId}`;
}

function getDepositAccountTransactionId(reservationId: string) {
  return `reservation-deposit-account-${reservationId}`;
}

function formatReservationTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function logFloorFlow(event: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  console.info(`[masa-flow] ${event}`, payload);
}

const FLOOR_SYNC_PATCH_ID = 'floor-sync-bind-open-orders-v3';

function minutesSince(iso?: string, fallback = 0) {
  if (!iso) return fallback;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return Number.isFinite(diff) && diff >= 0 ? diff : fallback;
}

function fallbackOpenedMinutes(name: string, status: FloorTableStatus) {
  const base = getTableNumber(name) || 1;
  if (status === 'payment') return 55 + (base % 4) * 12;
  if (status === 'occupied') return 18 + (base % 5) * 9;
  if (status === 'reserved') return 12 + (base % 4) * 7;
  return 0;
}

function fallbackLastActionMinutes(name: string, status: FloorTableStatus) {
  const base = getTableNumber(name) || 1;
  if (status === 'payment') return 1 + (base % 3);
  if (status === 'occupied') return 3 + (base % 6);
  if (status === 'reserved') return 5 + (base % 5);
  return 0;
}

function fallbackTableFromOrder(tableId: string, activeBranchId: string, lines: OrderLine[]): LocalTableRecord {
  const displayName = cleanTableName(tableId).replace(/^[A-Z]+-/, 'Masa ');
  return {
    id: tableId,
    branchId: activeBranchId === 'all' ? 'mrk' : activeBranchId,
    name: displayName || tableId,
    group: deriveGroupFromTableId(tableId),
    status: 'occupied',
    guests: 0,
    total: getOrderGross(lines),
    paymentRequested: false,
    openedAt: new Date().toISOString(),
    lastActionAt: new Date().toISOString(),
  };
}

function mergeTableRowsWithAuthoritativeOrders(
  rows: LocalTableRecord[],
  activeBranchId: string,
  ordersByTable: Record<string, OrderLine[]>,
) {
  const existingIds = new Set(rows.map((table) => table.id));
  const recoveredTables = Object.entries(ordersByTable)
    .filter(([tableId, lines]) => !existingIds.has(tableId) && lines.length > 0)
    .map(([tableId, lines]) => fallbackTableFromOrder(tableId, activeBranchId, lines));

  return recoveredTables.length > 0 ? [...rows, ...recoveredTables] : rows;
}

function deriveGroupFromTableId(tableId: string) {
  const normalized = tableId.toLocaleUpperCase('tr-TR');
  if (normalized.includes('TERAS') || normalized.startsWith('T-')) return 'Teras';
  if (normalized.includes('BAHCE') || normalized.startsWith('B-')) return 'Bahce';
  if (normalized.includes('VIP') || normalized.startsWith('V-')) return 'VIP';
  if (normalized.includes('BAR') || normalized.startsWith('R-')) return 'Bar';
  return 'Salon';
}

export function FloorWorkspace() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState(() => getDefaultSessionState());
  const [tableLayoutState, setTableLayoutState] = useState(() => getDefaultTableLayoutState());
  const activeBranchId = sessionState.activeBranchId;
  const initialTables = useMemo(
    () =>
      tableLayoutState.tables
        .filter((table) => (activeBranchId === 'all' ? true : table.branchId === activeBranchId))
        .map((table) => ({
          ...table,
          name: cleanTableName(table.name),
          total: getSeededTableGrossTotal(table),
        })),
    [activeBranchId, tableLayoutState.tables],
  );

  const [tableRows, setTableRows] = useState<LocalTableRecord[]>(initialTables);
  const [selectedGroup, setSelectedGroup] = useState<(typeof FIXED_GROUPS)[number]>('Salon');
  const [startNo, setStartNo] = useState('1');
  const [endNo, setEndNo] = useState('10');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [paymentRequestedIds, setPaymentRequestedIds] = useState<string[]>([]);
  const [liveTotals, setLiveTotals] = useState<Record<string, number>>({});
  const [ordersByTable, setOrdersByTable] = useState<Record<string, OrderLine[]>>({});
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [mergeSelectionPanel, setMergeSelectionPanel] = useState<MergeSelectionPanel>(null);
  const [noteTableId, setNoteTableId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>({
    guests: '0',
    reservationName: '',
    reservationPhone: '',
    reservationStatus: 'waiting',
    reservationTime: '',
    note: '',
  });
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>({
    reservationId: '',
    tableId: '',
    guestName: '',
    phone: '',
    date: todayDateInput(),
    time: '',
    event: '',
    deposit: '',
    depositMethod: 'cash',
    depositAccountId: '',
    guestCount: '2',
    status: 'waiting',
  });
  const [storedReservations, setStoredReservations] = useState<StoredTableReservation[]>([]);
  const [storedAccounts, setStoredAccounts] = useState<Account[]>([]);
  const [paymentJournal, setPaymentJournal] = useState<PaymentJournalEntry[]>([]);
  const [deliveryState, setDeliveryState] = useState(() => getDefaultDeliveryState());
  const [reservationDateFilter, setReservationDateFilter] = useState(todayDateInput());
  const [reportMethodFilter, setReportMethodFilter] = useState<'all' | 'cash' | 'card' | 'account' | 'meal' | 'euro' | 'dollar' | 'delivery' | 'manual'>('all');
  const [actionMessage, setActionMessage] = useState('Hazır');
  const [orderSyncDiagnostics, setOrderSyncDiagnostics] = useState<AuthoritativeOrdersDiagnostics | null>(null);
  const [dailyAdvanceInput, setDailyAdvanceInput] = useState('');
  const [dailyExpenseInput, setDailyExpenseInput] = useState('');
  const [dailyExpenseNote, setDailyExpenseNote] = useState('');
  const [dailyCashMovements, setDailyCashMovements] = useState<StoredDailyCashMovement[]>([]);
  const [reportAccountMode, setReportAccountMode] = useState<'collection' | 'payment'>('collection');
  const [reportAccountSearch, setReportAccountSearch] = useState('');
  const [reportAccountId, setReportAccountId] = useState('');
  const [reportAccountAmount, setReportAccountAmount] = useState('');
  const [reportAccountMethod, setReportAccountMethod] = useState<'cash' | 'card' | 'bank'>('cash');
  const [reportAccountNote, setReportAccountNote] = useState('');
  const [showQuickAccountForm, setShowQuickAccountForm] = useState(false);
  const [quickAccountName, setQuickAccountName] = useState('');
  const [quickAccountPhone, setQuickAccountPhone] = useState('');
  const [quickAccountType, setQuickAccountType] = useState<'customer' | 'supplier' | 'partner' | 'staff'>('customer');
  const includeSeedData = useSeedBusinessDataEnabled();
  const seedAccounts = useMemo(() => includeSeedData ? erpAccounts : [], [includeSeedData]);

  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  const activeTab: FloorTab = currentTab === 'reservation' || currentTab === 'setup' || currentTab === 'report' ? currentTab : 'overview';
  const tableRowsWithAuthoritativeOrders = useMemo(() => {
    const existingIds = new Set(tableRows.map((table) => table.id));
    const recoveredTables = Object.entries(ordersByTable)
      .filter(([tableId, lines]) => !existingIds.has(tableId) && lines.length > 0)
      .map(([tableId, lines]) => fallbackTableFromOrder(tableId, activeBranchId, lines));
    return recoveredTables.length > 0 ? [...tableRows, ...recoveredTables] : tableRows;
  }, [activeBranchId, ordersByTable, tableRows]);
  const sortedTableRows = useMemo(() => sortTables(tableRowsWithAuthoritativeOrders), [tableRowsWithAuthoritativeOrders]);
  const paymentRequestedSet = useMemo(() => new Set(paymentRequestedIds), [paymentRequestedIds]);
  const reservationsForWorkingDate = useMemo(
    () =>
      storedReservations
        .filter((reservation) => reservation.date === reservationDateFilter)
        .sort((a, b) => {
          const tableCompare = a.tableId.localeCompare(b.tableId, 'tr');
          if (tableCompare !== 0) return tableCompare;
          const timeCompare = compareReservationTimes(a.time, b.time);
          if (timeCompare !== 0) return timeCompare;
          return a.updatedAt.localeCompare(b.updatedAt, 'tr');
        }),
    [reservationDateFilter, storedReservations],
  );
  const appliedReservationsByTable = useMemo(() => {
    const next = new Map<string, StoredTableReservation>();

    reservationsForWorkingDate.forEach((reservation) => {
      if (!next.has(reservation.tableId)) {
        next.set(reservation.tableId, reservation);
      }
    });

    return next;
  }, [reservationsForWorkingDate]);
  const reservationChargeAccounts = useMemo(
    () => [...seedAccounts, ...storedAccounts].filter((account) => account.type === 'customer' || account.type === 'partner'),
    [seedAccounts, storedAccounts],
  );
  const reportAccounts = useMemo(() => [...seedAccounts, ...storedAccounts], [seedAccounts, storedAccounts]);
  const filteredReportAccounts = useMemo(() => {
    const query = reportAccountSearch.trim().toLocaleLowerCase('tr-TR');
    if (query.length < 1) return reportAccounts;
    return reportAccounts.filter((account) => `${account.code} ${account.name}`.toLocaleLowerCase('tr-TR').includes(query));
  }, [reportAccountSearch, reportAccounts]);
  const reportAccountMap = useMemo(
    () =>
      [...seedAccounts, ...storedAccounts].reduce<Record<string, Account>>((acc, account) => {
        acc[account.id] = account;
        return acc;
      }, {}),
    [seedAccounts, storedAccounts],
  );
  const selectedReportAccount = useMemo(
    () => reportAccounts.find((account) => account.id === reportAccountId) ?? filteredReportAccounts[0] ?? null,
    [filteredReportAccounts, reportAccountId, reportAccounts],
  );

  useEffect(() => {
    if (filteredReportAccounts.length === 0) {
      if (reportAccountId) {
        setReportAccountId('');
      }
      return;
    }

    if (!reportAccountId || !reportAccounts.some((account) => account.id === reportAccountId)) {
      setReportAccountId(filteredReportAccounts[0]?.id ?? '');
    }
  }, [filteredReportAccounts, reportAccountId, reportAccounts]);

  const displayTableRows = useMemo(
    () =>
      sortedTableRows.map((table) => {
        const activeReservation = appliedReservationsByTable.get(table.id);

        return {
          ...table,
          paymentRequested: paymentRequestedSet.has(table.id) || table.paymentRequested,
          // Authoritative sync writes an explicit 0 for every known table so cleared tables never fall back to a stale layout total.
          total: liveTotals[table.id] ?? table.total,
          guests: activeReservation?.guestCount ?? table.guests,
          reservationName: activeReservation?.guestName,
          reservationPhone: activeReservation?.phone,
          reservationStatus: activeReservation?.status,
          reservationTime: activeReservation?.time,
          reservationDate: activeReservation?.date,
          reservationEvent: activeReservation?.event,
          reservationDeposit: activeReservation?.deposit,
        };
      }),
    [appliedReservationsByTable, liveTotals, paymentRequestedSet, sortedTableRows],
  );

  useEffect(() => {
    const refresh = () => {
      setSessionState(loadSessionState());
      setTableLayoutState(loadTableLayoutState());
    };

    refresh();

    const unsubscribeSession = subscribeToSessionChanges(refresh);
    const unsubscribeTables = subscribeToTableLayoutChanges(refresh);

    return () => {
      unsubscribeSession();
      unsubscribeTables();
    };
  }, []);

  useEffect(() => {
    setTableRows(initialTables);
  }, [initialTables]);

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
          logFloorFlow('table-layout-refresh-failed', {
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
    const syncTableState = () => {
      setPaymentRequestedIds(getPaymentRequestedTableIds());
      setLiveTotals(getTableLiveTotals());
      setOrdersByTable(getStoredOrdersByTable<OrderLine>());
      const storedMeta = getStoredTableMeta();

      setTableRows((current) =>
        current.map((table) => {
          const meta = storedMeta[table.id];
          return meta
            ? {
                ...table,
                guests: meta.guests ?? table.guests,
                note: meta.note,
                openedAt: meta.openedAt,
                lastActionAt: meta.lastActionAt,
                mergedFromIds: meta.mergedFromIds,
                mergedSnapshot: meta.mergedSnapshot,
              }
            : table;
        }),
      );
    };

    syncTableState();
    void refreshAuthoritativeOrdersByTable<OrderLine>()
      .then((serverOrders) => {
        setOrderSyncDiagnostics(getAuthoritativeOrdersDiagnostics());
        setOrdersByTable(serverOrders);
        const nextRows = mergeTableRowsWithAuthoritativeOrders(tableRows, activeBranchId, serverOrders);
        setTableRows(nextRows);
        setLiveTotals(buildLiveTotalsForKnownTables(nextRows, serverOrders));
        logFloorFlow('authoritative-orders-hydrated', {
          patchId: FLOOR_SYNC_PATCH_ID,
          tableCount: Object.keys(serverOrders).length,
          activeOrderTables: Object.entries(serverOrders).filter(([, lines]) => lines.length > 0).map(([tableId]) => tableId),
        });
        if (Object.keys(serverOrders).length > 0) {
          setActionMessage('Sunucudan açık adisyonlar yüklendi');
        }
      })
      .catch((error) => {
        logFloorFlow('authoritative-orders-hydration-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    const unsubscribe = subscribeToPaymentRequestedChanges(syncTableState);
    const unsubscribeOrders = subscribeToAuthoritativeOrders(syncTableState);
    return () => {
      unsubscribe();
      unsubscribeOrders();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const syncAuthoritativeOrders = () => {
      void refreshAuthoritativeOrdersByTable<OrderLine>()
        .then((serverOrders) => {
          if (cancelled) return;
          setOrderSyncDiagnostics(getAuthoritativeOrdersDiagnostics());
          setOrdersByTable(serverOrders);
          replaceAuthoritativeOrdersByTable(serverOrders);
          const nextRows = mergeTableRowsWithAuthoritativeOrders(tableRows, activeBranchId, serverOrders);
          setTableRows(nextRows);
          setLiveTotals(buildLiveTotalsForKnownTables(nextRows, serverOrders));
        })
        .catch((error) => {
          if (cancelled) return;
          logFloorFlow('authoritative-orders-refresh-failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    };

    const handleFocus = () => syncAuthoritativeOrders();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncAuthoritativeOrders();
    };

    syncAuthoritativeOrders();
    const interval = window.setInterval(syncAuthoritativeOrders, 4000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeBranchId, tableRows]);

  useEffect(() => {
    const refreshReservations = () => {
      setStoredReservations(loadStoredTableReservations());
    };

    refreshReservations();
    return subscribeToStoredTableReservations(refreshReservations);
  }, []);

  useEffect(() => {
    const refreshAccounts = () => {
      setStoredAccounts(loadStoredAccounts());
    };

    refreshAccounts();
    return subscribeToStoredAccountChanges(refreshAccounts);
  }, []);

  useEffect(() => {
    const refreshPayments = () => {
      setPaymentJournal(loadPaymentJournal());
    };

    refreshPayments();
    return subscribeToPaymentJournalChanges(refreshPayments);
  }, []);

  useEffect(() => {
    const refreshDelivery = () => {
      setDeliveryState(loadDeliveryState());
    };

    refreshDelivery();
    return subscribeToDeliveryChanges(refreshDelivery);
  }, []);

  useEffect(() => {
    const refreshDailyCash = () => {
      setDailyCashMovements(loadDailyCashMovements());
    };

    refreshDailyCash();
    return subscribeToDailyCashMovementChanges(refreshDailyCash);
  }, []);

  useEffect(() => {
    if (storedReservations.length > 0) {
      return;
    }

    const seeded = Object.entries(getStoredTableMeta()).flatMap(([tableId, meta]) => {
      if (!meta.reservationName) {
        return [];
      }

      return [
        buildStoredTableReservation({
          id: `legacy-reservation-${tableId}-${meta.reservationDate ?? todayDateInput()}-${meta.reservationTime ?? '00-00'}`,
          tableId,
          guestName: meta.reservationName,
          phone: meta.reservationPhone,
          date: meta.reservationDate ?? todayDateInput(),
          time: meta.reservationTime,
          event: meta.reservationEvent,
          deposit: meta.reservationDeposit,
          depositMethod: meta.reservationDeposit ? 'cash' : undefined,
          guestCount: meta.guests ?? 2,
          status: meta.reservationStatus ?? 'waiting',
        }),
      ];
    });

    if (seeded.length > 0) {
      saveStoredTableReservations(seeded);
      seeded.forEach((reservation) => {
        void syncReservationDepositMovement(reservation);
      });
    }
  }, [storedReservations.length]);

  useEffect(() => {
    const seededOrders = { ...getStoredOrdersByTable<OrderLine>() };
    initialTables.forEach((table) => {
      seededOrders[table.id] ??= [];
    });
    setOrdersByTable(seededOrders);
  }, [initialTables]);

  const counts = useMemo<Record<StatusFilter, number>>(() => {
    const mapped = displayTableRows.map((table) => mapStatus(table, reservationDateFilter));
    return {
      all: displayTableRows.length,
      available: mapped.filter((item) => item === 'available').length,
      occupied: mapped.filter((item) => item === 'occupied').length,
      payment: mapped.filter((item) => item === 'payment').length,
      reserved: mapped.filter((item) => item === 'reserved').length,
    };
  }, [displayTableRows, reservationDateFilter]);

  const selectedGroupCount = useMemo(
    () => sortedTableRows.filter((table) => normalizeGroupName(table.group) === selectedGroup).length,
    [selectedGroup, sortedTableRows],
  );

  const selectedGroupTables = useMemo(
    () => sortedTableRows.filter((table) => normalizeGroupName(table.group) === selectedGroup),
    [selectedGroup, sortedTableRows],
  );

  const filteredTables = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');

    return displayTableRows
      .map((table) => {
        const statusValue = mapStatus(table, reservationDateFilter);
        const openedMinutes = minutesSince(table.openedAt, fallbackOpenedMinutes(table.name, statusValue));
        const lastActionMinutes = minutesSince(table.lastActionAt, fallbackLastActionMinutes(table.name, statusValue));
        const totalValue = table.total;

        return {
          id: table.id,
          name: cleanTableName(table.name),
          group: table.group,
          guestCount: statusValue === 'available' ? 0 : table.guests,
          total: totalValue,
          status: statusValue,
          reservationName: table.reservationName,
          reservationPhone: table.reservationPhone,
          reservationStatus: table.reservationStatus,
          reservationTime: table.reservationTime,
          reservationDate: table.reservationDate,
          reservationEvent: table.reservationEvent,
          reservationDeposit: table.reservationDeposit,
          openedMinutes,
          lastActionMinutes,
          highTotal: totalValue >= 1500,
          longOpen: openedMinutes >= 45,
        };
      })
      .filter((table) => {
        const matchesStatus = status === 'all' ? true : table.status === status;
        const matchesGroup = group === 'all' ? true : normalizeGroupName(table.group) === group;
        const matchesSearch = query.length === 0 ? true : table.name.toLocaleLowerCase('tr-TR').includes(query);
        return matchesStatus && matchesGroup && matchesSearch;
      });
  }, [displayTableRows, group, reservationDateFilter, search, status]);

  const noteTable = useMemo(
    () => displayTableRows.find((table) => table.id === noteTableId) ?? null,
    [displayTableRows, noteTableId],
  );

  const reservableTables = useMemo(
    () => displayTableRows,
    [displayTableRows],
  );

  const reservationsForSelectedDate = useMemo(
    () =>
      reservationsForWorkingDate.map((reservation) => {
        const table = displayTableRows.find((item) => item.id === reservation.tableId);
        return {
          id: reservation.id,
          tableId: reservation.tableId,
          tableName: table?.name ?? reservation.tableId,
          guestName: reservation.guestName,
          phone: reservation.phone,
          date: reservation.date,
          time: reservation.time,
          event: reservation.event,
          deposit: reservation.deposit,
          depositMethod: reservation.depositMethod,
          guestCount: reservation.guestCount,
          status: reservation.status,
        };
      }),
    [displayTableRows, reservationsForWorkingDate],
  );

  useEffect(() => {
    if (reservationDraft.tableId && reservableTables.some((table) => table.id === reservationDraft.tableId)) return;
    setReservationDraft((current) => ({
      ...current,
      tableId: reservableTables[0]?.id ?? '',
    }));
  }, [reservationDraft.tableId, reservableTables]);

  const dailyReport = useMemo(() => {
    const reportDate = reservationDateFilter;
    const reportCashMovements = dailyCashMovements.filter((movement) => movement.date === reportDate);
    const activeTables = displayTableRows.filter((table) => {
      const statusValue = mapStatus(table);
      return statusValue === 'occupied' || statusValue === 'payment';
    });
    const paymentTables = displayTableRows.filter((table) => mapStatus(table) === 'payment');
    const totalRevenue = displayTableRows.reduce((sum, table) => sum + table.total, 0);
    const totalGuests = activeTables.reduce((sum, table) => sum + (table.guests ?? 0), 0);
    const averageTicket = activeTables.length > 0 ? totalRevenue / activeTables.length : 0;
    const allOrderLines = Object.values(ordersByTable).flat();
    const totalItems = allOrderLines.reduce((sum, line) => sum + line.qty, 0);
    const tablePayments = paymentJournal.filter((entry) => entry.date === reportDate);
    const deliveryPayments = deliveryState.orders.filter((order) => order.status === 'delivered' && order.createdAt.slice(0, 10) === reportDate);
    const cashCollections = tablePayments.filter((entry) => entry.method === 'cash').reduce((sum, entry) => sum + entry.amount, 0)
      + deliveryPayments.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + order.amount, 0);
    const posCollections = tablePayments.filter((entry) => entry.method === 'card').reduce((sum, entry) => sum + entry.amount, 0)
      + deliveryPayments.filter((order) => order.paymentMethod === 'card' || order.paymentMethod === 'online').reduce((sum, order) => sum + order.amount, 0);
    const manualAccountCollections = reportCashMovements
      .filter((movement) => movement.type === 'account_collection')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const manualAccountPayments = reportCashMovements
      .filter((movement) => movement.type === 'account_payment')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashAccountCollections = reportCashMovements
      .filter((movement) => movement.type === 'account_collection' && movement.method === 'cash')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cashAccountPayments = reportCashMovements
      .filter((movement) => movement.type === 'account_payment' && movement.method === 'cash')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const accountCollections = tablePayments.filter((entry) => entry.method === 'account').reduce((sum, entry) => sum + entry.amount, 0)
      + deliveryPayments.filter((order) => order.paymentMethod === 'account').reduce((sum, order) => sum + order.amount, 0)
      + manualAccountCollections;
    const mealCollections = tablePayments.filter((entry) => entry.method === 'meal').reduce((sum, entry) => sum + entry.amount, 0);
    const euroCollections = tablePayments.filter((entry) => entry.method === 'euro').reduce((sum, entry) => sum + entry.amount, 0);
    const dollarCollections = tablePayments.filter((entry) => entry.method === 'dollar').reduce((sum, entry) => sum + entry.amount, 0);
    const deliveryCollections = deliveryPayments.reduce((sum, order) => sum + order.amount, 0);
    const dailyTurnover = tablePayments.reduce((sum, entry) => sum + entry.amount, 0) + deliveryCollections;
    const totalCollections = cashCollections + posCollections + accountCollections + mealCollections + euroCollections + dollarCollections;
    const estimatedCash = cashCollections;
    const estimatedCard = posCollections;
    const dailyAdvance = reportCashMovements.filter((movement) => movement.type === 'advance').reduce((sum, movement) => sum + movement.amount, 0);
    const dailyExpense = reportCashMovements.filter((movement) => movement.type === 'expense').reduce((sum, movement) => sum + movement.amount, 0);
    const dayEndTransfer = reportCashMovements.filter((movement) => movement.type === 'day_end').reduce((sum, movement) => sum + movement.amount, 0);
    const cardAccountCollections = reportCashMovements
      .filter((movement) => movement.type === 'account_collection' && movement.method === 'card')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const bankAccountCollections = reportCashMovements
      .filter((movement) => movement.type === 'account_collection' && movement.method === 'bank')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const cardAccountPayments = reportCashMovements
      .filter((movement) => movement.type === 'account_payment' && movement.method === 'card')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const bankAccountPayments = reportCashMovements
      .filter((movement) => movement.type === 'account_payment' && movement.method === 'bank')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const totalIncome = totalCollections + dailyAdvance;
    const totalExpense = dailyExpense + dayEndTransfer + manualAccountPayments;
    const totalRegisterIn = cashCollections + posCollections + mealCollections + euroCollections + dollarCollections + dailyAdvance + cashAccountCollections + cardAccountCollections + bankAccountCollections;
    const totalRegisterOut = dailyExpense + dayEndTransfer + cashAccountPayments + cardAccountPayments + bankAccountPayments;
    const cashHandover = Math.max(cashCollections + dailyAdvance + cashAccountCollections - dailyExpense - cashAccountPayments - dayEndTransfer, 0);
    const posHandover = Math.max(posCollections + cardAccountCollections - cardAccountPayments, 0);
    const bankHandover = Math.max(bankAccountCollections - bankAccountPayments, 0);
    const mealCardHandover = Math.max(mealCollections, 0);
    const euroHandover = Math.max(euroCollections, 0);
    const dollarHandover = Math.max(dollarCollections, 0);
    const netDailyCash = cashHandover;
    const longOpenCount = displayTableRows.filter((table) => {
      const statusValue = mapStatus(table);
      if (statusValue !== 'occupied' && statusValue !== 'payment') return false;
      return minutesSince(table.openedAt, fallbackOpenedMinutes(table.name, statusValue)) >= 45;
    }).length;
    const highRiskCount = displayTableRows.filter((table) => {
      const statusValue = mapStatus(table);
      return (statusValue === 'occupied' || statusValue === 'payment') && table.total >= 1500;
    }).length;

    const topProducts = Object.values(
      allOrderLines.reduce<Record<string, { name: string; qty: number; revenue: number }>>((acc, line) => {
        const key = line.name.trim() || line.id;
        acc[key] = acc[key]
          ? { ...acc[key], qty: acc[key].qty + line.qty, revenue: acc[key].revenue + line.qty * line.price }
          : { name: line.name, qty: line.qty, revenue: line.qty * line.price };
        return acc;
      }, {}),
    )
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 4);

    const hour = new Date().getHours();
    const shiftLabel = hour < 16 ? 'Öğle vardiyası' : hour < 23 ? 'Akşam vardiyası' : 'Kapanış vardiyası';
    const shiftTone = paymentTables.length > 0 || longOpenCount > 0 ? 'Dikkat istiyor' : 'Kontrol altında';

    return {
      totalRevenue,
      totalGuests,
      averageTicket,
      totalItems,
      activeTables: activeTables.length,
      paymentTables: paymentTables.length,
      estimatedCash,
      estimatedCard,
      cashCollections,
      posCollections,
      accountCollections,
      accountPayments: manualAccountPayments,
      manualAccountCollections,
      mealCollections,
      euroCollections,
      dollarCollections,
      deliveryCollections,
      dailyTurnover,
      totalCollections,
      totalIncome,
      totalExpense,
      cashIn: totalRegisterIn,
      cashOut: totalRegisterOut,
      dailyAdvance,
      dailyExpense,
      dayEndTransfer,
      cardAccountCollections,
      bankAccountCollections,
      cashHandover,
      posHandover,
      bankHandover,
      mealCardHandover,
      euroHandover,
      dollarHandover,
      netDailyCash,
      longOpenCount,
      highRiskCount,
      topProducts,
      reportCashMovements,
      shiftLabel,
      shiftTone,
    };
  }, [dailyCashMovements, deliveryState.orders, displayTableRows, ordersByTable, paymentJournal, reservationDateFilter]);

  const reportLedgerRows = useMemo(() => {
    const reportDate = reservationDateFilter;
    const tableRows = paymentJournal
      .filter((entry) => entry.date === reportDate)
      .map((entry) => ({
        id: `ledger-${entry.id}`,
        method: entry.method,
        label: entry.label,
        amount: entry.amount,
        direction: 'in' as const,
        source: 'table' as const,
        time: entry.createdAt.slice(11, 16),
        note: 'Adisyon tahsilatı',
        methodLabel: entry.method === 'cash'
          ? 'Nakit'
          : entry.method === 'card'
            ? 'POS'
            : entry.method === 'account'
              ? 'Cari'
              : entry.method === 'meal'
                ? 'Yemek kartı'
                : entry.method === 'euro'
                  ? 'Euro'
                  : entry.method === 'dollar'
                    ? 'Dolar'
                    : '',
      }));

    const deliveryRows = deliveryState.orders
      .filter((order) => order.status === 'delivered' && order.createdAt.slice(0, 10) === reportDate)
      .map((order) => ({
        id: `ledger-delivery-${order.id}`,
        method: 'delivery' as const,
        label: `${order.customerName} paket siparişi`,
        amount: order.amount,
        direction: 'in' as const,
        source: 'delivery' as const,
        time: order.createdAt.slice(11, 16),
        note: order.paymentMethod === 'cash' ? 'Paket servis - nakit' : order.paymentMethod === 'card' || order.paymentMethod === 'online' ? 'Paket servis - POS/online' : 'Paket servis - cari',
        methodLabel: order.paymentMethod === 'cash' ? 'Nakit' : order.paymentMethod === 'card' || order.paymentMethod === 'online' ? 'POS' : 'Cari',
      }));

    const cashMovementRows = dailyReport.reportCashMovements.map((movement) => {
      const accountName = movement.accountId ? reportAccountMap[movement.accountId]?.name : '';
      const methodLabel = movement.method === 'cash' ? 'nakit'
        : movement.method === 'card' ? 'kart / POS'
        : movement.method === 'bank' ? 'banka'
        : '';

      if (movement.type === 'account_collection' || movement.type === 'account_payment') {
        return {
          id: `ledger-cash-${movement.id}`,
          method: 'account' as const,
          label: accountName || (movement.type === 'account_collection' ? 'Cari tahsilat' : 'Cari ödeme'),
          amount: movement.amount,
          direction: movement.type === 'account_payment' ? 'out' as const : 'in' as const,
          source: 'manual' as const,
          time: movement.createdAt.slice(11, 16),
          note: `${movement.type === 'account_collection' ? 'Cari tahsilat' : 'Cari ödeme'}${movement.note ? ` · ${movement.note}` : ''}`,
          methodLabel,
        };
      }

      return {
        id: `ledger-cash-${movement.id}`,
        method: 'manual' as const,
        label: movement.type === 'advance' ? 'Kasa avansı' : movement.type === 'expense' ? 'Günlük gider' : 'Gün sonu aktarımı',
        amount: movement.amount,
        direction: movement.type === 'expense' ? 'out' as const : movement.type === 'day_end' ? 'out' as const : 'in' as const,
        source: 'manual' as const,
        time: movement.createdAt.slice(11, 16),
        note: movement.note,
        methodLabel: '',
      };
    });

    return [...tableRows, ...deliveryRows, ...cashMovementRows]
      .filter((row) => reportMethodFilter === 'all' ? true : row.method === reportMethodFilter)
      .sort((a, b) => b.id.localeCompare(a.id, 'tr'));
  }, [dailyReport.reportCashMovements, deliveryState.orders, paymentJournal, reportAccountMap, reportMethodFilter, reservationDateFilter]);

  function parseDailyAmount(value: string) {
    const parsed = Number(value.replace(',', '.').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function addDailyCashMovement(type: 'advance' | 'expense') {
    const amount = parseDailyAmount(type === 'advance' ? dailyAdvanceInput : dailyExpenseInput);
    if (amount <= 0) {
      setActionMessage(type === 'advance' ? 'Kasa avansı tutarı gir' : 'Gider tutarı gir');
      return;
    }
    appendDailyCashMovement({
      id: `${type}-${Date.now()}`,
      date: reservationDateFilter,
      type,
      amount,
      note: type === 'advance' ? 'Günlük kasa avansı' : dailyExpenseNote.trim() || 'Günlük kasa gideri',
      createdAt: new Date().toISOString(),
    });
    setDailyAdvanceInput('');
    setDailyExpenseInput('');
    setDailyExpenseNote('');
    setActionMessage(type === 'advance' ? 'Günlük kasa avansı kaydedildi' : 'Günlük gider kasadan işlendi');
  }

  async function addDailyAccountMovement() {
    const account = selectedReportAccount;
    const amount = parseDailyAmount(reportAccountAmount);

    if (!account) {
      setActionMessage('Cari hesap seç');
      return;
    }

    if (amount <= 0) {
      setActionMessage(reportAccountMode === 'collection' ? 'Cari tahsilat tutarı gir' : 'Cari ödeme tutarı gir');
      return;
    }

    const methodLabel = reportAccountMethod === 'cash' ? 'nakit' : reportAccountMethod === 'card' ? 'kart' : 'banka';
    const description = reportAccountNote.trim() || `${methodLabel} ile ${reportAccountMode === 'collection' ? 'tahsilat' : 'ödeme'}`;

    try {
      await createAuthoritativeFinanceAccountMovement({
        action: reportAccountMode === 'collection' ? 'record_collection' : 'record_payment',
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        amount,
        method: reportAccountMethod,
        description,
      });
    } catch (error) {
      console.error('[cari-flow] daily report account movement failed', { accountId: account.id, reportAccountMode, amount, error });
      setActionMessage('Cari işlemi sunucuya kaydedilemedi. Lütfen tekrar deneyin.');
      return;
    }

    appendDailyCashMovement({
      id: `${reportAccountMode}-${Date.now()}`,
      date: reservationDateFilter,
      type: reportAccountMode === 'collection' ? 'account_collection' : 'account_payment',
      amount,
      note: description,
      method: reportAccountMethod,
      accountId: account.id,
      createdAt: new Date().toISOString(),
    });

    setReportAccountAmount('');
    setReportAccountNote('');
    setActionMessage(
      reportAccountMode === 'collection'
        ? `${account.name} carisine ${formatTRY(amount)} tahsilat islendi`
        : `${account.name} carisine ${formatTRY(amount)} ödeme işlendi`,
    );
  }

  function createQuickReportAccount() {
    const name = quickAccountName.trim();
    const phone = quickAccountPhone.trim();

    if (!name) {
      setActionMessage('Yeni cari icin ad gir');
      return;
    }

    const prefix = quickAccountType === 'supplier'
      ? 'SUP'
      : quickAccountType === 'partner'
        ? 'ORT'
        : quickAccountType === 'staff'
          ? 'PER'
          : 'CR';
    const existingCount = [...seedAccounts, ...storedAccounts].filter((account) => account.type === quickAccountType).length;
    const code = `${prefix}-${String(existingCount + 1).padStart(3, '0')}`;
    const createdAccount: Account = {
      id: `local-${quickAccountType}-${Date.now()}`,
      code,
      name,
      type: quickAccountType,
      openingBalance: 0,
      phone,
      address: '',
      taxOffice: '',
      taxNumber: '',
      invoiceTitle: name,
    };

    appendStoredAccount(createdAccount);
    setReportAccountSearch(`${createdAccount.code} ${createdAccount.name}`);
    setReportAccountId(createdAccount.id);
    setQuickAccountName('');
    setQuickAccountPhone('');
    setShowQuickAccountForm(false);
    setActionMessage(`${createdAccount.name} cari karti olusturuldu`);
  }

  function closeDayCash() {
    const openTables = displayTableRows.filter((table) => {
      const statusValue = mapStatus(table, reservationDateFilter);
      const hasOrders = (ordersByTable[table.id] ?? []).some((line) => line.qty > 0);
      return statusValue === 'occupied' || statusValue === 'payment' || table.total > 0 || hasOrders;
    });

    if (openTables.length > 0) {
      const preview = openTables.slice(0, 3).map((table) => table.name).join(', ');
      setActionMessage(`Gun sonu yapilamadi. Once acik adisyonlu masalari kapat: ${preview}${openTables.length > 3 ? '...' : ''}`);
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        [
          `${reservationDateFilter} icin gun sonu yapilsin mi?`,
          `Nakit teslim: ${formatTRY(dailyReport.cashHandover)}`,
          `POS teslim: ${formatTRY(dailyReport.posHandover)}`,
          `Euro teslim: ${formatTRY(dailyReport.euroHandover)}`,
          `Dolar teslim: ${formatTRY(dailyReport.dollarHandover)}`,
          `Banka teslim: ${formatTRY(dailyReport.bankHandover)}`,
        ].join('\n'),
      );

      if (!confirmed) {
        setActionMessage('Gun sonu islemi iptal edildi');
        return;
      }
    }

    const transferAmount = dailyReport.cashHandover;
    const treasuryTransfers: TreasuryMovement[] = [];
    if (dailyReport.cashHandover > 0) {
      treasuryTransfers.push({
        id: `day-end-cash-${Date.now()}`,
        date: reservationDateFilter,
        accountId: 'cash-main',
        direction: 'in',
        amount: dailyReport.cashHandover,
        description: `${reservationDateFilter} gun sonu nakit teslim`,
        source: 'manual',
      });
    }
    if (dailyReport.posHandover > 0) {
      treasuryTransfers.push({
        id: `day-end-pos-${Date.now()}`,
        date: reservationDateFilter,
        accountId: 'pos-main',
        direction: 'in',
        amount: dailyReport.posHandover,
        description: `${reservationDateFilter} gun sonu POS teslim`,
        source: 'manual',
      });
    }
    if (dailyReport.bankHandover > 0) {
      treasuryTransfers.push({
        id: `day-end-bank-${Date.now()}`,
        date: reservationDateFilter,
        accountId: 'bank-main',
        direction: 'in',
        amount: dailyReport.bankHandover,
        description: `${reservationDateFilter} gun sonu banka teslim`,
        source: 'manual',
      });
    }
    if (dailyReport.euroHandover > 0) {
      treasuryTransfers.push({
        id: `day-end-euro-${Date.now()}`,
        date: reservationDateFilter,
        accountId: 'euro-main',
        direction: 'in',
        amount: dailyReport.euroHandover,
        description: `${reservationDateFilter} gun sonu euro teslim`,
        source: 'manual',
      });
    }
    if (dailyReport.dollarHandover > 0) {
      treasuryTransfers.push({
        id: `day-end-dollar-${Date.now()}`,
        date: reservationDateFilter,
        accountId: 'dollar-main',
        direction: 'in',
        amount: dailyReport.dollarHandover,
        description: `${reservationDateFilter} gun sonu dolar teslim`,
        source: 'manual',
      });
    }

    if (transferAmount > 0) {
      appendDailyCashMovement({
        id: `day-end-${Date.now()}`,
        date: reservationDateFilter,
        type: 'day_end',
        amount: transferAmount,
        note: 'Gün sonu ana kasa aktarımı',
        createdAt: new Date().toISOString(),
      });
    }
    if (treasuryTransfers.length > 0) {
      appendStoredTreasuryMovements(treasuryTransfers);
    }

    const nextDate = addDaysToInputDate(reservationDateFilter, 1);
    const resetRows = tableRows.map((table) => ({
      ...table,
      status: 'available' as const,
      guests: 0,
      total: 0,
      paymentRequested: false,
      note: undefined,
      openedAt: undefined,
      lastActionAt: undefined,
      mergedFromIds: undefined,
      mergedSnapshot: undefined,
    }));
    const resetOrders = Object.fromEntries(tableRows.map((table) => [table.id, [] as OrderLine[]]));
    const resetTotals = Object.fromEntries(tableRows.map((table) => [table.id, 0]));

    persistOrders(resetOrders);
    persistRows(resetRows);
    replaceTableLiveTotals(resetTotals);
    setLiveTotals(resetTotals);
    setPaymentRequestedIds([]);
    setDailyAdvanceInput('');
    setDailyExpenseInput('');
    setDailyExpenseNote('');
    tableRows.forEach((table) => setTablePaymentRequested(table.id, false));
    setReservationDateFilter(nextDate);
    setReservationDraft((current) => ({
      ...current,
      reservationId: '',
      tableId: current.tableId || tableRows[0]?.id || '',
      date: nextDate,
      guestName: '',
      phone: '',
      time: '',
      event: '',
      deposit: '',
      depositMethod: 'cash',
      depositAccountId: '',
      guestCount: '2',
      status: 'waiting',
    }));
    setActionMessage(
      treasuryTransfers.length > 0
        ? `Gun sonu tamamlandi. Nakit ${formatTRY(dailyReport.cashHandover)}, POS ${formatTRY(dailyReport.posHandover)}, Euro ${formatTRY(dailyReport.euroHandover)}, Dolar ${formatTRY(dailyReport.dollarHandover)}, banka ${formatTRY(dailyReport.bankHandover)} teslim edildi. Sistem ${nextDate} tarihine gecti`
        : `Gün sonu yapıldı, sistem ${nextDate} tarihine geçti`,
    );
  }

  function persistOrders(nextOrders: Record<string, OrderLine[]>) {
    logFloorFlow('orders-persisted', {
      tableCount: Object.keys(nextOrders).length,
      activeOrderTables: Object.entries(nextOrders).filter(([, lines]) => lines.length > 0).map(([tableId]) => tableId),
    });
    replaceAuthoritativeOrdersByTable(nextOrders);
    setOrdersByTable(nextOrders);
  }

  function persistRows(nextRows: LocalTableRecord[]) {
    setTableRows(nextRows);
    saveTableLayoutState({
      tables: nextRows.map((table) => ({
        id: table.id,
        branchId: table.branchId,
        name: table.name,
        group: table.group,
        status: table.status,
        guests: table.guests,
        total: table.total,
        paymentRequested: table.paymentRequested,
      })),
    });
    const nextMeta = Object.fromEntries(
      nextRows.map((table) => [
        table.id,
        {
          guests: table.guests,
          note: table.note,
          openedAt: table.openedAt,
          lastActionAt: table.lastActionAt,
          mergedFromIds: table.mergedFromIds,
          mergedSnapshot: table.mergedSnapshot,
        },
      ]),
    );
    replaceStoredTableMeta(nextMeta);
  }

  async function syncTableClosureWithServer(tableId: string, action: 'clear_table' | 'delete_table') {
    const mutationId = `${action}-${tableId}-${Date.now()}`;
    try {
      const response = await fetch('/api/pos/table-orders', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, tableId, mutationId }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        ordersByTable?: Record<string, OrderLine[]>;
        authoritativeState?: { ordersByTable?: Record<string, OrderLine[]> };
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Masa sunucuda kapatılamadı (${response.status})`);
      }
      const authoritativeOrders = payload.authoritativeState?.ordersByTable ?? payload.ordersByTable;
      if (authoritativeOrders) {
        replaceAuthoritativeOrdersByTable(authoritativeOrders);
        setOrdersByTable(authoritativeOrders);
        setLiveTotals(buildLiveTotalsForKnownTables(sortedTableRows, authoritativeOrders));
      }
      logFloorFlow('table-closure-authoritative-sync', {
        tableId,
        action,
        activeOrderTables: Object.entries(authoritativeOrders ?? {}).filter(([, lines]) => lines.length > 0).map(([id]) => id),
      });
    } catch (error) {
      console.error('[business-flow] table closure sync failed', {
        tableId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      setActionMessage('Masa yerelde temizlendi ancak sunucu kapanışı doğrulanamadı. Sayfayı yenilemeden tekrar deneyin.');
    }
  }

  function openQuickNote(tableId: string) {
    const table = displayTableRows.find((item) => item.id === tableId);
    if (!table) {
      console.error('[business-flow] quick note open failed', { tableId, reason: 'table-not-found' });
      setActionMessage('Masa notu acilamadi: masa bulunamadi');
      return;
    }
    setNoteTableId(tableId);
    setNoteDraft({
      guests: String(table.guests ?? 0),
      reservationName: table.reservationName ?? '',
      reservationPhone: table.reservationPhone ?? '',
      reservationStatus: table.reservationStatus ?? 'waiting',
      reservationTime: table.reservationTime ?? '',
      note: table.note ?? '',
    });
  }

  function saveQuickNote() {
    if (!noteTable) {
      console.error('[business-flow] quick note save failed', { noteTableId, reason: 'table-not-found' });
      setActionMessage('Masa notu kaydedilemedi: masa bulunamadi');
      return;
    }
    const now = new Date().toISOString();
    const nextRows = tableRows.map((table) =>
      table.id === noteTable.id
        ? {
            ...table,
            guests: Math.max(Number(noteDraft.guests) || 0, 0),
            status: appliedReservationsByTable.has(table.id) ? 'reserved' as const : table.total > 0 ? 'occupied' as const : 'available' as const,
            note: noteDraft.note.trim() || undefined,
            lastActionAt: now,
          }
        : table,
    );
    persistRows(nextRows);
    setNoteTableId(null);
    setActionMessage(`${noteTable.name} masa bilgisi güncellendi`);
  }

  async function syncReservationDepositMovement(reservation: StoredTableReservation) {
    const movementId = getDepositMovementId(reservation.id);
    const accountTransactionId = getDepositAccountTransactionId(reservation.id);

    removeStoredTreasuryMovementIds([movementId]);
    removeStoredFinanceAccountTransactionIds([accountTransactionId]);

    if ((reservation.deposit ?? 0) <= 0) {
      return;
    }

    const description = `${reservation.guestName} rezervasyon kaporası - ${reservation.tableId}`;

    if (reservation.depositMethod === 'account' && reservation.depositAccountId) {
      const account = reservationChargeAccounts.find((item) => item.id === reservation.depositAccountId);
      if (!account) {
        return;
      }

      try {
        await createAuthoritativeFinanceAccountMovement({
          action: 'sync_reservation_deposit',
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          amount: reservation.deposit ?? 0,
          method: 'bank',
          description: `${description} (cari kapora)`,
          reconciliationKey: `reservation-deposit:${reservation.id}`,
        });
      } catch (error) {
        console.error('[cari-flow] reservation deposit movement failed', { reservationId: reservation.id, accountId: account.id, error });
        setActionMessage('Cari kapora hareketi sunucuya kaydedilemedi.');
      }
      return;
    }

    const treasuryAccountId = reservation.depositMethod === 'bank'
      ? 'bank-main'
      : reservation.depositMethod === 'pos'
        ? 'pos-main'
        : 'cash-main';

    appendStoredTreasuryMovements([
      {
        id: movementId,
        date: reservation.date,
        accountId: treasuryAccountId,
        direction: 'in',
        amount: reservation.deposit ?? 0,
        description,
        source: 'manual',
      },
    ]);
  }

  function loadReservationFromTable(tableId: string, reservationId?: string) {
    const table = displayTableRows.find((item) => item.id === tableId);
    const reservation = reservationId
      ? storedReservations.find((item) => item.id === reservationId)
      : reservationsForWorkingDate.find((item) => item.tableId === tableId);

    setReservationDraft({
      reservationId: reservation?.id ?? '',
      tableId,
      guestName: reservation?.guestName ?? '',
      phone: reservation?.phone ?? '',
      date: reservation?.date ?? reservationDateFilter,
      time: reservation?.time ?? '',
      event: reservation?.event ?? '',
      deposit: reservation?.deposit ? String(reservation.deposit) : '',
      depositMethod: reservation?.depositMethod ?? 'cash',
      depositAccountId: reservation?.depositAccountId ?? '',
      guestCount: String(reservation?.guestCount ?? table?.guests ?? 2),
      status: reservation?.status ?? 'waiting',
    });
  }

  function saveReservation() {
    const tableId = reservationDraft.tableId;
    const guestName = reservationDraft.guestName.trim();
    if (!tableId || !guestName) {
      setActionMessage('Rezervasyon için masa ve misafir adı gerekli');
      return;
    }

    const target = displayTableRows.find((table) => table.id === tableId);
    if (!target) {
      console.error('[business-flow] reservation save failed', { tableId, guestName, reason: 'table-not-found' });
      setActionMessage('Rezervasyon kaydedilemedi: masa bulunamadi');
      return;
    }
    const depositAmount = Math.max(Number(reservationDraft.deposit.replace(',', '.')) || 0, 0);
    if (depositAmount > 0 && reservationDraft.depositMethod === 'account' && !reservationDraft.depositAccountId) {
      setActionMessage('Cari kapora için hesap seçin');
      return;
    }
    const currentReservation = reservationDraft.reservationId
      ? storedReservations.find((item) => item.id === reservationDraft.reservationId)
      : undefined;
    const nextReservation = currentReservation
      ? {
          ...currentReservation,
          tableId,
          guestName,
          phone: reservationDraft.phone.trim() || undefined,
          date: reservationDraft.date || todayDateInput(),
          time: reservationDraft.time.trim() || undefined,
          event: reservationDraft.event.trim() || undefined,
          deposit: depositAmount > 0 ? depositAmount : undefined,
          depositMethod: depositAmount > 0 ? reservationDraft.depositMethod : undefined,
          depositAccountId: depositAmount > 0 && reservationDraft.depositMethod === 'account' ? reservationDraft.depositAccountId || undefined : undefined,
          guestCount: Math.max(Number(reservationDraft.guestCount) || 1, 1),
          status: reservationDraft.status,
          updatedAt: new Date().toISOString(),
        }
      : buildStoredTableReservation({
          tableId,
          guestName,
          phone: reservationDraft.phone.trim() || undefined,
          date: reservationDraft.date || todayDateInput(),
          time: reservationDraft.time.trim() || undefined,
          event: reservationDraft.event.trim() || undefined,
          deposit: depositAmount > 0 ? depositAmount : undefined,
          depositMethod: depositAmount > 0 ? reservationDraft.depositMethod : undefined,
          depositAccountId: depositAmount > 0 && reservationDraft.depositMethod === 'account' ? reservationDraft.depositAccountId || undefined : undefined,
          guestCount: Math.max(Number(reservationDraft.guestCount) || 1, 1),
          status: reservationDraft.status,
        });

    upsertStoredTableReservation(nextReservation);
    void syncReservationDepositMovement(nextReservation);
    setReservationDateFilter(reservationDraft.date || todayDateInput());
    setReservationDraft((current) => ({ ...current, reservationId: nextReservation.id }));
    setActionMessage(`${target.name} için rezervasyon kaydedildi`);
  }

  function resolveReservationToDelete() {
    if (reservationDraft.reservationId) {
      return storedReservations.find((item) => item.id === reservationDraft.reservationId) ?? null;
    }

    const normalizedGuest = reservationDraft.guestName.trim().toLocaleLowerCase('tr-TR');
    const normalizedTime = reservationDraft.time.trim();

    return storedReservations.find((item) => {
      if (item.tableId !== reservationDraft.tableId) return false;
      if (item.date !== reservationDraft.date) return false;
      if (normalizedTime && (item.time ?? '') !== normalizedTime) return false;
      if (normalizedGuest && item.guestName.trim().toLocaleLowerCase('tr-TR') !== normalizedGuest) return false;
      return true;
    }) ?? null;
  }

  function clearReservation() {
    const targetReservation = resolveReservationToDelete();

    if (!targetReservation) {
      setReservationDraft((current) => ({
        ...current,
        reservationId: '',
        guestName: '',
        phone: '',
        time: '',
        event: '',
        deposit: '',
        depositMethod: 'cash',
        depositAccountId: '',
        guestCount: '2',
        status: 'waiting',
      }));
      setActionMessage('Silinecek rezervasyon bulunamadı');
      return;
    }

    const target = reservationsForSelectedDate.find((item) => item.id === targetReservation.id);
    removeStoredTableReservation(targetReservation.id);
    removeStoredTreasuryMovementIds([getDepositMovementId(targetReservation.id)]);
    removeStoredFinanceAccountTransactionIds([getDepositAccountTransactionId(targetReservation.id)]);
    if (targetReservation.depositMethod === 'account' && targetReservation.depositAccountId && (targetReservation.deposit ?? 0) > 0) {
      const account = reservationChargeAccounts.find((item) => item.id === targetReservation.depositAccountId);
      if (account) {
        void createAuthoritativeFinanceAccountMovement({
          action: 'record_refund',
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          amount: targetReservation.deposit ?? 0,
          method: 'bank',
          description: `${targetReservation.guestName} rezervasyon kaporası iptali`,
          reconciliationKey: `reservation-deposit:${targetReservation.id}:void`,
        }).catch((error) => {
          console.error('[cari-flow] reservation deposit refund failed', { reservationId: targetReservation.id, accountId: account.id, error });
          setActionMessage('Rezervasyon temizlendi ancak cari kapora iadesi kaydedilemedi.');
        });
      }
    }
    setReservationDraft((current) => ({
      ...current,
      reservationId: '',
      tableId: current.tableId,
      guestName: '',
      phone: '',
      time: '',
      event: '',
      deposit: '',
      depositMethod: 'cash',
      depositAccountId: '',
      guestCount: '2',
      status: 'waiting',
    }));
    setActionMessage(`${target?.tableName ?? 'Rezervasyon'} temizlendi`);
  }

  function quickClearTable(tableId: string) {
    const target = displayTableRows.find((table) => table.id === tableId);
    if (!target) {
      console.error('[business-flow] quick clear table failed', { tableId, reason: 'table-not-found' });
      setActionMessage('Masa temizlenemedi: masa bulunamadi');
      return;
    }

    const nextOrders = { ...ordersByTable, [tableId]: [] };
    persistOrders(nextOrders);

    const currentTotals = getTableLiveTotals();
    setTableLiveTotals({ ...currentTotals, [tableId]: 0 });
    setTablePaymentRequested(tableId, false);

    const now = new Date().toISOString();
    const nextRows = tableRows.map((table) =>
      table.id === tableId
        ? {
            ...table,
            status: 'available' as const,
            guests: 0,
            total: 0,
            reservationName: undefined,
            reservationPhone: undefined,
            reservationStatus: undefined,
            reservationTime: undefined,
            reservationDate: undefined,
            reservationEvent: undefined,
            reservationDeposit: undefined,
            note: undefined,
            openedAt: undefined,
            lastActionAt: now,
            mergedFromIds: undefined,
            mergedSnapshot: undefined,
          }
        : table,
    );
    persistRows(nextRows);
    setActionMessage(`${target.name} hızlı temizlendi`);
    void syncTableClosureWithServer(tableId, 'clear_table');
  }

  function startAction(type: 'move' | 'merge', tableId: string) {
    setActionMode({ type, sourceId: tableId });
    setMergeSelectionPanel(null);
    setActionMessage(type === 'move' ? 'Hedef boş masayı seç' : 'Birleştirilecek hedef masayı seç');
  }

  function isTargetCandidate(tableId: string) {
    if (!actionMode) return false;
    if (actionMode.sourceId === tableId) return false;
    const target = displayTableRows.find((table) => table.id === tableId);
    if (!target) return false;
    if (target.status === 'reserved') return false;
    if (actionMode.type === 'move') return target.total === 0;
    return true;
  }

  function openMergeSelection(sourceId: string, targetId: string) {
    const sourceOrders = ordersByTable[sourceId] ?? [];
    if (sourceOrders.length === 0) {
      setActionMessage('Kaynak masada aktarılacak ürün yok');
      return;
    }

    setMergeSelectionPanel({
      sourceId,
      targetId,
      selected: Object.fromEntries(sourceOrders.map((line) => [line.id, true])),
    });
    setActionMode(null);
    setActionMessage('Aktarılacak ürünleri seç');
  }

  function performMerge(sourceId: string, targetId: string, selectedLineIds?: string[]) {
    const sourceTable = displayTableRows.find((table) => table.id === sourceId);
    const targetTable = displayTableRows.find((table) => table.id === targetId);
    if (!sourceTable || !targetTable) {
      console.error('[business-flow] table merge failed', { sourceId, targetId, reason: 'missing-table' });
      setActionMessage('Masa birlestirme basarisiz: kaynak veya hedef masa bulunamadi');
      return;
    }

    const sourceOrders = ordersByTable[sourceId] ?? [];
    const selectedSet = selectedLineIds ? new Set(selectedLineIds) : null;
    const selectedOrders = selectedSet ? sourceOrders.filter((line) => selectedSet.has(line.id)) : sourceOrders;
    const remainingOrders = selectedSet ? sourceOrders.filter((line) => !selectedSet.has(line.id)) : [];
    if (selectedOrders.length === 0) {
      setActionMessage('Aktarılacak ürün seçilmedi');
      return;
    }

    const targetOrders = ordersByTable[targetId] ?? [];
    const mergedOrders = [
      ...targetOrders,
      ...selectedOrders.map((line, index) => ({ ...line, id: `${targetId}-merged-${line.id}-${index}` })),
    ];
    persistOrders({
      ...ordersByTable,
      [sourceId]: remainingOrders,
      [targetId]: mergedOrders,
    });

    const currentTotals = getTableLiveTotals();
    setTableLiveTotals({
      ...currentTotals,
      [sourceId]: getOrderGross(remainingOrders),
      [targetId]: getOrderGross(mergedOrders),
    });

    setTablePaymentRequested(sourceId, remainingOrders.length > 0 ? sourceTable.paymentRequested : false);
    setTablePaymentRequested(targetId, false);

    const now = new Date().toISOString();
    const nextRows = tableRows.map((table) => {
      if (table.id === sourceId) {
        return {
          ...table,
          guests: remainingOrders.length > 0 ? table.guests : 0,
          total: getOrderGross(remainingOrders),
          reservationName: remainingOrders.length > 0 ? table.reservationName : undefined,
          reservationPhone: remainingOrders.length > 0 ? table.reservationPhone : undefined,
          reservationStatus: remainingOrders.length > 0 ? table.reservationStatus : undefined,
          reservationTime: remainingOrders.length > 0 ? table.reservationTime : undefined,
          reservationDate: remainingOrders.length > 0 ? table.reservationDate : undefined,
          reservationEvent: remainingOrders.length > 0 ? table.reservationEvent : undefined,
          reservationDeposit: remainingOrders.length > 0 ? table.reservationDeposit : undefined,
          note: remainingOrders.length > 0 ? table.note : undefined,
          openedAt: undefined,
          lastActionAt: now,
          mergedFromIds: remainingOrders.length > 0 ? table.mergedFromIds : undefined,
          mergedSnapshot: remainingOrders.length > 0 ? table.mergedSnapshot : undefined,
        };
      }
      if (table.id === targetId) {
        return {
          ...table,
          guests: targetTable.guests + (remainingOrders.length === 0 ? sourceTable.guests : 0),
          total: getOrderGross(mergedOrders),
          note: table.note ?? sourceTable.note,
          openedAt: table.openedAt ?? now,
          lastActionAt: now,
          mergedFromIds: remainingOrders.length === 0 ? [...(table.mergedFromIds ?? []), sourceId] : table.mergedFromIds,
          mergedSnapshot: remainingOrders.length === 0 ? {
            sourceOrders: {
              ...(table.mergedSnapshot?.sourceOrders ?? {}),
              [sourceId]: sourceOrders,
            },
            sourceMeta: {
              ...(table.mergedSnapshot?.sourceMeta ?? {}),
              [sourceId]: {
                guests: sourceTable.guests,
                reservationName: sourceTable.reservationName,
                reservationPhone: sourceTable.reservationPhone,
                reservationStatus: sourceTable.reservationStatus,
                reservationTime: sourceTable.reservationTime,
                reservationDate: sourceTable.reservationDate,
                reservationEvent: sourceTable.reservationEvent,
                reservationDeposit: sourceTable.reservationDeposit,
                note: sourceTable.note,
                openedAt: sourceTable.openedAt,
                lastActionAt: sourceTable.lastActionAt,
              },
            },
          } : table.mergedSnapshot,
        };
      }
      return table;
    });

    persistRows(nextRows);
    setActionMode(null);
    setMergeSelectionPanel(null);
    setActionMessage(remainingOrders.length === 0 ? `${sourceTable.name} ${targetTable.name} ile birleştirildi` : `Seçilen ürünler ${targetTable.name} masasına aktarıldı`);
  }

  function performMove(sourceId: string, targetId: string) {
    const sourceTable = displayTableRows.find((table) => table.id === sourceId);
    const targetTable = displayTableRows.find((table) => table.id === targetId);
    if (!sourceTable || !targetTable) {
      console.error('[business-flow] table move failed', { sourceId, targetId, reason: 'missing-table' });
      setActionMessage('Masa tasima basarisiz: kaynak veya hedef masa bulunamadi');
      return;
    }

    const sourceOrders = ordersByTable[sourceId] ?? [];
    persistOrders({
      ...ordersByTable,
      [sourceId]: [],
      [targetId]: sourceOrders,
    });

    const movedTotal = getOrderGross(sourceOrders);
    const currentTotals = getTableLiveTotals();
    setTableLiveTotals({
      ...currentTotals,
      [sourceId]: 0,
      [targetId]: movedTotal,
    });

    setTablePaymentRequested(sourceId, false);
    setTablePaymentRequested(targetId, false);

    const now = new Date().toISOString();
    const nextRows = tableRows.map((table) => {
      if (table.id === sourceId) {
        return {
          ...table,
          status: 'available' as const,
          guests: 0,
          total: 0,
          reservationName: undefined,
          reservationPhone: undefined,
          reservationStatus: undefined,
          reservationTime: undefined,
          reservationDate: undefined,
          reservationEvent: undefined,
          reservationDeposit: undefined,
          note: undefined,
          openedAt: undefined,
          lastActionAt: now,
          mergedFromIds: undefined,
          mergedSnapshot: undefined,
        };
      }
      if (table.id === targetId) {
        return {
          ...table,
          status: movedTotal > 0 ? 'occupied' as const : 'available' as const,
          guests: sourceTable.guests,
          total: movedTotal,
          reservationName: sourceTable.reservationName,
          reservationPhone: sourceTable.reservationPhone,
          reservationStatus: sourceTable.reservationStatus,
          reservationTime: sourceTable.reservationTime,
          reservationDate: sourceTable.reservationDate,
          reservationEvent: sourceTable.reservationEvent,
          reservationDeposit: sourceTable.reservationDeposit,
          note: sourceTable.note,
          openedAt: sourceTable.openedAt ?? now,
          lastActionAt: now,
          mergedFromIds: undefined,
          mergedSnapshot: undefined,
        };
      }
      return table;
    });

    persistRows(nextRows);
    setActionMode(null);
    setActionMessage(`${sourceTable.name} ${targetTable.name} masasına taşındı`);
  }

  function handleSelectTable(tableId: string) {
    if (actionMode) {
      if (!isTargetCandidate(tableId)) {
        console.error('[business-flow] table action target rejected', {
          actionType: actionMode.type,
          sourceId: actionMode.sourceId,
          targetId: tableId,
        });
        setActionMessage(actionMode.type === 'move'
          ? 'Tasima icin bos ve uygun hedef masa secin'
          : 'Birlestirme icin uygun hedef masa secin');
        return;
      }
      if (actionMode.type === 'move') {
        performMove(actionMode.sourceId, tableId);
        return;
      }
      openMergeSelection(actionMode.sourceId, tableId);
      return;
    }

    const target = displayTableRows.find((table) => table.id === tableId);
    logFloorFlow('table-selected', {
      selectedTableId: tableId,
      tableName: target?.name,
      activeOrderId: tableId,
      lineCount: ordersByTable[tableId]?.length ?? 0,
      total: target?.total ?? 0,
    });
    router.push(`/orders?tableId=${tableId}`);
  }

  function handleDragMove(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      console.error('[business-flow] table drag move rejected', { sourceId, targetId, reason: 'same-table' });
      setActionMessage('Masa kendi uzerine tasinamaz');
      return;
    }
    const sourceTable = displayTableRows.find((table) => table.id === sourceId);
    const targetTable = displayTableRows.find((table) => table.id === targetId);
    if (!sourceTable || !targetTable) {
      console.error('[business-flow] table drag move failed', { sourceId, targetId, reason: 'missing-table' });
      setActionMessage('Surukle birak tasima basarisiz: masa bulunamadi');
      return;
    }

    const sourceOrders = ordersByTable[sourceId] ?? [];
    if (sourceOrders.length === 0) {
      setActionMessage('Sürüklenen masada taşınacak adisyon yok');
      return;
    }

    const targetStatus = mapStatus(targetTable, reservationDateFilter);
    if (targetStatus === 'reserved' || targetTable.total > 0) {
      setActionMessage('Sürükle bırak ile sadece boş masaya taşıma yapılır');
      return;
    }

    performMove(sourceId, targetId);
  }

  function updateMergeLineSelection(lineId: string, checked: boolean) {
    setMergeSelectionPanel((current) => (
      current
        ? { ...current, selected: { ...current.selected, [lineId]: checked } }
        : current
    ));
  }

  function confirmSelectedMerge() {
    if (!mergeSelectionPanel) {
      console.error('[business-flow] selected table transfer failed', { reason: 'missing-selection-panel' });
      setActionMessage('Secili urun aktarimi basarisiz: aktarim paneli bulunamadi');
      return;
    }
    const selectedIds = Object.entries(mergeSelectionPanel.selected)
      .filter(([, selected]) => selected)
      .map(([lineId]) => lineId);
    performMerge(mergeSelectionPanel.sourceId, mergeSelectionPanel.targetId, selectedIds);
  }

  function createTablesInRange() {
    const start = Number(startNo);
    const end = Number(endNo);

    if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end < start) {
      return;
    }

    const existingNames = new Set(tableRows.map((table) => table.name));
    const newRows: TableRecord[] = [];

    for (let no = start; no <= end; no += 1) {
      const padded = String(no).padStart(2, '0');
      const name = `${selectedGroup} ${padded}`;
      if (existingNames.has(name)) continue;

      newRows.push({
        id: `${groupPrefix(selectedGroup)}-${selectedGroup.slice(0, 3).toUpperCase()}-${padded}`,
        branchId: activeBranchId,
        name,
        group: selectedGroup,
        status: 'available',
        guests: 0,
        total: 0,
        paymentRequested: false,
      });
    }

    if (newRows.length === 0) {
      return;
    }

    persistRows(sortTables([...tableRows, ...newRows]));
    setGroup(selectedGroup);
    setStatus('all');
    router.replace('/floor');
  }

  function removeSelectedGroup() {
    persistRows(tableRows.filter((table) => normalizeGroupName(table.group) !== selectedGroup));
    setGroup('all');
    setStatus('all');
    setSearch('');
  }

  function removeSelectedTable(tableId: string) {
    const target = tableRows.find((table) => table.id === tableId);
    if (!target) {
      console.error('[business-flow] table delete failed', { tableId, reason: 'table-not-found' });
      setActionMessage('Masa silinemedi: masa bulunamadı');
      return;
    }

    const activeOrders = ordersByTable[tableId] ?? [];
    if (activeOrders.length > 0 || target.total > 0 || target.status === 'occupied') {
      setActionMessage('Aktif adisyonu olan masa silinemez. Önce masayı kapatın veya temizleyin.');
      return;
    }

    if (!window.confirm(`${target.name} masasını silmek istiyor musunuz?`)) {
      return;
    }

    const nextOrders = { ...ordersByTable };
    delete nextOrders[tableId];
    persistOrders(nextOrders);

    const nextTotals = { ...getTableLiveTotals() };
    delete nextTotals[tableId];
    replaceTableLiveTotals(nextTotals);
    setTablePaymentRequested(tableId, false);
    persistRows(tableRows.filter((table) => table.id !== tableId));
    setActionMessage(`${target.name} silindi.`);
    void syncTableClosureWithServer(tableId, 'delete_table');
  }

  return (
    <div className="space-y-3">

      {activeTab === 'setup' ? (
        <TableSetupPanel
          groups={FIXED_GROUPS}
          selectedGroup={selectedGroup}
          selectedTables={selectedGroupTables}
          onSelectGroup={(value) => setSelectedGroup(value as (typeof FIXED_GROUPS)[number])}
          startNo={startNo}
          endNo={endNo}
          onStartNoChange={setStartNo}
          onEndNoChange={setEndNo}
          onCreate={createTablesInRange}
          onDeleteGroup={removeSelectedGroup}
          onDeleteTable={removeSelectedTable}
          selectedGroupCount={selectedGroupCount}
        />
      ) : null}

      {activeTab === 'reservation' ? (
        <section className="rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,#161b2c,#101827)] p-4 shadow-[0_14px_34px_rgba(2,6,23,0.18)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Masa rezervasyonları</p>
              <p className="mt-1 text-xs text-slate-400">Tarih, event ve kapora bilgisiyle rezervasyon kartı oluştur.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={reservationDateFilter}
                onChange={(event) => {
                  setReservationDateFilter(event.target.value);
                  setReservationDraft((current) => ({ ...current, reservationId: '', date: event.target.value }));
                }}
                className="h-10 rounded-2xl border border-amber-300/20 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
              />
              <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                {reservationsForSelectedDate.length} rezervasyon
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[1.25rem] border border-white/10 bg-[#0B1220] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={reservationDraft.tableId}
                  onChange={(event) => loadReservationFromTable(event.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                >
                  {reservableTables.map((table) => (
                    <option key={`reserve-${table.id}`} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={reservationDraft.date}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, reservationId: '', date: event.target.value }))}
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                />
                <input
                  value={reservationDraft.guestName}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, guestName: event.target.value }))}
                  placeholder="Rezerve eden misafir"
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={reservationDraft.phone}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Telefon"
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={reservationDraft.time}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, time: formatReservationTimeInput(event.target.value) }))}
                  placeholder="Saat örn: 20:30"
                  inputMode="numeric"
                  maxLength={5}
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={reservationDraft.guestCount}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, guestCount: event.target.value }))}
                  inputMode="numeric"
                  placeholder="Kişi sayısı"
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={reservationDraft.event}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, event: event.target.value }))}
                  placeholder="Event / özel gün"
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
                <input
                  value={reservationDraft.deposit}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, deposit: event.target.value }))}
                  inputMode="decimal"
                  placeholder="Kapora tutarı"
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                />
                <select
                  value={reservationDraft.depositMethod}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, depositMethod: event.target.value as ReservationDraft['depositMethod'] }))}
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none"
                >
                  <option value="cash">Nakit kapora</option>
                  <option value="bank">Banka kapora</option>
                  <option value="pos">POS kapora</option>
                  <option value="account">Cari kapora</option>
                </select>
                {reservationDraft.depositMethod === 'account' ? (
                  <select
                    value={reservationDraft.depositAccountId}
                    onChange={(event) => setReservationDraft((current) => ({ ...current, depositAccountId: event.target.value }))}
                    className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none md:col-span-2"
                  >
                    <option value="">Cari hesap seç</option>
                    {reservationChargeAccounts.map((account) => (
                      <option key={`reservation-account-${account.id}`} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  value={reservationDraft.status}
                  onChange={(event) => setReservationDraft((current) => ({ ...current, status: event.target.value as ReservationDraft['status'] }))}
                  className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-white outline-none md:col-span-2"
                >
                  <option value="waiting">Bekleniyor</option>
                  <option value="arrived">Geldi</option>
                  <option value="no_show">Gelmedi</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={clearReservation}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033]"
                >
                  Kartı sil
                </button>
                <button
                  type="button"
                  onClick={saveReservation}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_28px_rgba(245,158,11,0.2)] transition hover:bg-amber-400"
                >
                  {reservationDraft.reservationId ? 'Kartı güncelle' : 'Rezervasyon kartı oluştur'}
                </button>
              </div>
            </article>

            <article className="rounded-[1.25rem] border border-white/10 bg-[#0B1220] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Seçili tarihin rezervasyonları</p>
                <span className="text-xs font-semibold text-slate-400">{reservationDateFilter}</span>
              </div>
              <div className="mt-3 grid max-h-[300px] gap-2 overflow-y-auto">
                {reservationsForSelectedDate.map((reservation) => (
                  <button
                    key={`reservation-card-${reservation.id}`}
                    type="button"
                    onClick={() => loadReservationFromTable(reservation.tableId, reservation.id)}
                    className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-3 text-left transition hover:border-amber-300/35 hover:bg-[#172033]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{reservation.tableName} · {reservation.guestName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {reservation.time || 'Saat yok'} · {reservation.guestCount || 0} kişi {reservation.phone ? `· ${reservation.phone}` : ''}
                        </p>
                        {reservation.event ? <p className="mt-1 text-xs font-semibold text-amber-200">Event: {reservation.event}</p> : null}
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-100">
                          {reservation.status === 'arrived' ? 'Geldi' : reservation.status === 'no_show' ? 'Gelmedi' : 'Bekliyor'}
                        </span>
                        {reservation.deposit ? (
                          <p className="mt-2 text-xs font-semibold text-emerald-200">
                            Kapora {formatTRY(reservation.deposit)} · {reservation.depositMethod === 'bank' ? 'Banka' : reservation.depositMethod === 'pos' ? 'POS' : reservation.depositMethod === 'account' ? 'Cari' : 'Nakit'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
                {reservationsForSelectedDate.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                    Bu tarihte rezervasyon yok.
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <>
          {activeTab === 'report' ? (
          <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(135deg,#111827,#0f172a)] p-5 shadow-[0_22px_60px_rgba(2,6,23,0.28)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  <Wallet className="h-3.5 w-3.5" /> Günlük kasa modu
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Gelir / gider günlük kasa raporu</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">Kasaya giren para, kasadan çıkan gider, avans ve gün sonu aktarımı tek ekranda takip edilir.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={reservationDateFilter}
                  onChange={(event) => setReservationDateFilter(event.target.value)}
                  className="h-10 rounded-2xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
                />
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">{dailyReport.shiftLabel}</span>
                <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${dailyReport.shiftTone === 'Kontrol altında' ? 'bg-emerald-500/12 text-emerald-200' : 'bg-amber-500/12 text-amber-200'}`}>{dailyReport.shiftTone}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.22fr_0.88fr]">
              <div className="space-y-4">
                <article className="rounded-[1.25rem] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.92),rgba(15,23,42,0.98))] p-4 shadow-[0_18px_48px_rgba(6,78,118,0.22)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Gün sonu teslim özeti</p>
                      <p className="mt-1 text-xs text-cyan-100/75">Kasiyerin kapanışta teslim edeceği tutarlar ve günün satış özeti.</p>
                    </div>
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                      {reservationDateFilter}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Nakit teslim', value: formatTRY(dailyReport.cashHandover), tone: 'text-emerald-200' },
                      { label: 'POS teslim', value: formatTRY(dailyReport.posHandover), tone: 'text-blue-200' },
                      { label: 'Euro teslim', value: formatTRY(dailyReport.euroHandover), tone: 'text-cyan-200' },
                      { label: 'Dolar teslim', value: formatTRY(dailyReport.dollarHandover), tone: 'text-lime-200' },
                      { label: 'Banka teslim', value: formatTRY(dailyReport.bankHandover), tone: 'text-violet-200' },
                      { label: 'Günlük ciro', value: formatTRY(dailyReport.dailyTurnover), tone: 'text-cyan-100' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{item.label}</p>
                        <p className={`mt-2 text-2xl font-semibold tracking-tight ${item.tone}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Günlük ciro', value: formatTRY(dailyReport.dailyTurnover), note: 'Kapanmış adisyon + teslim edilmiş paket servis', icon: TrendingUp, tone: 'emerald' },
                    { label: 'Toplam tahsilat', value: formatTRY(dailyReport.totalCollections), note: 'Satış tahsilatı + cari tahsilat', icon: BarChart3, tone: 'blue' },
                    { label: 'Nakit teslim', value: formatTRY(dailyReport.cashHandover), note: 'Kasiyerin elde teslim edeceği nakit', icon: Wallet, tone: 'amber' },
                    { label: 'POS teslim', value: formatTRY(dailyReport.posHandover), note: 'POS cihaz toplamı', icon: ShieldCheck, tone: 'violet' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <article key={item.label} className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-400">{item.label}</p>
                            <p className="mt-2 text-xl font-semibold tracking-tight text-white">{item.value}</p>
                          </div>
                          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${item.tone === 'emerald' ? 'bg-emerald-500/12 text-emerald-200' : item.tone === 'blue' ? 'bg-blue-500/12 text-blue-200' : item.tone === 'violet' ? 'bg-violet-500/12 text-violet-200' : 'bg-amber-500/12 text-amber-200'}`}><Icon className="h-5 w-5" /></span>
                        </div>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.note}</p>
                      </article>
                    );
                  })}
                </div>

                <article className="rounded-[1.25rem] border border-white/10 bg-[#0B1220] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Kapanış özeti</p>
                      <p className="mt-1 text-xs text-slate-400">Kasiyerin gün sonunda teslim edeceği ve kontrol edeceği temel kalemler.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">Kasa özeti</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {[
                      { label: 'Nakit tahsilat', value: dailyReport.cashCollections, note: 'Adisyon + paket servis nakit', tone: 'emerald' },
                      { label: 'Cari tahsilat', value: dailyReport.accountCollections, note: 'Cari kapatma ve cari ödemelerden gelen tahsilat', tone: 'amber' },
                      { label: 'Euro tahsilat', value: dailyReport.euroCollections, note: 'Döviz ödeme yöntemiyle kapanan adisyonlar', tone: 'blue' },
                      { label: 'Dolar tahsilat', value: dailyReport.dollarCollections, note: 'Döviz ödeme yöntemiyle kapanan adisyonlar', tone: 'emerald' },
                      { label: 'Cari ödeme', value: dailyReport.accountPayments, note: 'Tedarikçi, personel, ortak veya müşteri hareketi', tone: 'amber' },
                      { label: 'Banka teslim', value: dailyReport.bankHandover, note: 'Banka gecen net hareket', tone: 'violet' },
                      { label: 'Gider çıkışı', value: dailyReport.dailyExpense, note: 'Kasadan ödenen günlük giderler', tone: 'amber' },
                      { label: 'Ana kasa aktarımı', value: dailyReport.dayEndTransfer, note: 'Gün sonunda devredilen tutar', tone: 'violet' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                        <p className={`mt-2 text-xl font-semibold ${item.tone === 'emerald' ? 'text-emerald-200' : item.tone === 'blue' ? 'text-blue-200' : item.tone === 'amber' ? 'text-amber-200' : 'text-violet-200'}`}>{formatTRY(item.value)}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="rounded-[1.25rem] border border-white/10 bg-[#0B1220] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Günlük kasa hareketleri</p>
                    <p className="mt-1 text-xs text-slate-400">Gelir girişleri, gider ödemeleri ve gün sonu aktarımı burada takip edilir.</p>
                  </div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-200"><ShieldCheck className="h-5 w-5" /></span>
                </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  </div>
                  <div className="mt-4 rounded-[1rem] border border-emerald-400/20 bg-emerald-500/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Günlük kasa</p>
                        <p className="mt-1 text-xs text-slate-300">Bu alan sadece fiziki nakdi gosterir. POS ve banka teslimleri ayri takip edilir.</p>
                      </div>
                      <p className="text-lg font-semibold text-emerald-200">{formatTRY(dailyReport.netDailyCash)}</p>
                    </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input value={dailyAdvanceInput} onChange={(event) => setDailyAdvanceInput(event.target.value)} placeholder="Kasa avansı" className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" />
                    <button type="button" onClick={() => addDailyCashMovement('advance')} className="h-10 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white">Avans gir</button>
                    <input value={dailyExpenseInput} onChange={(event) => setDailyExpenseInput(event.target.value)} placeholder="Günlük gider tutarı" className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" />
                    <input value={dailyExpenseNote} onChange={(event) => setDailyExpenseNote(event.target.value)} placeholder="Gider açıklaması" className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500" />
                    <button type="button" onClick={() => addDailyCashMovement('expense')} className="h-10 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white">Gider öde</button>
                    <button type="button" onClick={closeDayCash} className="h-10 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white">Gün sonu yap</button>
                  </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                      <span>Avans: {formatTRY(dailyReport.dailyAdvance)}</span>
                      <span>Gider: {formatTRY(dailyReport.dailyExpense)}</span>
                      <span>Ana kasa: {formatTRY(dailyReport.dayEndTransfer)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                      <span>Nakit teslim: {formatTRY(dailyReport.cashHandover)}</span>
                      <span>POS teslim: {formatTRY(dailyReport.posHandover)}</span>
                      <span>Banka teslim: {formatTRY(dailyReport.bankHandover)}</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1rem] border border-amber-400/20 bg-amber-500/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Cari tahsilat / ödeme</p>
                        <p className="mt-1 text-xs text-slate-300">Gunluk kasadan veya bankadan cari hareket gir, finans kartina otomatik yansisin.</p>
                      </div>
                      <div className="flex rounded-xl border border-white/10 bg-[#0B1220] p-1">
                        <button
                          type="button"
                          onClick={() => setReportAccountMode('collection')}
                          className={reportAccountMode === 'collection' ? 'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300'}
                        >
                          Tahsilat
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportAccountMode('payment')}
                          className={reportAccountMode === 'payment' ? 'rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300'}
                        >
                          Ödeme
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      <input
                        value={reportAccountSearch}
                        onChange={(event) => setReportAccountSearch(event.target.value)}
                        placeholder="Cari ara: ad, kod veya telefon"
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                      />
                      <select
                        value={selectedReportAccount?.id ?? ''}
                        onChange={(event) => setReportAccountId(event.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
                      >
                        {filteredReportAccounts.length > 0 ? filteredReportAccounts.map((account) => (
                          <option key={`${reportAccountMode}-${account.id}`} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        )) : (
                          <option value="">Cari bulunamadi</option>
                        )}
                      </select>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                        <span>{filteredReportAccounts.length} cari listelendi</span>
                        <button
                          type="button"
                          onClick={() => setShowQuickAccountForm((current) => !current)}
                          className="rounded-full border border-white/10 bg-[#111827] px-3 py-1.5 font-semibold text-white"
                        >
                          {showQuickAccountForm ? 'Hızlı cari alanını kapat' : 'Hızlı yeni cari aç'}
                        </button>
                      </div>
                    </div>

                    {showQuickAccountForm ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-[#0B1220] p-3">
                        <p className="text-sm font-semibold text-white">Hızlı cari kartı</p>
                        <p className="mt-1 text-xs text-slate-400">Temel bilgileri gir, cari kart hemen oluşsun ve seçili hale gelsin.</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input
                            value={quickAccountName}
                            onChange={(event) => setQuickAccountName(event.target.value)}
                            placeholder="Cari adı"
                            className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 sm:col-span-2"
                          />
                          <input
                            value={quickAccountPhone}
                            onChange={(event) => setQuickAccountPhone(event.target.value)}
                            placeholder="Telefon"
                            className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                          />
                          <select
                            value={quickAccountType}
                            onChange={(event) => setQuickAccountType(event.target.value as typeof quickAccountType)}
                            className="h-10 rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                          >
                            <option value="customer">Müşteri</option>
                            <option value="supplier">Tedarikçi</option>
                            <option value="partner">Ortak</option>
                            <option value="staff">Personel</option>
                          </select>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={createQuickReportAccount}
                            className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
                          >
                            Cari kartı oluştur
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        value={reportAccountAmount}
                        onChange={(event) => setReportAccountAmount(event.target.value)}
                        placeholder={reportAccountMode === 'collection' ? 'Tahsilat tutarı' : 'Ödeme tutarı'}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                      />
                      <select
                        value={reportAccountMethod}
                        onChange={(event) => setReportAccountMethod(event.target.value as typeof reportAccountMethod)}
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none"
                      >
                        <option value="cash">Nakit</option>
                        <option value="card">Kart / POS</option>
                        <option value="bank">Banka</option>
                      </select>
                      <input
                        value={reportAccountNote}
                        onChange={(event) => setReportAccountNote(event.target.value)}
                        placeholder="Aciklama / fis notu"
                        className="h-10 rounded-xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 sm:col-span-2"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-300">
                        {selectedReportAccount ? `${selectedReportAccount.name} seçili` : 'Önce cari seç'}
                      </p>
                      <button
                        type="button"
                        onClick={addDailyAccountMovement}
                        className={reportAccountMode === 'collection' ? 'h-10 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950' : 'h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white'}
                      >
                        {reportAccountMode === 'collection' ? 'Cari tahsilat işle' : 'Cari ödeme işle'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Hareket listesi</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['all', 'Tümü'],
                        ['cash', 'Nakit'],
                        ['card', 'POS'],
                        ['account', 'Cari'],
                        ['meal', 'Yemek kartı'],
                        ['euro', 'Euro'],
                        ['dollar', 'Dolar'],
                        ['delivery', 'Paket'],
                        ['manual', 'Manuel'],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setReportMethodFilter(id as typeof reportMethodFilter)}
                          className={reportMethodFilter === id ? 'rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white' : 'rounded-full border border-white/10 bg-[#111827] px-3 py-1 text-xs font-semibold text-slate-300'}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {reportLedgerRows.length > 0 ? reportLedgerRows.slice(0, 12).map((movement) => (
                      <div key={movement.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111827] px-3 py-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{movement.label}</p>
                            {movement.methodLabel ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  movement.methodLabel === 'Nakit'
                                    ? 'bg-emerald-500/12 text-emerald-200'
                                    : movement.methodLabel === 'POS'
                                      ? 'bg-blue-500/12 text-blue-200'
                                      : movement.methodLabel === 'Banka'
                                        ? 'bg-violet-500/12 text-violet-200'
                                        : movement.methodLabel === 'Yemek kartı'
                                          ? 'bg-amber-500/12 text-amber-200'
                                          : movement.methodLabel === 'Euro'
                                            ? 'bg-cyan-500/12 text-cyan-200'
                                            : movement.methodLabel === 'Dolar'
                                              ? 'bg-lime-500/12 text-lime-200'
                                              : 'bg-white/8 text-slate-200'
                                }`}
                              >
                                {movement.methodLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">{movement.time} · {movement.note}</p>
                        </div>
                        <p className={`text-sm font-semibold ${movement.direction === 'out' ? 'text-rose-200' : 'text-emerald-200'}`}>
                          {movement.direction === 'out' ? '-' : '+'}{formatTRY(movement.amount)}
                        </p>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-slate-400">
                        Seçili tarih ve filtre için kasa hareketi yok.
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </div>
          </section>
          ) : null}
          {activeTab === 'overview' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-amber-500/8 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Çalışma tarihi</p>
                  <p className="mt-1 text-xs text-slate-300">Masa görünümü bu tarihteki rezervasyonları grid üzerinde gösterir.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-full border border-amber-300/20 bg-[#0B1220] px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Rezervasyon günü</span>
                  <input
                    type="date"
                    value={reservationDateFilter}
                    onChange={(event) => setReservationDateFilter(event.target.value)}
                    className="h-9 rounded-xl border border-amber-300/20 bg-[#111827] px-3 text-sm font-semibold text-white outline-none"
                  />
                </div>
              </div>
              <TableFilters
                status={status}
                onStatusChange={setStatus}
                group={group}
                onGroupChange={setGroup}
                search={search}
                onSearchChange={setSearch}
                groups={[...FIXED_GROUPS]}
                counts={counts}
              />
            </div>
          ) : null}

          {activeTab === 'overview' && actionMode ? (
            <section className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(135deg,#15122f,#0f172a)] p-4 shadow-[0_14px_36px_rgba(76,29,149,0.24)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/18 text-violet-100">
                    {actionMode.type === 'move' ? <ArrowRightLeft className="h-5 w-5" /> : <GitMerge className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {actionMode.type === 'move' ? 'Masa taşıma modu' : 'Masa birleştirme modu'}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      Kaynak masa: <span className="font-semibold text-white">{displayTableRows.find((table) => table.id === actionMode.sourceId)?.name}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Hedef masayı kartın içinden seç. Uygun hedefler yeşil halka ile işaretlenir.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActionMode(null)}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/12"
                >
                  <X className="h-4 w-4" /> Modu kapat
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' && mergeSelectionPanel ? (
            <section className="rounded-2xl border border-emerald-300/20 bg-[linear-gradient(135deg,#0f2f2a,#0f172a)] p-4 shadow-[0_14px_36px_rgba(16,185,129,0.18)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Ürün seçerek masa birleştir</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Kaynak: <span className="font-semibold text-white">{displayTableRows.find((table) => table.id === mergeSelectionPanel.sourceId)?.name}</span>
                    {' '}→ Hedef: <span className="font-semibold text-white">{displayTableRows.find((table) => table.id === mergeSelectionPanel.targetId)?.name}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMergeSelectionPanel(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/12"
                >
                  <X className="h-4 w-4" /> Vazgeç
                </button>
              </div>

              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-[#0B1220]/72 p-2">
                {(ordersByTable[mergeSelectionPanel.sourceId] ?? []).map((line) => (
                  <label key={`floor-merge-line-${line.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{line.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{line.qty} adet · {formatTRY(line.qty * line.price)}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={mergeSelectionPanel.selected[line.id] ?? true}
                      onChange={(event) => updateMergeLineSelection(line.id, event.target.checked)}
                      className="h-5 w-5 rounded border-slate-500 bg-slate-950 text-emerald-500"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">Seçilmeyen ürünler kaynak masada kalır.</p>
                <button
                  type="button"
                  onClick={confirmSelectedMerge}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(16,185,129,0.2)] transition hover:bg-emerald-500"
                >
                  Seçilenleri aktar
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' && noteTable ? (
            <section className="rounded-2xl border border-slate-800 bg-[#111827] p-4 shadow-[0_14px_36px_rgba(2,6,23,0.2)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{noteTable.name} hızlı bilgi paneli</p>
                  <p className="mt-1 text-xs text-slate-400">Masa içi bilgiler sade tutulur: kişi sayısı ve masa notu.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNoteTableId(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033]"
                >
                  <X className="h-4 w-4" /> Kapat
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]">
                <input
                  value={noteDraft.guests}
                  onChange={(event) => setNoteDraft((current) => ({ ...current, guests: event.target.value }))}
                  inputMode="numeric"
                  placeholder="Misafir sayısı"
                  className="h-11 rounded-2xl border border-white/10 bg-[#0B1220] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                />
                <textarea
                  value={noteDraft.note}
                  onChange={(event) => setNoteDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Hızlı masa notu"
                  className="min-h-[90px] rounded-2xl border border-white/10 bg-[#0B1220] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">Rezervasyon işlemleri üstteki ayrı panelden yapılır.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteTableId(null)}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-[#0B1220] px-4 text-sm font-semibold text-slate-200 transition hover:bg-[#172033]"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={saveQuickNote}
                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] transition hover:bg-blue-500"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' ? (
            <>
              <TablesGrid
                tables={filteredTables}
                actionMode={actionMode?.type ?? null}
                actionSourceId={actionMode?.sourceId ?? null}
                getIsTargetCandidate={isTargetCandidate}
                onSelect={handleSelectTable}
                onQuickPayment={(tableId) => router.push(`/orders?tableId=${tableId}&payment=1`)}
                onQuickClear={quickClearTable}
                onQuickNote={openQuickNote}
                onQuickMove={(tableId) => startAction('move', tableId)}
                onQuickMerge={(tableId) => startAction('merge', tableId)}
                onDragMove={handleDragMove}
              />

              <section className="rounded-2xl border border-slate-800 bg-[#111827] px-4 py-3">
                <p className="text-sm font-semibold text-white">Son durum</p>
                <p className="mt-1 text-xs text-slate-400">{actionMessage}</p>
                {orderSyncDiagnostics ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Sunucu açık adisyon: {orderSyncDiagnostics.openOrderCount ?? 0} ·
                    Sunucu satır: {orderSyncDiagnostics.openItemCount ?? 0} ·
                    Görünen masa: {orderSyncDiagnostics.visibleTableCount ?? 0} ·
                    Görünen satır: {orderSyncDiagnostics.visibleLineCount ?? 0} ·
                    Patch: {FLOOR_SYNC_PATCH_ID}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
      </>
    </div>
  );
}

