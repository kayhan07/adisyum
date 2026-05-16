import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/session';
import { hasPermission, tenantFromSession } from '@/lib/tenant';
import { importTemplatePacksToTenant } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!hasPermission(session, 'products.manage')) return forbiddenResponse('Paket içe aktarma yetkisi gerekli.');
  const body = await request.json().catch(() => ({})) as {
    packIds?: string[];
    configuration?: { branchName?: string; takeawayEnabled?: boolean; serviceChargePercent?: number };
  };
  const packIds = Array.isArray(body.packIds) ? body.packIds.filter((value): value is string => typeof value === 'string') : [];
  if (packIds.length === 0) return NextResponse.json({ ok: false, error: 'En az bir paket seçilmelidir.' }, { status: 400 });
  const result = await importTemplatePacksToTenant(tenantFromSession(session), packIds, body.configuration);
  return NextResponse.json({ ok: true, ...result });
}
