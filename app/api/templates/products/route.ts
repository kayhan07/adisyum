import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { tenantFromSession } from '@/lib/tenant';
import { listProductTemplates } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();

  const tenant = tenantFromSession(session);
  const url = new URL(request.url);
  const templates = await listProductTemplates({
    restaurantType: url.searchParams.get('restaurantType') || undefined,
    query: url.searchParams.get('q') || undefined,
  });

  return NextResponse.json({
    ok: true,
    tenantId: tenant.tenantId,
    templates,
  });
}
