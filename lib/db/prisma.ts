import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { recordSlowQuery } from '@/lib/observability/metrics-store';
import { logError, logWarn } from '@/lib/observability/structured-logger';

const globalForPrisma = globalThis as typeof globalThis & {
  __adisyumPrisma?: PrismaClient;
};

const slowQueryThreshold = Number(process.env.SLOW_QUERY_THRESHOLD_MS ?? '300');

export const prisma =
  globalForPrisma.__adisyumPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'query' },
    ],
  });

// Cast to any because the adapter-based PrismaClient overloads $on to 'never'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaWithEvents = prisma as any;

prismaWithEvents.$on('warn', (event: { message: string }) => {
  logWarn({ service: 'postgres', message: event.message });
});

prismaWithEvents.$on('error', (event: { message: string }) => {
  logError({ service: 'postgres', message: event.message });
});

prismaWithEvents.$on('query', (event: { duration: number; query: string; target: string }) => {
  if (event.duration >= slowQueryThreshold) {
    recordSlowQuery({ durationMs: event.duration, query: event.query, target: event.target });
  }
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__adisyumPrisma = prisma;
}
