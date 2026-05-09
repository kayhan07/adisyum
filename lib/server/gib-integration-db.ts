import crypto from 'crypto';

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

type GlobalGibDb = {
  gibIntegrations?: GibIntegrationRecord[];
};

const globalDb = globalThis as typeof globalThis & GlobalGibDb;

function getDb() {
  if (!globalDb.gibIntegrations) globalDb.gibIntegrations = [];
  return globalDb.gibIntegrations;
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

export function upsertGibIntegration(record: GibIntegrationRecord) {
  const db = getDb();
  const encryptedRecord = {
    ...record,
    password: record.password ? encryptSecret(record.password) : '',
    apiKey: record.apiKey ? encryptSecret(record.apiKey) : '',
    token: record.token ? encryptSecret(record.token) : '',
  };
  const index = db.findIndex((item) => item.tenantId === record.tenantId);
  if (index >= 0) db[index] = encryptedRecord;
  else db.unshift(encryptedRecord);
  return {
    ...record,
    password: maskSecret(record.password),
    apiKey: maskSecret(record.apiKey),
    token: record.token ? maskSecret(record.token) : '',
  };
}

export function getGibIntegration(tenantId: string) {
  const record = getDb().find((item) => item.tenantId === tenantId) ?? null;
  if (!record) return null;
  return {
    ...record,
    password: record.password ? '********' : '',
    apiKey: record.apiKey ? '********' : '',
    token: record.token ? '********' : '',
  };
}
