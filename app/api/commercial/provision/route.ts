import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { provisionRestaurant } from '@/lib/commercial-ops/platform';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  const body = await request.json().catch(() => ({})) as {
    restaurantName?: string;
    packageType?: 'mini' | 'gold' | 'premium';
    dealerId?: string;
    trialDays?: number;
    tenantId?: string;
  };

  if (!body.restaurantName?.trim()) {
    return NextResponse.json({ ok: false, error: 'restaurantName required' }, { status: 400 });
  }

  const provisioned = provisionRestaurant({
    restaurantName: body.restaurantName,
    packageType: body.packageType,
    dealerId: body.dealerId,
    trialDays: body.trialDays,
    tenantId: body.tenantId,
  });

  return NextResponse.json({ ok: true, provisioned });
}
