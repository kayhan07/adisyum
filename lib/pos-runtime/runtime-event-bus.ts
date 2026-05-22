'use client';

export type RuntimeLifecycleEvent =
  | 'mutation created'
  | 'optimistic line created'
  | 'mutation queued'
  | 'mutation committed'
  | 'mutation rolled back'
  | 'authoritative payload received'
  | 'authoritative sync applied'
  | 'runtime hydration started'
  | 'runtime hydration completed'
  | 'runtime sync subscription started'
  | 'runtime sync subscription stopped'
  | 'persistence snapshot written'
  | 'persistence snapshot restored'
  | 'stale snapshot rejected'
  | 'runtime replay queued'
  | 'cross-tab conflict prevented'
  | string;

export type RuntimeEventEnvelope = {
  id: string;
  type: RuntimeLifecycleEvent;
  channel: 'pos-runtime' | 'table-state' | 'persistence' | 'websocket' | 'diagnostics';
  timestamp: string;
  payload: Record<string, unknown>;
};

export type CrossTabSyncEvent = RuntimeEventEnvelope & {
  channel: 'persistence';
  payload: Record<string, unknown> & { scope?: string; key?: string; version?: unknown };
};

export type RuntimeEventListener = (event: RuntimeEventEnvelope) => void;

const listeners = new Set<RuntimeEventListener>();
let runtimeEventEmissionCount = 0;
let runtimeEventSuppressionCount = 0;
let lastEventFingerprint = '';
let lastEventAtMs = 0;
const MAX_RUNTIME_LISTENERS = 50;
const MAX_RUNTIME_EVENT_PAYLOAD_BYTES = 32_000;

function createEventId() {
  return `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeEventPayloadFingerprint(payload: Record<string, unknown>) {
  try {
    return JSON.stringify(payload);
  } catch {
    return 'unserializable-payload';
  }
}

export function subscribeRuntimeEvents(listener: RuntimeEventListener) {
  listeners.add(listener);
  if (listeners.size > MAX_RUNTIME_LISTENERS) {
    console.warn('[pos-runtime:event-bus] runtime listener count exceeded soft limit', {
      listenerCount: listeners.size,
      maxRuntimeListeners: MAX_RUNTIME_LISTENERS,
    });
  }
  return () => listeners.delete(listener);
}

export function emitRuntimeEvent(input: {
  type: RuntimeLifecycleEvent;
  channel?: RuntimeEventEnvelope['channel'];
  payload?: Record<string, unknown>;
}) {
  const channel = input.channel ?? 'pos-runtime';
  const payload = input.payload ?? {};
  const fingerprint = `${channel}:${input.type}:${safeEventPayloadFingerprint(payload)}`;
  const now = Date.now();
  if (fingerprint === lastEventFingerprint && now - lastEventAtMs < 25) {
    runtimeEventSuppressionCount += 1;
    return {
      id: 'suppressed-duplicate-runtime-event',
      type: 'duplicate event suppressed',
      channel,
      timestamp: new Date(now).toISOString(),
      payload: { originalType: input.type, runtimeEventSuppressionCount },
    } satisfies RuntimeEventEnvelope;
  }
  runtimeEventEmissionCount += 1;
  lastEventFingerprint = fingerprint;
  lastEventAtMs = now;
  const event: RuntimeEventEnvelope = {
    id: createEventId(),
    type: input.type,
    channel,
    timestamp: new Date().toISOString(),
    payload: {
      ...payload,
      runtimeEventEmissionCount,
      runtimeEventSuppressionCount,
      runtimeEventListenerCount: listeners.size,
    },
  };
  const payloadBytes = safeEventPayloadFingerprint(event.payload).length;
  if (payloadBytes > MAX_RUNTIME_EVENT_PAYLOAD_BYTES) {
    console.warn('[pos-runtime:event-bus] large runtime event payload', {
      type: event.type,
      channel: event.channel,
      payloadBytes,
      maxRuntimeEventPayloadBytes: MAX_RUNTIME_EVENT_PAYLOAD_BYTES,
    });
  }
  listeners.forEach((listener) => listener(event));
  return event;
}

export function getRuntimeEventBusDiagnostics() {
  return {
    runtimeEventEmissionCount,
    runtimeEventSuppressionCount,
    runtimeEventListenerCount: listeners.size,
    maxRuntimeListeners: MAX_RUNTIME_LISTENERS,
    maxRuntimeEventPayloadBytes: MAX_RUNTIME_EVENT_PAYLOAD_BYTES,
  };
}

export function isRuntimeDiagnosticsEnabled() {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_POS_DIAGNOSTICS === '1';
  const hasLocalFlag = (key: string) => {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  return (
    process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_POS_DIAGNOSTICS === '1'
    || process.env.NEXT_PUBLIC_POS_RECONCILIATION_TRACE === '1'
    || hasLocalFlag('adisyon:pos-debug-click-pipeline')
    || hasLocalFlag('adisyon:pos-trace-reconciliation')
  );
}

export function createRuntimeDiagnostics(prefix = 'adisyon-flow') {
  return (event: string, payload: Record<string, unknown>) => {
    emitRuntimeEvent({ type: event, channel: 'diagnostics', payload });
    if (!isRuntimeDiagnosticsEnabled()) return;
    console.info(`[${prefix}] ${event}`, payload);
  };
}
