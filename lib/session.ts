import { type NextRequest, NextResponse } from 'next/server';
import { signSession, verifySessionToken, type SessionPayload } from '@/lib/auth';

export const SESSION_COOKIE_NAME = 'adisyum_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

function getSessionCookieDomain() {
  const configuredDomain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  if (configuredDomain) return configuredDomain;
  return undefined;
}

export function getSessionCookieOptions() {
  const domain = getSessionCookieDomain();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  };
}

export async function createSessionToken(input: Omit<SessionPayload, 'iat' | 'exp'>) {
  return signSession({ ...input, maxAgeSeconds: MAX_AGE_SECONDS });
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  });
  return response;
}

function getRawSessionTokensFromRequest(request: Request | NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((part) => part.slice(SESSION_COOKIE_NAME.length + 1))
    .filter(Boolean)
    .map((token) => decodeURIComponent(token));
}

export function getRawSessionTokenFromRequest(request: Request | NextRequest) {
  return getRawSessionTokensFromRequest(request).at(-1) ?? null;
}

export async function getSessionFromRequest(request: Request | NextRequest) {
  const tokens = getRawSessionTokensFromRequest(request);
  for (const token of tokens.reverse()) {
    const session = await verifySessionToken(token).catch(() => null);
    if (session) return session;
  }
  return null;
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}
