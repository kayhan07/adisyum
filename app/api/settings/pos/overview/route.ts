import { NextResponse } from 'next/server';
import { posBackendJson } from '@/lib/server/pos-api';

export const dynamic = 'force-dynamic';

type PosOverviewCache = {
  key: string;
  expiresAt: number;
  data: unknown;
};

const globalCache = globalThis as typeof globalThis & { __posOverviewCache?: PosOverviewCache };

function parseLimit(value: string | null, defaultValue: number, maxValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(Math.floor(parsed), maxValue);
}

type DeviceIndexPayload = {
  devices?: unknown[];
  queue?: unknown;
  agents_online?: number;
};

type MappingIndexPayload = {
  data?: unknown[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const logsLimit = parseLimit(url.searchParams.get('logsLimit'), 200, 2000);
  const productsLimit = parseLimit(url.searchParams.get('productsLimit'), 500, 5000);
  const mappingsLimit = parseLimit(url.searchParams.get('mappingsLimit'), 500, 5000);
  const cacheKey = `${logsLimit}:${productsLimit}:${mappingsLimit}`;

  const now = Date.now();
  if (globalCache.__posOverviewCache && globalCache.__posOverviewCache.key === cacheKey && globalCache.__posOverviewCache.expiresAt > now) {
    return NextResponse.json(globalCache.__posOverviewCache.data);
  }

  const [devicesResult, logsResult, productsResult, mappingsResult, coverageResult] = await Promise.allSettled([
    posBackendJson<DeviceIndexPayload>('/pos/devices'),
    posBackendJson<unknown[]>('/pos/logs'),
    posBackendJson<unknown[]>('/products'),
    posBackendJson<MappingIndexPayload | unknown[]>('/product-mappings'),
    posBackendJson<unknown>('/product-mappings/coverage'),
  ]);

  const backendErrors = [devicesResult, logsResult, productsResult, mappingsResult, coverageResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : 'Bilinmeyen POS backend hatası');

  const devicesPayload = devicesResult.status === 'fulfilled' ? devicesResult.value : null;
  const mappingsPayload = mappingsResult.status === 'fulfilled' ? mappingsResult.value : [];
  const logs = logsResult.status === 'fulfilled' ? logsResult.value : [];
  const products = productsResult.status === 'fulfilled' ? productsResult.value : [];
  const mappings = Array.isArray(mappingsPayload) ? mappingsPayload : (mappingsPayload.data ?? []);

  const responsePayload = {
    backendAvailable: backendErrors.length === 0,
    backendErrors,
    devices: devicesPayload?.devices ?? [],
    queue: devicesPayload?.queue ?? null,
    agentsOnline: devicesPayload?.agents_online ?? 0,
    logs: Array.isArray(logs) ? logs.slice(0, logsLimit) : [],
    products: Array.isArray(products) ? products.slice(0, productsLimit) : [],
    mappings: Array.isArray(mappings) ? mappings.slice(0, mappingsLimit) : [],
    coverage: coverageResult.status === 'fulfilled' ? coverageResult.value : null,
  };

  globalCache.__posOverviewCache = {
    key: cacheKey,
    expiresAt: now + 15_000,
    data: responsePayload,
  };

  return NextResponse.json(responsePayload);
}
