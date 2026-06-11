import crypto from 'crypto';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

export type GibProvider = 'Uyumsoft' | 'Foriba' | 'EDM' | 'NES';
export type GibIntegrationStatus = 'idle' | 'connected' | 'error';

export type GibIntegrationRecord = {
  tenantId: string;
  provider: GibProvider;
  companyCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  endpoint: string;
  token?: string;
  status: GibIntegrationStatus;
  lastTestedAt: string;
  message?: string;
};

function runtimeKey() {
  return 'settings:gib-integration';
}

function key() {
  return crypto.createHash('sha256').update(process.env.GIB_CREDENTIAL_SECRET || 'adisyon-local-gib-secret').digest();
}

export function encryptSecret(value = '') {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function maskSecret(value = '') {
  if (!value) return '';
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export async function upsertGibIntegration(record: GibIntegrationRecord) {
  const encryptedRecord = {
    ...record,
    password: record.password ? encryptSecret(record.password) : '',
    apiKey: record.apiKey ? encryptSecret(record.apiKey) : '',
    token: record.token ? encryptSecret(record.token) : '',
  };

  await prisma.runtimeState.upsert({
    where: runtimeStateTenantKey(record.tenantId, runtimeKey()),
    update: { payload: encryptedRecord as JsonValueLike },
    create: { tenantId: record.tenantId, key: runtimeKey(), payload: encryptedRecord as JsonValueLike },
  });

  return {
    ...record,
    password: maskSecret(record.password),
    apiKey: maskSecret(record.apiKey),
    token: record.token ? maskSecret(record.token) : '',
  };
}

export async function getGibIntegration(tenantId: string) {
  const stored = await prisma.runtimeState.findUnique({
    where: runtimeStateTenantKey(tenantId, runtimeKey()),
    select: { payload: true },
  });
  const record = stored?.payload as GibIntegrationRecord | null | undefined;
  if (!record) return null;
  return {
    ...record,
    password: record.password ? '********' : '',
    apiKey: record.apiKey ? '********' : '',
    token: record.token ? '********' : '',
  };
}
