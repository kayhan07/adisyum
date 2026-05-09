'use client';

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher?: typeof Pusher;
  }
}

let echoInstance: Echo<any> | null = null;

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

  return echoInstance;
}

export function kdsChannelName(tenantId: string, station: string): string {
  return `tenant.${tenantId}.kds.${station}`;
}