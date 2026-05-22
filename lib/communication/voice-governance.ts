import { buildAiOperationsSnapshot } from '@/lib/ai-operations/governance';
import { buildMonetizationGovernanceSnapshot } from '@/lib/monetization/governance';
import { buildScaleReadinessSnapshot } from '@/lib/operations/scale-readiness';

export type CallLifecycleState =
  | 'incoming'
  | 'outgoing'
  | 'routing'
  | 'ai_takeover'
  | 'human_takeover'
  | 'transferring'
  | 'reconnecting'
  | 'retrying'
  | 'completed'
  | 'failed';

export type PbxProvider = 'verimor' | 'sip_bridge' | 'manual_provider';

export type CommunicationOwner =
  | 'voice-runtime'
  | 'pbx-governance'
  | 'runtime-session-engine'
  | 'tenant-runtime-context'
  | 'ai-sales-operations'
  | 'communication-observability'
  | 'usage-metering';

export type CallLifecycleRule = {
  state: CallLifecycleState;
  owner: CommunicationOwner;
  allowedTransitions: CallLifecycleState[];
  auditRequired: boolean;
  boundedRetry: boolean;
};

export type PbxOwnershipRule = {
  provider: PbxProvider;
  scope: 'tenant' | 'branch' | 'trunk' | 'extension' | 'did';
  runtimeOwner: CommunicationOwner;
  reconnectOwner: CommunicationOwner;
  authOwner: CommunicationOwner;
  retryOwner: CommunicationOwner;
  observabilityOwner: CommunicationOwner;
};

export type VoiceSessionRule = {
  session: 'speech' | 'transcription' | 'ai_response' | 'realtime_audio_stream' | 'speech_interruption' | 'latency' | 'fallback';
  owner: CommunicationOwner;
  staleSessionGuard: string;
  recoveryBoundary: string;
};

export type AiSalesRule = {
  signal:
    | 'sales_intent_scoring'
    | 'hesitation_detection'
    | 'reservation_conversion_scoring'
    | 'objection_analysis'
    | 'call_sentiment_analysis'
    | 'call_success_analytics'
    | 'ai_sales_recommendations';
  owner: CommunicationOwner;
  measurable: boolean;
  actionBoundary: 'recommend_only' | 'operator_review_required';
};

export type RealtimeAudioRule = {
  metric:
    | 'audio_latency'
    | 'websocket_voice_throughput'
    | 'speech_interruption_timing'
    | 'reconnect_storms'
    | 'audio_buffer_pressure'
    | 'transcription_delay'
    | 'ai_response_delay';
  owner: CommunicationOwner;
  bounded: boolean;
  degradationSignal: string;
};

export type VoiceRecoveryRule = {
  failure: 'dropped_call' | 'websocket_reconnect_storm' | 'pbx_reconnect_loop' | 'stale_voice_session' | 'orphan_transcription_session' | 'failed_ai_response_stream';
  owner: CommunicationOwner;
  maxAttempts: number;
  safeAutomation: boolean;
  forbiddenAction: string;
};

export type TenantCommunicationRule = {
  scope: 'pbx_configuration' | 'ai_voice_profile' | 'sales_configuration' | 'call_limits' | 'concurrent_call_limits' | 'voice_usage_quotas' | 'transcription_quotas';
  owner: CommunicationOwner;
  tenantScoped: true;
  branchAware: boolean;
};

export type VoiceUsageMeteringRule = {
  metric: 'voice_minutes' | 'transcription_minutes' | 'ai_response_tokens' | 'realtime_websocket_throughput' | 'concurrent_calls' | 'pbx_bridge_usage';
  owner: CommunicationOwner;
  idempotencyKey: string;
  billingOwner: 'usage-metering';
  aggregation: 'tenant_daily' | 'tenant_branch_hourly';
};

export type VoiceGovernanceSnapshot = {
  generatedAt: string;
  callLifecycle: CallLifecycleRule[];
  pbxOwnership: PbxOwnershipRule[];
  voiceSessions: VoiceSessionRule[];
  aiSalesOperations: AiSalesRule[];
  realtimeAudio: RealtimeAudioRule[];
  recoveryGovernance: VoiceRecoveryRule[];
  tenantCommunication: TenantCommunicationRule[];
  usageMetering: VoiceUsageMeteringRule[];
  readiness: {
    pbxOwnershipExists: boolean;
    callLifecycleOwned: boolean;
    voiceSessionOwned: boolean;
    aiSalesTelemetryOwned: boolean;
    reconnectGovernanceBounded: boolean;
    tenantPbxOwned: boolean;
    voiceObservabilityOwned: boolean;
    communicationRecoveryGoverned: boolean;
  };
};

export function getCallLifecycleRules(): CallLifecycleRule[] {
  return [
    { state: 'incoming', owner: 'voice-runtime', allowedTransitions: ['routing', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'outgoing', owner: 'voice-runtime', allowedTransitions: ['routing', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'routing', owner: 'pbx-governance', allowedTransitions: ['ai_takeover', 'human_takeover', 'transferring', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'ai_takeover', owner: 'ai-sales-operations', allowedTransitions: ['human_takeover', 'transferring', 'reconnecting', 'completed', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'human_takeover', owner: 'voice-runtime', allowedTransitions: ['transferring', 'completed', 'failed'], auditRequired: true, boundedRetry: false },
    { state: 'transferring', owner: 'pbx-governance', allowedTransitions: ['human_takeover', 'reconnecting', 'completed', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'reconnecting', owner: 'voice-runtime', allowedTransitions: ['ai_takeover', 'human_takeover', 'retrying', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'retrying', owner: 'voice-runtime', allowedTransitions: ['routing', 'failed'], auditRequired: true, boundedRetry: true },
    { state: 'completed', owner: 'communication-observability', allowedTransitions: [], auditRequired: true, boundedRetry: false },
    { state: 'failed', owner: 'communication-observability', allowedTransitions: ['retrying'], auditRequired: true, boundedRetry: true },
  ];
}

export function getPbxOwnershipRules(): PbxOwnershipRule[] {
  return [
    { provider: 'verimor', scope: 'tenant', runtimeOwner: 'pbx-governance', reconnectOwner: 'voice-runtime', authOwner: 'runtime-session-engine', retryOwner: 'voice-runtime', observabilityOwner: 'communication-observability' },
    { provider: 'verimor', scope: 'branch', runtimeOwner: 'tenant-runtime-context', reconnectOwner: 'voice-runtime', authOwner: 'runtime-session-engine', retryOwner: 'voice-runtime', observabilityOwner: 'communication-observability' },
    { provider: 'sip_bridge', scope: 'trunk', runtimeOwner: 'pbx-governance', reconnectOwner: 'voice-runtime', authOwner: 'runtime-session-engine', retryOwner: 'voice-runtime', observabilityOwner: 'communication-observability' },
    { provider: 'sip_bridge', scope: 'extension', runtimeOwner: 'pbx-governance', reconnectOwner: 'voice-runtime', authOwner: 'runtime-session-engine', retryOwner: 'voice-runtime', observabilityOwner: 'communication-observability' },
    { provider: 'manual_provider', scope: 'did', runtimeOwner: 'pbx-governance', reconnectOwner: 'voice-runtime', authOwner: 'runtime-session-engine', retryOwner: 'voice-runtime', observabilityOwner: 'communication-observability' },
  ];
}

export function getVoiceSessionRules(): VoiceSessionRule[] {
  return [
    { session: 'speech', owner: 'voice-runtime', staleSessionGuard: 'speech session expires by callId and tenantId watermark', recoveryBoundary: 'close stream without mutating call business data' },
    { session: 'transcription', owner: 'voice-runtime', staleSessionGuard: 'orphan transcription session rejected after bounded idle window', recoveryBoundary: 'invalidate transcript stream and preserve call audit' },
    { session: 'ai_response', owner: 'ai-sales-operations', staleSessionGuard: 'AI response stream must match active call revision', recoveryBoundary: 'fallback to human handoff recommendation' },
    { session: 'realtime_audio_stream', owner: 'voice-runtime', staleSessionGuard: 'audio stream is owned by active call connection id', recoveryBoundary: 'bounded reconnect only' },
    { session: 'speech_interruption', owner: 'ai-sales-operations', staleSessionGuard: 'barge-in event must match active AI turn id', recoveryBoundary: 'stop current AI response and keep session alive' },
    { session: 'latency', owner: 'communication-observability', staleSessionGuard: 'latency samples expire by rolling window', recoveryBoundary: 'emit degradation signal only' },
    { session: 'fallback', owner: 'voice-runtime', staleSessionGuard: 'fallback cannot create duplicate call ownership', recoveryBoundary: 'operator review required for repeated fallback' },
  ];
}

export function getAiSalesRules(): AiSalesRule[] {
  return [
    { signal: 'sales_intent_scoring', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'recommend_only' },
    { signal: 'hesitation_detection', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'recommend_only' },
    { signal: 'reservation_conversion_scoring', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'operator_review_required' },
    { signal: 'objection_analysis', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'recommend_only' },
    { signal: 'call_sentiment_analysis', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'recommend_only' },
    { signal: 'call_success_analytics', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'operator_review_required' },
    { signal: 'ai_sales_recommendations', owner: 'ai-sales-operations', measurable: true, actionBoundary: 'operator_review_required' },
  ];
}

export function getRealtimeAudioRules(): RealtimeAudioRule[] {
  return [
    { metric: 'audio_latency', owner: 'communication-observability', bounded: true, degradationSignal: 'audio latency above tenant voice SLA' },
    { metric: 'websocket_voice_throughput', owner: 'communication-observability', bounded: true, degradationSignal: 'voice websocket throughput above branch baseline' },
    { metric: 'speech_interruption_timing', owner: 'ai-sales-operations', bounded: true, degradationSignal: 'speech interruption timing delayed' },
    { metric: 'reconnect_storms', owner: 'voice-runtime', bounded: true, degradationSignal: 'voice reconnect storm detected and throttled' },
    { metric: 'audio_buffer_pressure', owner: 'voice-runtime', bounded: true, degradationSignal: 'audio buffer pressure near overflow' },
    { metric: 'transcription_delay', owner: 'communication-observability', bounded: true, degradationSignal: 'transcription delay affects call intelligence' },
    { metric: 'ai_response_delay', owner: 'ai-sales-operations', bounded: true, degradationSignal: 'AI response delay affects conversion' },
  ];
}

export function getVoiceRecoveryRules(): VoiceRecoveryRule[] {
  return [
    { failure: 'dropped_call', owner: 'voice-runtime', maxAttempts: 2, safeAutomation: true, forbiddenAction: 'never recreate a completed call as billable without idempotency' },
    { failure: 'websocket_reconnect_storm', owner: 'voice-runtime', maxAttempts: 3, safeAutomation: true, forbiddenAction: 'never bypass tenant voice limits' },
    { failure: 'pbx_reconnect_loop', owner: 'pbx-governance', maxAttempts: 3, safeAutomation: true, forbiddenAction: 'never rotate PBX credentials automatically' },
    { failure: 'stale_voice_session', owner: 'voice-runtime', maxAttempts: 1, safeAutomation: true, forbiddenAction: 'never delete call audit trail' },
    { failure: 'orphan_transcription_session', owner: 'voice-runtime', maxAttempts: 1, safeAutomation: true, forbiddenAction: 'never attach transcript to a different tenant' },
    { failure: 'failed_ai_response_stream', owner: 'ai-sales-operations', maxAttempts: 2, safeAutomation: true, forbiddenAction: 'never send unreviewed sales promise after stream failure' },
  ];
}

export function getTenantCommunicationRules(): TenantCommunicationRule[] {
  return [
    { scope: 'pbx_configuration', owner: 'tenant-runtime-context', tenantScoped: true, branchAware: true },
    { scope: 'ai_voice_profile', owner: 'tenant-runtime-context', tenantScoped: true, branchAware: true },
    { scope: 'sales_configuration', owner: 'tenant-runtime-context', tenantScoped: true, branchAware: true },
    { scope: 'call_limits', owner: 'tenant-runtime-context', tenantScoped: true, branchAware: false },
    { scope: 'concurrent_call_limits', owner: 'tenant-runtime-context', tenantScoped: true, branchAware: true },
    { scope: 'voice_usage_quotas', owner: 'usage-metering', tenantScoped: true, branchAware: true },
    { scope: 'transcription_quotas', owner: 'usage-metering', tenantScoped: true, branchAware: true },
  ];
}

export function getVoiceUsageMeteringRules(): VoiceUsageMeteringRule[] {
  return [
    { metric: 'voice_minutes', owner: 'usage-metering', idempotencyKey: 'tenantId:callId:voiceMinutes:period', billingOwner: 'usage-metering', aggregation: 'tenant_branch_hourly' },
    { metric: 'transcription_minutes', owner: 'usage-metering', idempotencyKey: 'tenantId:callId:transcriptionMinutes:period', billingOwner: 'usage-metering', aggregation: 'tenant_branch_hourly' },
    { metric: 'ai_response_tokens', owner: 'usage-metering', idempotencyKey: 'tenantId:callId:aiTurnId:model', billingOwner: 'usage-metering', aggregation: 'tenant_daily' },
    { metric: 'realtime_websocket_throughput', owner: 'usage-metering', idempotencyKey: 'tenantId:voiceSocketId:window', billingOwner: 'usage-metering', aggregation: 'tenant_branch_hourly' },
    { metric: 'concurrent_calls', owner: 'usage-metering', idempotencyKey: 'tenantId:branchId:concurrencyWindow', billingOwner: 'usage-metering', aggregation: 'tenant_branch_hourly' },
    { metric: 'pbx_bridge_usage', owner: 'usage-metering', idempotencyKey: 'tenantId:pbxProvider:bridgeSessionId', billingOwner: 'usage-metering', aggregation: 'tenant_daily' },
  ];
}

export function buildVoiceGovernanceSnapshot(): VoiceGovernanceSnapshot {
  const ai = buildAiOperationsSnapshot();
  const monetization = buildMonetizationGovernanceSnapshot();
  const scale = buildScaleReadinessSnapshot();

  void ai;
  void monetization;
  void scale;

  const pbxOwnership = getPbxOwnershipRules();
  const callLifecycle = getCallLifecycleRules();
  const voiceSessions = getVoiceSessionRules();
  const aiSalesOperations = getAiSalesRules();
  const realtimeAudio = getRealtimeAudioRules();
  const recoveryGovernance = getVoiceRecoveryRules();
  const tenantCommunication = getTenantCommunicationRules();

  return {
    generatedAt: new Date().toISOString(),
    callLifecycle,
    pbxOwnership,
    voiceSessions,
    aiSalesOperations,
    realtimeAudio,
    recoveryGovernance,
    tenantCommunication,
    usageMetering: getVoiceUsageMeteringRules(),
    readiness: {
      pbxOwnershipExists: pbxOwnership.some((rule) => rule.provider === 'verimor') && pbxOwnership.some((rule) => rule.provider === 'sip_bridge'),
      callLifecycleOwned: callLifecycle.every((rule) => rule.auditRequired),
      voiceSessionOwned: voiceSessions.every((rule) => Boolean(rule.owner)),
      aiSalesTelemetryOwned: aiSalesOperations.every((rule) => rule.measurable),
      reconnectGovernanceBounded: recoveryGovernance.every((rule) => rule.maxAttempts > 0 && rule.maxAttempts <= 3),
      tenantPbxOwned: tenantCommunication.some((rule) => rule.scope === 'pbx_configuration' && rule.tenantScoped),
      voiceObservabilityOwned: realtimeAudio.every((rule) => rule.bounded),
      communicationRecoveryGoverned: recoveryGovernance.every((rule) => rule.safeAutomation && rule.forbiddenAction.length > 0),
    },
  };
}
