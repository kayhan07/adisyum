import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  deleteProductTemplate,
  ensureSystemTemplatePool,
  getSystemTemplateCatalog,
  getTemplateImportStats,
  saveCategoryTemplate,
  saveProductTemplate,
  saveRecipeTemplate,
  saveStockTemplate,
  saveTemplatePack,
} from '@/lib/templates/template-pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    await ensureSystemTemplatePool();
    const [catalog, importStats] = await Promise.all([getSystemTemplateCatalog(), getTemplateImportStats()]);
    return NextResponse.json({ ok: true, ...catalog, importStats });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/templates] list failed', error);
    return NextResponse.json({ ok: false, error: 'Şablon havuzu alınamadı.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSystemAdmin(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const kind = body?.kind;
    if (kind === 'product') return NextResponse.json({ ok: true, item: await saveProductTemplate(body as never) });
    if (kind === 'category') return NextResponse.json({ ok: true, item: await saveCategoryTemplate(body as never) });
    if (kind === 'stock') return NextResponse.json({ ok: true, item: await saveStockTemplate(body as never) });
    if (kind === 'recipe') return NextResponse.json({ ok: true, item: await saveRecipeTemplate(body as never) });
    if (kind === 'pack') return NextResponse.json({ ok: true, item: await saveTemplatePack(body as never) });
    return NextResponse.json({ ok: false, error: 'Geçersiz şablon türü.' }, { status: 400 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/templates] save failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Şablon kaydedilemedi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSystemAdmin(request);
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const id = url.searchParams.get('id');
    if (!id || kind !== 'product') {
      return NextResponse.json({ ok: false, error: 'Yalnızca ürün şablonu silme desteklenir.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, item: await deleteProductTemplate(id) });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/templates] delete failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Şablon silinemedi.' }, { status: 500 });
  }
}
