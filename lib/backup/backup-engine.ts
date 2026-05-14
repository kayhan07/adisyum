import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { loadSystemAdminState } from '@/lib/system-admin-store';
import { buildTenantObservabilityRows } from '@/lib/observability/metrics-store';
import { logInfo, logWarn, logError } from '@/lib/observability/structured-logger';
import { alertCritical, fireAlert } from '@/lib/alerts/alert-engine';

export type BackupCategory =
  | 'postgresql'
  | 'redis'
  | 'tenant_config'
  | 'uploaded_assets'
  | 'receipt_template'
  | 'printer_config';

export type BackupMode = 'full' | 'incremental';
export type BackupStatus = 'success' | 'failed' | 'skipped';

export type BackupRun = {
  id: string;
  category: BackupCategory;
  mode: BackupMode;
  status: BackupStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  filePath?: string;
  sizeBytes: number;
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  retentionUntil: string;
  error?: string;
};

type BackupState = {
  runs: BackupRun[];
  lastChecksumByCategory: Partial<Record<BackupCategory, string>>;
  lastSuccessByCategory: Partial<Record<BackupCategory, string>>;
  schedulerStarted: boolean;
  runCount: number;
};

const MAX_RUNS = 2000;
const DEFAULT_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const FULL_BACKUP_INTERVAL_MS = Number(process.env.BACKUP_FULL_INTERVAL_MIN ?? 360) * 60_000;
const INCREMENTAL_BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INCREMENTAL_INTERVAL_MIN ?? 30) * 60_000;

const g = globalThis as typeof globalThis & {
  __adisyumBackupState?: BackupState;
  __adisyumBackupTimers?: { full?: ReturnType<typeof setInterval>; incremental?: ReturnType<typeof setInterval> };
};

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'bkp') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getBackupRootDir() {
  return process.env.BACKUP_ROOT_DIR || path.resolve(process.cwd(), 'backups');
}

function getState(): BackupState {
  if (!g.__adisyumBackupState) {
    g.__adisyumBackupState = {
      runs: [],
      lastChecksumByCategory: {},
      lastSuccessByCategory: {},
      schedulerStarted: false,
      runCount: 0,
    };
  }
  return g.__adisyumBackupState;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function hashBuffer(input: Buffer | string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getRetentionUntil(days = DEFAULT_RETENTION_DAYS) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

function deriveEncryptionKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptPayload(buffer: Buffer) {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret) return { encrypted: false, payload: buffer };

  const key = deriveEncryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  const packaged = Buffer.from(
    JSON.stringify({
      v: 1,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    }),
    'utf8',
  );

  return { encrypted: true, payload: packaged };
}

function decryptPayload(buffer: Buffer) {
  const secret = process.env.BACKUP_ENCRYPTION_KEY;
  if (!secret) return buffer;

  const parsed = JSON.parse(buffer.toString('utf8')) as { iv: string; tag: string; data: string };
  const key = deriveEncryptionKey(secret);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
}

function gatherFileManifest(rootPath: string) {
  if (!fs.existsSync(rootPath)) return [] as Array<{ path: string; size: number; mtime: string }>;

  const out: Array<{ path: string; size: number; mtime: string }> = [];

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const stat = fs.statSync(full);
      out.push({
        path: path.relative(process.cwd(), full).replace(/\\/g, '/'),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  walk(rootPath);
  return out;
}

async function collectPostgresPayload() {
  const payload: Record<string, unknown> = { collectedAt: nowIso() };
  try {
    const [ping] = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1::int as ok`;
    payload.health = ping?.ok === 1 ? 'ok' : 'unknown';
  } catch (error) {
    payload.health = 'failed';
    payload.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const [size] = await prisma.$queryRaw<Array<{ size_bytes: bigint | number | string }>>`
      SELECT pg_database_size(current_database()) AS size_bytes
    `;
    const value = typeof size?.size_bytes === 'bigint' ? Number(size.size_bytes) : Number(size?.size_bytes ?? 0);
    payload.databaseSizeBytes = value;
  } catch {
    payload.databaseSizeBytes = 0;
  }

  return payload;
}

async function collectRedisPayload() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  const payload: Record<string, unknown> = { collectedAt: nowIso(), enabled: Boolean(upstashUrl && upstashToken) };
  if (!upstashUrl || !upstashToken) return payload;

  try {
    const pingRes = await fetch(upstashUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${upstashToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(['PING']),
      cache: 'no-store',
    });
    payload.pingStatus = pingRes.status;
    payload.healthy = pingRes.ok;
  } catch (error) {
    payload.healthy = false;
    payload.error = error instanceof Error ? error.message : String(error);
  }

  return payload;
}

async function collectPayloadByCategory(category: BackupCategory) {
  if (category === 'postgresql') return collectPostgresPayload();
  if (category === 'redis') return collectRedisPayload();

  if (category === 'tenant_config') {
    const admin = loadSystemAdminState();
    return {
      collectedAt: nowIso(),
      tenantCount: admin.tenants.length,
      packageCount: admin.packages.length,
      dealerCount: admin.dealers.length,
      payload: admin,
    };
  }

  if (category === 'uploaded_assets') {
    const downloads = gatherFileManifest(path.resolve(process.cwd(), 'public', 'downloads'));
    const uploads = gatherFileManifest(path.resolve(process.cwd(), 'uploads'));
    return {
      collectedAt: nowIso(),
      downloads,
      uploads,
      totalFiles: downloads.length + uploads.length,
      totalBytes: [...downloads, ...uploads].reduce((sum, f) => sum + f.size, 0),
    };
  }

  if (category === 'receipt_template') {
    const templateDir = path.resolve(process.cwd(), 'templates', 'receipts');
    return {
      collectedAt: nowIso(),
      templateDirExists: fs.existsSync(templateDir),
      templates: gatherFileManifest(templateDir),
    };
  }

  const printerRows = buildTenantObservabilityRows().map((row) => ({
    tenantId: row.tenantId,
    companyName: row.companyName,
    printerOnlineCount: row.printerOnlineCount,
    printerTotalCount: row.printerTotalCount,
    printerHealth: row.printerHealth,
  }));

  return {
    collectedAt: nowIso(),
    tenantCount: printerRows.length,
    printers: printerRows,
  };
}

function categoryFilePath(category: BackupCategory, mode: BackupMode, id: string, encrypted: boolean) {
  const root = getBackupRootDir();
  const folder = path.join(root, category);
  ensureDir(folder);
  return path.join(folder, `${mode}-${id}.${encrypted ? 'enc' : 'json.gz'}`);
}

function writeRun(run: BackupRun) {
  const state = getState();
  state.runs.unshift(run);
  if (state.runs.length > MAX_RUNS) state.runs = state.runs.slice(0, MAX_RUNS);
}

async function persistBackup(category: BackupCategory, mode: BackupMode, payload: unknown) {
  const state = getState();
  const started = Date.now();
  const startedAt = nowIso();

  try {
    const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
    const checksum = hashBuffer(serialized);

    if (mode === 'incremental' && state.lastChecksumByCategory[category] === checksum) {
      const skipped: BackupRun = {
        id: uid(category),
        category,
        mode,
        status: 'skipped',
        startedAt,
        completedAt: nowIso(),
        durationMs: Date.now() - started,
        sizeBytes: 0,
        compressed: true,
        encrypted: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
        checksum,
        retentionUntil: getRetentionUntil(),
      };
      writeRun(skipped);
      return skipped;
    }

    const compressed = zlib.gzipSync(serialized, { level: zlib.constants.Z_BEST_COMPRESSION });
    const enc = encryptPayload(compressed);
    const id = uid(category);
    const outPath = categoryFilePath(category, mode, id, enc.encrypted);
    fs.writeFileSync(outPath, enc.payload);

    const run: BackupRun = {
      id,
      category,
      mode,
      status: 'success',
      startedAt,
      completedAt: nowIso(),
      durationMs: Date.now() - started,
      filePath: outPath,
      sizeBytes: enc.payload.byteLength,
      compressed: true,
      encrypted: enc.encrypted,
      checksum,
      retentionUntil: getRetentionUntil(),
    };

    state.lastChecksumByCategory[category] = checksum;
    state.lastSuccessByCategory[category] = run.completedAt;
    state.runCount += 1;

    writeRun(run);
    return run;
  } catch (error) {
    const failed: BackupRun = {
      id: uid(category),
      category,
      mode,
      status: 'failed',
      startedAt,
      completedAt: nowIso(),
      durationMs: Date.now() - started,
      sizeBytes: 0,
      compressed: true,
      encrypted: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
      checksum: '',
      retentionUntil: getRetentionUntil(),
      error: error instanceof Error ? error.message : String(error),
    };
    writeRun(failed);
    logError({ service: 'backup-engine', message: `Backup failed [${category}/${mode}]: ${failed.error}` });
    await alertCritical('Backup başarısız', `[${category}] ${failed.error ?? 'unknown error'}`, { service: 'backup-engine' });
    return failed;
  }
}

export async function runBackup(category: BackupCategory, mode: BackupMode = 'incremental') {
  const payload = await collectPayloadByCategory(category);
  const run = await persistBackup(category, mode, payload);
  await cleanupExpiredBackups();

  if (run.status === 'success') {
    logInfo({ service: 'backup-engine', message: `Backup ok [${category}/${mode}] size=${run.sizeBytes}B` });
  }
  return run;
}

const ALL_CATEGORIES: BackupCategory[] = [
  'postgresql',
  'redis',
  'tenant_config',
  'uploaded_assets',
  'receipt_template',
  'printer_config',
];

const INCREMENTAL_CATEGORIES: BackupCategory[] = [
  'tenant_config',
  'uploaded_assets',
  'receipt_template',
  'printer_config',
  'redis',
  'postgresql',
];

export async function runScheduledBackups(mode: BackupMode) {
  const categories = mode === 'full' ? ALL_CATEGORIES : INCREMENTAL_CATEGORIES;
  const runs: BackupRun[] = [];
  for (const category of categories) {
    runs.push(await runBackup(category, mode));
  }
  return runs;
}

export async function runTenantConfigBackup() {
  return runBackup('tenant_config', 'incremental');
}

export function getBackupRuns(limit = 200) {
  return getState().runs.slice(0, limit);
}

export function getLastBackupByCategory() {
  const runs = getState().runs;
  const out: Partial<Record<BackupCategory, BackupRun>> = {};
  for (const category of ALL_CATEGORIES) {
    const found = runs.find((r) => r.category === category && r.status === 'success');
    if (found) out[category] = found;
  }
  return out;
}

export function getBackupStats() {
  const runs = getState().runs;
  const success = runs.filter((r) => r.status === 'success');
  const failed = runs.filter((r) => r.status === 'failed');
  const skipped = runs.filter((r) => r.status === 'skipped');
  const totalSize = success.reduce((sum, r) => sum + r.sizeBytes, 0);
  const lastSuccess = success[0]?.completedAt ?? null;
  const lastRestoreTestResult = process.env.LAST_RESTORE_TEST_RESULT ?? 'unknown';

  const failedPenalty = Math.min(45, failed.length * 5);
  const stalePenalty = lastSuccess
    ? Math.min(25, Math.floor((Date.now() - new Date(lastSuccess).getTime()) / (60 * 60 * 1000)))
    : 30;
  const healthScore = Math.max(0, 100 - failedPenalty - stalePenalty);

  return {
    totalRuns: runs.length,
    successCount: success.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    lastBackupAt: lastSuccess,
    totalBackupSizeBytes: totalSize,
    totalBackupSizeMb: Number((totalSize / 1024 / 1024).toFixed(2)),
    lastRestoreTestResult,
    backupHealthScore: healthScore,
    failedBackupAlerts: failed.slice(0, 20),
  };
}

export function readBackupPayloadFromRun(run: BackupRun) {
  if (!run.filePath || !fs.existsSync(run.filePath)) return null;
  const raw = fs.readFileSync(run.filePath);
  const decrypted = run.encrypted ? decryptPayload(raw) : raw;
  const inflated = zlib.gunzipSync(decrypted);
  const checksum = hashBuffer(inflated);
  if (run.checksum && checksum !== run.checksum) {
    throw new Error(`Checksum mismatch for ${run.id}`);
  }
  return JSON.parse(inflated.toString('utf8')) as unknown;
}

export async function cleanupExpiredBackups() {
  const state = getState();
  const now = Date.now();
  let deleted = 0;

  for (const run of state.runs) {
    if (!run.filePath) continue;
    const expiresAt = new Date(run.retentionUntil).getTime();
    if (Number.isNaN(expiresAt) || expiresAt > now) continue;

    if (fs.existsSync(run.filePath)) {
      fs.rmSync(run.filePath, { force: true });
      deleted += 1;
    }
  }

  state.runs = state.runs.filter((run) => {
    const expiresAt = new Date(run.retentionUntil).getTime();
    return Number.isNaN(expiresAt) || expiresAt > now;
  });

  if (deleted > 0) {
    logInfo({ service: 'backup-engine', message: `Backup cleanup removed ${deleted} expired files.` });
  }

  return { deleted };
}

export function bootstrapAutoBackupEngine() {
  const state = getState();
  if (state.schedulerStarted) return;
  state.schedulerStarted = true;

  if (!g.__adisyumBackupTimers) g.__adisyumBackupTimers = {};

  g.__adisyumBackupTimers.full = setInterval(() => {
    void runScheduledBackups('full');
  }, FULL_BACKUP_INTERVAL_MS);

  g.__adisyumBackupTimers.incremental = setInterval(() => {
    void runScheduledBackups('incremental');
  }, INCREMENTAL_BACKUP_INTERVAL_MS);

  if (typeof g.__adisyumBackupTimers.full?.unref === 'function') g.__adisyumBackupTimers.full.unref();
  if (typeof g.__adisyumBackupTimers.incremental?.unref === 'function') g.__adisyumBackupTimers.incremental.unref();

  setTimeout(() => {
    void runScheduledBackups('incremental');
  }, 15_000);

  logInfo({ service: 'backup-engine', message: 'Automated backup engine bootstrapped.' });
}

export async function fireBackupFailureAlertIfNeeded() {
  const recentFailures = getState().runs.filter((r) => r.status === 'failed').slice(0, 5);
  if (recentFailures.length === 0) return;

  await fireAlert({
    severity: 'warning',
    title: 'Backup başarısızlıkları tespit edildi',
    message: `Son ${recentFailures.length} backup denemesinde hata var.`,
    service: 'backup-engine',
    context: { failedRunIds: recentFailures.map((f) => f.id) },
  });
}
