import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { tenantFromSession } from '@/lib/tenant';
import { previewTemplatePackImport } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  const body = await request.json().catch(() => ({})) as { packIds?: string[] };
  const packIds = Array.isArray(body.packIds) ? body.packIds.filter((value): value is string => typeof value === 'string') : [];
  const preview = await previewTemplatePackImport(tenantFromSession(session), packIds);
  return NextResponse.json({ ok: true, preview });
}
