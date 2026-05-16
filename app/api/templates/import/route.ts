import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/session';
import { hasPermission, tenantFromSession } from '@/lib/tenant';
import { importProductTemplatesToTenant } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!hasPermission(session, 'products.manage')) return forbiddenResponse('Ürün şablonu içe aktarma yetkisi gerekli.');

  const body = await request.json().catch(() => ({})) as { templateIds?: string[] };
  const templateIds = Array.isArray(body.templateIds) ? body.templateIds.filter((value): value is string => typeof value === 'string') : [];
  if (templateIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir şablon seçilmelidir.' }, { status: 400 });
  }

  const results = await importProductTemplatesToTenant(tenantFromSession(session), templateIds);
  return NextResponse.json({ ok: true, results });
}
