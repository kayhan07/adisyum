import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

const PUBLIC_PREFIXES = [
  '/adisyonsistemi',
  '/site',
  '/api/auth',
  '/_next',
  '/favicon.ico',
  '/downloads',
];

const PROTECTED_PREFIXES = [
  '/app',
  '/dashboard',
  '/api',
  '/pos',
  '/orders',
  '/products',
  '/warehouse',
  '/reports',
  '/finance',
  '/settings',
  '/system-admin',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isApiPath(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isMutatingMethod(method: string) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname) || !isProtectedPath(pathname)) return withSecurityHeaders(NextResponse.next());

  if (isApiPath(pathname) && isMutatingMethod(request.method) && !hasValidOrigin(request)) {
    return withSecurityHeaders(NextResponse.json({ ok: false, error: 'Invalid request origin' }, { status: 403 }));
  }

  const session = await getSessionFromRequest(request);

  if (!session) {
    if (pathname === '/system-admin') {
      return withSecurityHeaders(NextResponse.next());
    }

    if (isApiPath(pathname)) {
      return withSecurityHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/system-admin') ? '/system-admin' : '/adisyonsistemi';
    url.searchParams.set('next', pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if (pathname.startsWith('/system-admin') && !isSuperAdmin(session)) {
    if (isApiPath(pathname)) {
      return withSecurityHeaders(NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  const response = NextResponse.next();
  response.headers.set('x-adisyum-tenant', session.tenantId);
  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/',
    '/site/:path*',
    '/app/:path*',
    '/dashboard/:path*',
    '/api/:path*',
    '/pos/:path*',
    '/orders/:path*',
    '/products/:path*',
    '/warehouse/:path*',
    '/reports/:path*',
    '/finance/:path*',
    '/settings/:path*',
    '/system-admin/:path*',
  ],
};
