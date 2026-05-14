'use client';

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher?: typeof Pusher;
  }
}

export type KdsConnectionState = {
  state: string;
  connected: boolean;
  at: string;
  error?: string;
};

let echoInstance: Echo<any> | null = null;
let connectionBound = false;
const connectionListeners = new Set<(state: KdsConnectionState) => void>();

function emitConnectionState(state: KdsConnectionState) {
  connectionListeners.forEach((listener) => listener(state));
}

function bindConnectionEvents() {
  if (!echoInstance || connectionBound) return;
  const pusher = (echoInstance as any)?.connector?.pusher;
  const connection = pusher?.connection;
  if (!connection) return;

  connectionBound = true;

  connection.bind('connected', () => {
    emitConnectionState({ state: 'connected', connected: true, at: new Date().toISOString() });
  });
  connection.bind('disconnected', () => {
    emitConnectionState({ state: 'disconnected', connected: false, at: new Date().toISOString() });
  });
  connection.bind('unavailable', () => {
    emitConnectionState({ state: 'unavailable', connected: false, at: new Date().toISOString() });
  });
  connection.bind('error', (err: { message?: string } | undefined) => {
    emitConnectionState({ state: 'error', connected: false, at: new Date().toISOString(), error: err?.message ?? 'WS error' });
  });
  connection.bind('state_change', (t: { previous: string; current: string }) => {
    emitConnectionState({ state: t.current, connected: t.current === 'connected', at: new Date().toISOString() });
  });
}

export function subscribeKdsConnectionState(callback: (state: KdsConnectionState) => void) {
  connectionListeners.add(callback);
  return () => connectionListeners.delete(callback);
}

export function getKdsEcho(): Echo<any> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = process.env.NEXT_PUBLIC_KDS_APP_KEY;
  const host = process.env.NEXT_PUBLIC_KDS_WS_HOST;

  if (!key || !host) {
    return null;
  }

  if (!window.Pusher) {
    window.Pusher = Pusher;
  }

  if (!echoInstance) {
    const scheme = process.env.NEXT_PUBLIC_KDS_WS_SCHEME ?? 'http';
    const port = Number(process.env.NEXT_PUBLIC_KDS_WS_PORT ?? (scheme === 'https' ? 443 : 6001));
    const broadcaster: 'pusher' = 'pusher';

    echoInstance = new Echo<any>({
      broadcaster,
      key,
      cluster: process.env.NEXT_PUBLIC_KDS_APP_CLUSTER ?? 'mt1',
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
    });
  }

  bindConnectionEvents();
  return echoInstance;
}

export function kdsChannelName(tenantId: string, station: string): string {
  return `tenant.${tenantId}.kds.${station}`;
}