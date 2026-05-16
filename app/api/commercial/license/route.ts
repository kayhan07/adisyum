import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { upsertLicense, type LicenseStatus } from '@/lib/commercial-ops/platform';
import type { PackageModuleKey } from '@/lib/package-access-core';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  const body = await request.json().catch(() => ({})) as {
    tenantId?: string;
    packageType?: 'mini' | 'gold' | 'premium';
    status?: LicenseStatus;
    modules?: PackageModuleKey[];
    printerLimit?: number;
    branchLimit?: number;
    userLimit?: number;
    expiresAt?: string;
  };

  if (!body.tenantId) {
    return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
  }

  const license = upsertLicense({
    tenantId: body.tenantId,
    packageType: body.packageType,
    status: body.status,
    modules: body.modules,
    printerLimit: body.printerLimit,
    branchLimit: body.branchLimit,
    userLimit: body.userLimit,
    expiresAt: body.expiresAt,
  });

  return NextResponse.json({ ok: true, license });
}
