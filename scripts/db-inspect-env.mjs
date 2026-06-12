import fs from 'node:fs';
import path from 'node:path';

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

function maskPassword(password) {
  if (!password) return '<missing>';
  if (password.length <= 4) return '*'.repeat(password.length);
  return `${password.slice(0, 2)}${'*'.repeat(Math.max(4, password.length - 4))}${password.slice(-2)}`;
}

function inspectDatabaseUrl(raw) {
  if (!raw) {
    return {
      ok: false,
      reason: 'Database connection env is missing',
    };
  }

  if (raw.includes('${') || /\$DATABASE_URL/.test(raw)) {
    return {
      ok: false,
      reason: 'Database connection env contains unresolved variable syntax',
    };
  }

  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(':', '');
    const sslMode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'not-set';
    return {
      ok: protocol === 'postgresql' || protocol === 'postgres',
      protocol,
      host: url.hostname || '<missing>',
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || '<missing>',
      user: decodeURIComponent(url.username || '') || '<missing>',
      password: maskPassword(decodeURIComponent(url.password || '')),
      passwordPresent: Boolean(url.password),
      sslMode,
      queryKeys: Array.from(url.searchParams.keys()).sort(),
      reason: protocol === 'postgresql' || protocol === 'postgres' ? undefined : `unsupported protocol: ${protocol}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Database connection env parse failed',
    };
  }
}

loadEnvFiles();

const inspected = inspectDatabaseUrl(process.env.DATABASE_URL);

if (!inspected.ok) {
  console.error('[db:inspect-env] invalid');
  console.error(JSON.stringify(inspected, null, 2));
  process.exit(1);
}

console.log('[db:inspect-env] database connection env');
console.log(JSON.stringify(inspected, null, 2));
