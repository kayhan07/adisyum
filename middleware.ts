import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

const PUBLIC_PREFIXES = [
  '/site',
  '/api/auth',
  '/app/login',
  '/system-admin/login',
  '/api/downloads',
  '/api/runtime-build-id',
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

function isTenantObservabilityIngestPath(pathname: string) {
  return pathname === '/api/system-admin/observability/ingest';
}

function isLegacyAdisyonPath(pathname: string) {
  return pathname === '/adisyonsistemi' || pathname.startsWith('/adisyonsistemi/');
}

function splitForwardedHeader(value: string | null) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

function normalizeHost(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function addHostWithWwwPair(hosts: Set<string>, host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) return;
  hosts.add(normalized);
  const [hostname, port] = normalized.split(':');
  if (!hostname) return;
  if (hostname.startsWith('www.')) {
    hosts.add(`${hostname.slice(4)}${port ? `:${port}` : ''}`);
  } else {
    hosts.add(`www.${hostname}${port ? `:${port}` : ''}`);
  }
}

function configuredPublicHosts() {
  const urls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
  ];
  const hosts = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      addHostWithWwwPair(hosts, new URL(url).host);
    } catch {
      addHostWithWwwPair(hosts, url);
    }
  }
  return hosts;
}

function configuredPublicOrigin() {
  const urls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.APP_URL,
    process.env.PUBLIC_APP_URL,
  ];
  for (const url of urls) {
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      // Ignore non-URL host values here; redirects require an absolute public origin.
    }
  }
  if (process.env.NODE_ENV === 'production') return 'https://adisyum.com';
  return null;
}

function publicRedirectUrl(request: NextRequest, pathname: string) {
  const origin = configuredPublicOrigin();
  const url = origin ? new URL(pathname, origin) : request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return url;
}

function allowedRequestHosts(request: NextRequest) {
  const hosts = configuredPublicHosts();
  addHostWithWwwPair(hosts, request.nextUrl.host);
  addHostWithWwwPair(hosts, request.headers.get('host') ?? '');

  for (const host of splitForwardedHeader(request.headers.get('x-forwarded-host'))) {
    addHostWithWwwPair(hosts, host);
  }
  for (const host of splitForwardedHeader(request.headers.get('x-original-host'))) {
    addHostWithWwwPair(hosts, host);
  }

  return hosts;
}

function getOriginHost(origin: string) {
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return '';
  }
}

function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const originHost = getOriginHost(origin);
  if (!originHost) return false;
  return allowedRequestHosts(request).has(originHost);
}

function logInvalidOrigin(request: NextRequest) {
  console.warn('[middleware-auth] invalid mutating API origin', {
    timestamp: new Date().toISOString(),
    path: request.nextUrl.pathname,
    method: request.method,
    origin: request.headers.get('origin'),
    originHost: getOriginHost(request.headers.get('origin') ?? ''),
    nextUrlHost: request.nextUrl.host,
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    allowedHosts: [...allowedRequestHosts(request)],
    cookiePresent: Boolean(request.headers.get('cookie')),
  });
}

function requestCookieNames(request: NextRequest) {
  return request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean) ?? [];
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

  if (isLegacyAdisyonPath(pathname)) {
    const url = publicRedirectUrl(request, '/app');
    return withSecurityHeaders(NextResponse.redirect(url, 308));
  }

  if (pathname === '/app' && request.nextUrl.searchParams.has('next')) {
    const url = publicRedirectUrl(request, '/app');
    return withSecurityHeaders(NextResponse.redirect(url, 308));
  }

  if (pathname === '/app/login') {
    return withSecurityHeaders(NextResponse.next());
  }

  if (pathname === '/system-admin/login') {
    return withSecurityHeaders(NextResponse.next());
  }

  if (isPublicPath(pathname) || !isProtectedPath(pathname)) return withSecurityHeaders(NextResponse.next());

  if (isApiPath(pathname) && isMutatingMethod(request.method) && !hasValidOrigin(request)) {
    logInvalidOrigin(request);
    return withSecurityHeaders(NextResponse.json({
      ok: false,
      error: 'Invalid request origin',
      code: 'invalid_origin',
      details: {
        origin: request.headers.get('origin'),
        host: request.headers.get('host'),
        forwardedHost: request.headers.get('x-forwarded-host'),
      },
    }, { status: 403 }));
  }

  const session = await getSessionFromRequest(request);

  if (!session) {
    if (isApiPath(pathname)) {
      console.warn('[middleware-auth] api session missing', {
        timestamp: new Date().toISOString(),
        path: pathname,
        method: request.method,
        cookiePresent: Boolean(request.headers.get('cookie')),
        cookieNames: requestCookieNames(request),
        host: request.headers.get('host'),
        forwardedHost: request.headers.get('x-forwarded-host'),
      });
      return withSecurityHeaders(NextResponse.json({ ok: false, error: 'Unauthorized', code: 'missing_session' }, { status: 401 }));
    }
    const url = publicRedirectUrl(request, pathname.startsWith('/system-admin') ? '/system-admin/login' : '/app/login');
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  const isSystemAdminPath = pathname.startsWith('/system-admin') || pathname.startsWith('/api/system-admin/');
  if (isSystemAdminPath && (!isSuperAdmin(session) || session.tenantId !== 'system')) {
    if (isApiPath(pathname) && isTenantObservabilityIngestPath(pathname)) {
      return withSecurityHeaders(NextResponse.next());
    }
    if (isApiPath(pathname)) {
      console.warn('[middleware-auth] system-admin api forbidden', {
        timestamp: new Date().toISOString(),
        path: pathname,
        method: request.method,
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
        branchId: session.branchId,
      });
      return withSecurityHeaders(NextResponse.json({ ok: false, error: 'Forbidden', code: 'system_admin_forbidden' }, { status: 403 }));
    }
    const url = publicRedirectUrl(request, '/system-admin/login');
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
    '/app',
    '/app/:path*',
    '/adisyonsistemi',
    '/adisyonsistemi/:path*',
    '/dashboard/:path*',
    '/api/:path*',
    '/pos/:path*',
    '/orders/:path*',
    '/products/:path*',
    '/warehouse/:path*',
    '/reports/:path*',
    '/finance/:path*',
    '/settings/:path*',
    '/system-admin',
    '/system-admin/:path*',
  ],
};
