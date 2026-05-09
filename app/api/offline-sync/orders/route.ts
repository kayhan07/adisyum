import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type GlobalOfflineDb = {
  offlineSyncedOrders?: unknown[];
};

const globalDb = globalThis as typeof globalThis & GlobalOfflineDb;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  if (!globalDb.offlineSyncedOrders) globalDb.offlineSyncedOrders = [];
  globalDb.offlineSyncedOrders.unshift(...orders);

  return NextResponse.json({
    success: true,
    synced: orders.length,
    total: globalDb.offlineSyncedOrders.length,
  });
}
