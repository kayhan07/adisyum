import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import { ensureSystemTemplatePool, getTemplateImportStats, listProductTemplates } from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    await ensureSystemTemplatePool();
    const [templates, importStats] = await Promise.all([
      listProductTemplates(),
      getTemplateImportStats(),
    ]);
    return NextResponse.json({ ok: true, templates, importStats });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/templates] list failed', error);
    return NextResponse.json({ ok: false, error: 'Şablon havuzu alınamadı.' }, { status: 500 });
  }
}
