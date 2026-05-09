export type OpenBottleEntry = {
  id: string;
  openedAt: string;
  remainingMl: number;
};

export type AlcoholTrackingState = {
  bottleVolumeCl: number;
  portionVolumeCl: number;
  sealedBottleCount: number;
  openBottles: OpenBottleEntry[];
  dispensedPortions: number;
};

export type AlcoholConsumptionResult = {
  ok: boolean;
  state: AlcoholTrackingState;
  consumedMl: number;
  consumedPortions: number;
  shortageMl: number;
  openedBottleIds: string[];
};

export type AlcoholVariance = {
  expectedRemainingMl: number;
  actualRemainingMl: number;
  varianceMl: number;
  variancePercent: number;
  status: 'ok' | 'warning' | 'critical';
};

export function clToMl(value: number) {
  return Math.max(0, value) * 10;
}

export function mlToCl(value: number) {
  return Math.max(0, value) / 10;
}

export function getPortionsPerBottle(bottleVolumeCl: number, portionVolumeCl: number) {
  if (bottleVolumeCl <= 0 || portionVolumeCl <= 0) return 0;
  return bottleVolumeCl / portionVolumeCl;
}

export function buildInitialAlcoholState(params: {
  bottleVolumeCl: number;
  portionVolumeCl: number;
  sealedBottleCount: number;
  openBottles?: OpenBottleEntry[];
  dispensedPortions?: number;
}): AlcoholTrackingState {
  const bottleVolumeCl = Math.max(0, params.bottleVolumeCl);
  const portionVolumeCl = Math.max(0, params.portionVolumeCl);
  const sealedBottleCount = Math.max(0, params.sealedBottleCount);
  const openBottles = (params.openBottles ?? [])
    .filter((item) => item.remainingMl > 0)
    .map((item) => ({ ...item, remainingMl: Math.max(0, item.remainingMl) }))
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));

  return {
    bottleVolumeCl,
    portionVolumeCl,
    sealedBottleCount,
    openBottles,
    dispensedPortions: Math.max(0, params.dispensedPortions ?? 0),
  };
}

export function getActualRemainingMl(state: AlcoholTrackingState) {
  const bottleMl = clToMl(state.bottleVolumeCl);
  return (Math.max(0, state.sealedBottleCount) * bottleMl) + state.openBottles.reduce((sum, item) => sum + Math.max(0, item.remainingMl), 0);
}

export function getExpectedRemainingMl(state: AlcoholTrackingState) {
  const totalInitialMl = getActualRemainingMl({ ...state, dispensedPortions: 0 });
  const consumedMl = clToMl(state.portionVolumeCl) * Math.max(0, state.dispensedPortions);
  return Math.max(0, totalInitialMl - consumedMl);
}

export function consumePortionsFIFO(state: AlcoholTrackingState, portionsToConsume: number): AlcoholConsumptionResult {
  const bottleMl = clToMl(state.bottleVolumeCl);
  const portionMl = clToMl(state.portionVolumeCl);
  const requestedPortions = Math.max(0, portionsToConsume);
  const requestedMl = requestedPortions * portionMl;

  if (bottleMl <= 0 || portionMl <= 0 || requestedMl <= 0) {
    return {
      ok: requestedMl === 0,
      state,
      consumedMl: 0,
      consumedPortions: 0,
      shortageMl: requestedMl,
      openedBottleIds: [],
    };
  }

  const nextState: AlcoholTrackingState = {
    ...state,
    openBottles: [...state.openBottles].sort((a, b) => a.openedAt.localeCompare(b.openedAt)).map((item) => ({ ...item })),
  };

  let remainingMl = requestedMl;
  const openedBottleIds: string[] = [];

  const consumeFromBottle = (index: number) => {
    if (!nextState.openBottles[index] || remainingMl <= 0) return;
    const bottle = nextState.openBottles[index];
    const consumed = Math.min(bottle.remainingMl, remainingMl);
    bottle.remainingMl -= consumed;
    remainingMl -= consumed;
  };

  while (remainingMl > 0) {
    const firstOpenIndex = nextState.openBottles.findIndex((item) => item.remainingMl > 0);

    if (firstOpenIndex >= 0) {
      consumeFromBottle(firstOpenIndex);
      nextState.openBottles = nextState.openBottles.filter((item) => item.remainingMl > 0);
      continue;
    }

    if (nextState.sealedBottleCount <= 0) break;

    const newBottle: OpenBottleEntry = {
      id: `open-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      openedAt: new Date().toISOString(),
      remainingMl: bottleMl,
    };
    openedBottleIds.push(newBottle.id);
    nextState.openBottles.push(newBottle);
    nextState.sealedBottleCount -= 1;
  }

  nextState.openBottles = nextState.openBottles.filter((item) => item.remainingMl > 0);

  const consumedMl = requestedMl - remainingMl;
  const consumedPortions = portionMl > 0 ? consumedMl / portionMl : 0;
  nextState.dispensedPortions = Math.max(0, state.dispensedPortions) + consumedPortions;

  return {
    ok: remainingMl <= 0.0001,
    state: nextState,
    consumedMl,
    consumedPortions,
    shortageMl: Math.max(0, remainingMl),
    openedBottleIds,
  };
}

export function consumeOpenBottlePortionsOnly(state: AlcoholTrackingState, portionsToConsume: number): AlcoholConsumptionResult {
  const portionMl = clToMl(state.portionVolumeCl);
  const requestedPortions = Math.max(0, portionsToConsume);
  const requestedMl = requestedPortions * portionMl;

  if (portionMl <= 0 || requestedMl <= 0) {
    return {
      ok: requestedMl === 0,
      state,
      consumedMl: 0,
      consumedPortions: 0,
      shortageMl: requestedMl,
      openedBottleIds: [],
    };
  }

  const nextState: AlcoholTrackingState = {
    ...state,
    openBottles: [...state.openBottles].sort((a, b) => a.openedAt.localeCompare(b.openedAt)).map((item) => ({ ...item })),
  };

  let remainingMl = requestedMl;

  const consumeFromBottle = (index: number) => {
    if (!nextState.openBottles[index] || remainingMl <= 0) return;
    const bottle = nextState.openBottles[index];
    const consumed = Math.min(bottle.remainingMl, remainingMl);
    bottle.remainingMl -= consumed;
    remainingMl -= consumed;
  };

  while (remainingMl > 0) {
    const firstOpenIndex = nextState.openBottles.findIndex((item) => item.remainingMl > 0);
    if (firstOpenIndex < 0) break;

    consumeFromBottle(firstOpenIndex);
    nextState.openBottles = nextState.openBottles.filter((item) => item.remainingMl > 0);
  }

  nextState.openBottles = nextState.openBottles.filter((item) => item.remainingMl > 0);

  const consumedMl = requestedMl - remainingMl;
  const consumedPortions = portionMl > 0 ? consumedMl / portionMl : 0;
  nextState.dispensedPortions = Math.max(0, state.dispensedPortions) + consumedPortions;

  return {
    ok: remainingMl <= 0.0001,
    state: nextState,
    consumedMl,
    consumedPortions,
    shortageMl: Math.max(0, remainingMl),
    openedBottleIds: [],
  };
}

export function analyzeAlcoholVariance(params: {
  bottleVolumeCl: number;
  portionVolumeCl: number;
  expectedPortionsSold: number;
  actualRemainingMl: number;
  initialBottleCount: number;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
}): AlcoholVariance {
  const bottleMl = clToMl(params.bottleVolumeCl);
  const portionMl = clToMl(params.portionVolumeCl);
  const soldPortions = Math.max(0, params.expectedPortionsSold);
  const initialMl = Math.max(0, params.initialBottleCount) * bottleMl;
  const expectedRemainingMl = Math.max(0, initialMl - (soldPortions * portionMl));
  const actualRemainingMl = Math.max(0, params.actualRemainingMl);
  const varianceMl = actualRemainingMl - expectedRemainingMl;
  const base = Math.max(expectedRemainingMl, 1);
  const variancePercent = (varianceMl / base) * 100;

  const warningThresholdPercent = Math.abs(params.warningThresholdPercent ?? 5);
  const criticalThresholdPercent = Math.abs(params.criticalThresholdPercent ?? 12);
  const absoluteVariancePercent = Math.abs(variancePercent);

  let status: AlcoholVariance['status'] = 'ok';
  if (absoluteVariancePercent >= criticalThresholdPercent) status = 'critical';
  else if (absoluteVariancePercent >= warningThresholdPercent) status = 'warning';

  return {
    expectedRemainingMl,
    actualRemainingMl,
    varianceMl,
    variancePercent,
    status,
  };
}
