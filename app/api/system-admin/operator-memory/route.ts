import { NextResponse } from 'next/server';
import { requireSystemAdmin, isRouteResponse } from '@/lib/system-admin/auth';
import { deleteOperatorMemory, listOperatorMemory, upsertOperatorMemory } from '@/lib/system-admin/operator-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await requireSystemAdmin(request);
    const url = new URL(request.url);
    return NextResponse.json({ ok: true, items: await listOperatorMemory(session.userId, url.searchParams.get('kind') ?? undefined) });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    return NextResponse.json({ ok: false, error: 'Operator hafizasi alinamadi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as { kind?: string; key?: string; label?: string; payload?: unknown };
    if (!body.kind || !body.key) return NextResponse.json({ ok: false, error: 'kind and key required' }, { status: 400 });
    return NextResponse.json({ ok: true, item: await upsertOperatorMemory({ operatorId: session.userId, kind: body.kind, key: body.key, label: body.label, payload: body.payload }) });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    return NextResponse.json({ ok: false, error: 'Operator hafizasi kaydedilemedi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as { kind?: string; key?: string };
    if (!body.kind || !body.key) return NextResponse.json({ ok: false, error: 'kind and key required' }, { status: 400 });
    await deleteOperatorMemory({ operatorId: session.userId, kind: body.kind, key: body.key });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    return NextResponse.json({ ok: false, error: 'Operator hafizasi silinemedi.' }, { status: 500 });
  }
}
