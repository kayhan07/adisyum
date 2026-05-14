export type WaiterUxScore = {
  uxComplexityScore: number;
  waiterEfficiencyScore: number;
  peakHourPerformanceScore: number;
  trainingTimeEstimateMinutes: number;
  operationalSimplicityScore: number;
  signals: {
    orderCreationTouches: number;
    paymentTouches: number;
    tableTransferTouches: number;
    productFindTouches: number;
    touchTargetGrade: 'standard' | 'large';
    duplicatePaymentProtection: boolean;
    offlineWarning: boolean;
    mobileWaiterMode: boolean;
  };
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildWaiterUxScore(): WaiterUxScore {
  const signals = {
    orderCreationTouches: 2,
    paymentTouches: 2,
    tableTransferTouches: 2,
    productFindTouches: 1,
    touchTargetGrade: 'large' as const,
    duplicatePaymentProtection: true,
    offlineWarning: true,
    mobileWaiterMode: true,
  };

  const uxComplexityScore = clamp(100 - signals.orderCreationTouches * 5 - signals.paymentTouches * 4 - signals.tableTransferTouches * 3);
  const waiterEfficiencyScore = clamp(100 - signals.productFindTouches * 5 - signals.orderCreationTouches * 4 + 8);
  const peakHourPerformanceScore = clamp(92);
  const operationalSimplicityScore = clamp((uxComplexityScore + waiterEfficiencyScore + peakHourPerformanceScore) / 3);

  return {
    uxComplexityScore,
    waiterEfficiencyScore,
    peakHourPerformanceScore,
    trainingTimeEstimateMinutes: 15,
    operationalSimplicityScore,
    signals,
  };
}
