import { NextResponse } from 'next/server';
import { downloadObservabilitySummary, recordDownloadEvent } from '@/lib/download-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, summary: downloadObservabilitySummary() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    fileName?: string;
    version?: string;
    status?: 'started' | 'failed' | 'completed';
    source?: string;
  };

  if (!body.fileName) {
    return NextResponse.json({ ok: false, error: 'fileName zorunludur.' }, { status: 400 });
  }

  recordDownloadEvent({
    fileName: body.fileName,
    version: body.version,
    status: body.status ?? 'started',
    source: body.source,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ ok: true, summary: downloadObservabilitySummary() });
}
