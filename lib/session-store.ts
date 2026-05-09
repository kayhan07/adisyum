'use client';

export type BranchOption = {
  id: string;
  label: string;
  type: string;
  address: string;
};

export type SessionUser = {
  name: string;
  username?: string;
  role: string;
  branch: string;
  branchId?: string;
  tenantId?: string;
  packageType?: 'mini' | 'gold' | 'premium';
  discountLimitRate: number;
  canUseRoundingDiscount: boolean;
};

export type SessionState = {
  branches: BranchOption[];
  activeBranchId: string;
  currentUser: SessionUser;
  tenantId: string;
  packageType: 'mini' | 'gold' | 'premium';
  subscriptionEndDate: string;
  isAuthenticated: boolean;
};

const STORAGE_KEY = 'adisyon-session-state';
const EVENT_NAME = 'adisyon-session-state:changed';

const DEFAULT_BRANCHES: BranchOption[] = [
  { id: 'all', label: 'Tum Subeler', type: 'Merkez gorunum', address: 'Tum lokasyonlar birlikte izleniyor' },
  { id: 'mrk', label: 'Merkez Sube', type: 'Genel merkez', address: 'Nisantasi, Istanbul' },
  { id: 'kdy', label: 'Kadikoy Subesi', type: 'Istanbul Anadolu', address: 'Moda, Istanbul' },
  { id: 'izm', label: 'Izmir Sahil Subesi', type: 'Ege bolgesi', address: 'Alsancak, Izmir' },
];

const DEFAULT_USER: SessionUser = {
  name: 'Admin',
  username: 'admin',
  role: 'Admin',
  branch: 'Merkez Sube',
  branchId: 'mrk',
  tenantId: 'ABN-48291',
  packageType: 'premium',
  discountLimitRate: 10,
  canUseRoundingDiscount: true,
};

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getDefaultSessionState(): SessionState {
  return {
    branches: DEFAULT_BRANCHES,
    activeBranchId: 'mrk',
    currentUser: DEFAULT_USER,
    tenantId: 'ABN-48291',
    packageType: 'premium',
    subscriptionEndDate: '2027-01-01',
    isAuthenticated: false,
  };
}

export function loadSessionState() {
  if (typeof window === 'undefined') {
    return getDefaultSessionState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultSessionState();
    }

    const parsed = JSON.parse(raw) as Partial<SessionState>;
    const defaults = getDefaultSessionState();
    const branches = Array.isArray(parsed.branches) && parsed.branches.length > 0 ? parsed.branches : defaults.branches;
    const activeBranchId = branches.some((branch) => branch.id === parsed.activeBranchId) ? parsed.activeBranchId ?? defaults.activeBranchId : defaults.activeBranchId;
    const activeBranch = branches.find((branch) => branch.id === activeBranchId) ?? branches[0];
    const currentUser = parsed.currentUser
      ? {
          ...defaults.currentUser,
          ...parsed.currentUser,
          branch: parsed.currentUser.branch || activeBranch.label,
          branchId: parsed.currentUser.branchId || activeBranch.id,
          tenantId: parsed.currentUser.tenantId || parsed.tenantId || defaults.tenantId,
          packageType: parsed.currentUser.packageType || parsed.packageType || defaults.packageType,
        }
      : { ...defaults.currentUser, branch: activeBranch.label, branchId: activeBranch.id };

    return {
      branches,
      activeBranchId,
      currentUser,
      tenantId: parsed.tenantId || defaults.tenantId,
      packageType: parsed.packageType || defaults.packageType,
      subscriptionEndDate: parsed.subscriptionEndDate || defaults.subscriptionEndDate,
      isAuthenticated: Boolean(parsed.isAuthenticated),
    } satisfies SessionState;
  } catch {
    return getDefaultSessionState();
  }
}

export function saveSessionState(state: SessionState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emitChange();
  } catch {
    // ignore storage errors
  }
}

export function updateActiveBranch(activeBranchId: string) {
  const current = loadSessionState();
  const activeBranch = current.branches.find((branch) => branch.id === activeBranchId);
  if (!activeBranch) return;

  saveSessionState({
    ...current,
    activeBranchId,
    currentUser: {
      ...current.currentUser,
      branch: activeBranch.label,
      branchId: activeBranch.id,
    },
  });
}

export function updateSessionUser(user: Partial<SessionUser>) {
  const current = loadSessionState();
  saveSessionState({
    ...current,
    currentUser: {
      ...current.currentUser,
      ...user,
    },
  });
}

export function subscribeToSessionChanges(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  const onCustom = () => callback();

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
