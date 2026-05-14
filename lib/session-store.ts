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

let currentSessionState: SessionState = getDefaultSessionState();

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
  return currentSessionState;
}

export function saveSessionState(state: SessionState) {
  currentSessionState = state;
  emitChange();
}

export function hydrateSessionStateFromAuth(session: {
  tenantId: string;
  role: string;
  branchId?: string;
  packageType?: 'mini' | 'gold' | 'premium';
  subscriptionEndDate?: string;
  username?: string;
  name?: string;
} | null) {
  if (!session) {
    currentSessionState = getDefaultSessionState();
    emitChange();
    return currentSessionState;
  }

  const defaults = getDefaultSessionState();
  const activeBranchId = session.branchId && defaults.branches.some((branch) => branch.id === session.branchId)
    ? session.branchId
    : defaults.activeBranchId;
  const activeBranch = defaults.branches.find((branch) => branch.id === activeBranchId) ?? defaults.branches[0];

  currentSessionState = {
    ...defaults,
    activeBranchId,
    tenantId: session.tenantId,
    packageType: session.packageType ?? defaults.packageType,
    subscriptionEndDate: session.subscriptionEndDate ?? defaults.subscriptionEndDate,
    isAuthenticated: true,
    currentUser: {
      ...defaults.currentUser,
      name: session.name ?? defaults.currentUser.name,
      username: session.username ?? defaults.currentUser.username,
      role: session.role,
      branch: activeBranch.label,
      branchId: activeBranch.id,
      tenantId: session.tenantId,
      packageType: session.packageType ?? defaults.packageType,
    },
  };

  emitChange();
  return currentSessionState;
}

export function clearSessionState() {
  currentSessionState = getDefaultSessionState();
  emitChange();
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
  const onCustom = () => callback();
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
