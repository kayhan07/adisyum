export type SessionRole = 'super_admin' | 'Admin' | 'Manager' | 'Cashier' | 'Waiter' | string;

export type SessionPayload = {
  sid?: string;
  userId: string;
  tenantId: string;
  role: SessionRole;
  subscriptionId?: string;
  permissions: string[];
  packageType?: 'mini' | 'gold' | 'premium';
  branchId?: string;
  exp: number;
  iat: number;
};

type JwtHeader = {
  alg: 'HS256';
  typ: 'JWT';
};

const encoder = new TextEncoder();

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let diff = 0;
  for (let index = 0; index < first.length; index += 1) {
    diff |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return diff === 0;
}

function getJwtSecret() {
  const secret = process.env.ADISYUM_JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADISYUM_JWT_SECRET must be set to at least 32 characters in production.');
  }
  return 'adisyum-dev-session-secret-change-before-production';
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getJwtSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signInput(input: string) {
  const key = await importSigningKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function signSession(payload: Omit<SessionPayload, 'iat' | 'exp'> & { maxAgeSeconds?: number }) {
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = payload.maxAgeSeconds ?? 60 * 60 * 12;
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const { maxAgeSeconds: _maxAgeSeconds, ...payloadWithoutOptions } = payload;
  const body: SessionPayload = {
    sid: payloadWithoutOptions.sid ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2, 10)}`),
    ...payloadWithoutOptions,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    iat: now,
    exp: now + maxAgeSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const signature = await signInput(signingInput);
  return `${signingInput}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedBody, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const expectedSignature = await signInput(signingInput);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  const header = JSON.parse(base64UrlDecode(encodedHeader)) as Partial<JwtHeader>;
  if (header.alg !== 'HS256') return null;

  const payload = JSON.parse(base64UrlDecode(encodedBody)) as SessionPayload;
  if (!payload.tenantId || !payload.userId || !payload.role) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
