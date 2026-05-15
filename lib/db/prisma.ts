import { PrismaClient } from '@prisma/client';
import { recordSlowQuery } from '@/lib/observability/metrics-store';
import { logError, logWarn } from '@/lib/observability/structured-logger';

type PrismaGlobal = typeof globalThis & {
  __adisyumPrisma?: PrismaClient;
  __adisyumPrismaEventsAttached?: boolean;
};

const globalForPrisma = globalThis as PrismaGlobal;
const slowQueryThreshold = Number(process.env.SLOW_QUERY_THRESHOLD_MS ?? '300');

function createPrismaClient() {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'query' },
    ],
  });
}

function attachPrismaEvents(client: PrismaClient) {
  if (globalForPrisma.__adisyumPrismaEventsAttached) return;

  const prismaWithEvents = client as unknown as {
    $on(event: 'warn', callback: (event: { message: string }) => void): void;
    $on(event: 'error', callback: (event: { message: string }) => void): void;
    $on(event: 'query', callback: (event: { duration: number; query: string; target: string }) => void): void;
  };

  prismaWithEvents.$on('warn', (event) => {
    logWarn({ service: 'postgres', message: event.message });
  });

  prismaWithEvents.$on('error', (event) => {
    logError({ service: 'postgres', message: event.message });
  });

  prismaWithEvents.$on('query', (event) => {
    if (event.duration >= slowQueryThreshold) {
      recordSlowQuery({ durationMs: event.duration, query: event.query, target: event.target });
    }
  });

  globalForPrisma.__adisyumPrismaEventsAttached = true;
}

function getPrismaClient() {
  if (!globalForPrisma.__adisyumPrisma) {
    globalForPrisma.__adisyumPrisma = createPrismaClient();
  }

  attachPrismaEvents(globalForPrisma.__adisyumPrisma);
  return globalForPrisma.__adisyumPrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getPrismaClient(), property, value, receiver);
  },
});

export type PrismaDbClient = typeof prisma;
