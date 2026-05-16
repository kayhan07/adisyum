import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { listTemplatePacks } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  const url = new URL(request.url);
  const packs = await listTemplatePacks({
    restaurantType: url.searchParams.get('restaurantType') || undefined,
    scale: url.searchParams.get('scale') || undefined,
  });
  return NextResponse.json({ ok: true, packs });
}
