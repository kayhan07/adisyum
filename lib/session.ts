import { type NextRequest, NextResponse } from 'next/server';
import { signSession, verifySessionToken, type SessionPayload } from '@/lib/auth';

export const SESSION_COOKIE_NAME = 'adisyum_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
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
  return response;
}

export function getRawSessionTokenFromRequest(request: Request | NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const token = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  return token ? decodeURIComponent(token) : null;
}

export async function getSessionFromRequest(request: Request | NextRequest) {
  return verifySessionToken(getRawSessionTokenFromRequest(request));
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}
