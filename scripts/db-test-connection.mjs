import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';

const ENV_FILES = ['.env', '.env.production', '.env.local'];

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFiles() {
  for (const file of ENV_FILES) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseDotEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function inspectUrl(raw) {
  if (!raw) return { ok: false, stage: 'env', message: 'Database connection env is missing' };
  if (raw.includes('${') || /\$DATABASE_URL/.test(raw)) {
    return { ok: false, stage: 'env', message: 'Database connection env contains unresolved variable syntax' };
  }
  try {
    const url = new URL(raw);
    return {
      ok: true,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      passwordPresent: Boolean(url.password),
    };
  } catch (error) {
    return { ok: false, stage: 'env', message: error instanceof Error ? error.message : 'Database connection env parse failed' };
  }
}

function printFailure(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
  console.error(`[db:test-connection] ${stage} failed`);
  console.error(JSON.stringify({ stage, code, message }, null, 2));
}

loadEnvFiles();
const inspected = inspectUrl(process.env.DATABASE_URL);
if (!inspected.ok) {
  console.error('[db:test-connection] env failed');
  console.error(JSON.stringify(inspected, null, 2));
  process.exit(1);
}

console.log('[db:test-connection] env ok');
console.log(JSON.stringify(inspected, null, 2));

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS ?? 10000),
});

try {
  await pgClient.connect();
  const result = await pgClient.query('select current_user as "currentUser", current_database() as "databaseName", inet_server_addr()::text as "serverAddress", inet_server_port() as "serverPort"');
  console.log('[db:test-connection] raw pg ok');
  console.log(JSON.stringify(result.rows[0], null, 2));
} catch (error) {
  printFailure('raw-pg', error);
  process.exitCode = 1;
} finally {
  await pgClient.end().catch(() => undefined);
}

if (process.exitCode) process.exit(process.exitCode);

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('[db:test-connection] prisma ok');
} catch (error) {
  printFailure('prisma', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

process.exit(process.exitCode ?? 0);
