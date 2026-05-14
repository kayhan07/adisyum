import { NextResponse } from 'next/server';
import { logError } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';
import { getSessionFromRequest } from '@/lib/session';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_AGENT_BASES = [
  'http://127.0.0.1:4891',
  'http://localhost:4891',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'https://127.0.0.1:3443',
  'https://localhost:3443',
];

async function postToLocalAgent(path: string, payload: unknown) {
  let lastError: unknown = null;
  const attempts: Array<{ base: string; status?: number; error?: string }> = [];

  for (const base of LOCAL_AGENT_BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        attempts.push({ base, status: response.status });
        return { response, base, attempts };
      }

      return { response, base, attempts };
    } catch (error) {
      attempts.push({
        base,
        error: error instanceof Error ? error.message : String(error),
      });
      lastError = error;
    }
  }

  throw { error: lastError ?? new Error('Local agent erişilemedi.'), attempts };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const session = await getSessionFromRequest(request);
  if (!session || !(await isSessionActive(session))) {
    return NextResponse.json({ ok: false, error: 'Oturum sonlandirildi.' }, { status: 401 });
  }
  const tenantId = session?.tenantId;
  const body = await request.json().catch(() => null) as { printerName?: string; bytesBase64?: string; source?: string } | null;
  const printerName = typeof body?.printerName === 'string' ? body.printerName.trim() : '';
  const bytesBase64 = typeof body?.bytesBase64 === 'string' ? body.bytesBase64 : '';
  const source = typeof body?.source === 'string' && body.source.trim().length > 0
    ? body.source.trim()
    : 'proxy:legacy';

  if (!printerName || !bytesBase64) {
    recordRequestMetric({
      tenantId,
      route: '/api/printers/local-agent/print',
      durationMs: Date.now() - startedAt,
      statusCode: 400,
      method: 'POST',
    });
    return NextResponse.json({ ok: false, error: 'printerName ve bytesBase64 zorunlu.' }, { status: 400 });
  }

  try {
    const requestPayload = { printerName, bytesBase64, source, mode: 'raw' };

    const { response, base } = await postToLocalAgent('/print', requestPayload);
    const payload = await response.json().catch(() => ({}));

    recordRequestMetric({
      tenantId,
      route: '/api/printers/local-agent/print',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'POST',
    });

    return NextResponse.json({ ok: true, base, payload });
  } catch (error) {
    const maybeError = error as { error?: unknown; attempts?: Array<{ base: string; status?: number; error?: string }> };
    const rootError = maybeError?.error ?? error;
    const message = rootError instanceof Error ? rootError.message : 'Local agent erişilemedi.';
    recordTenantError({ tenantId, message, scope: 'api.printer.local-agent', route: '/api/printers/local-agent/print' });
    recordRequestMetric({
      tenantId,
      route: '/api/printers/local-agent/print',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'POST',
    });
    logError({ service: 'api.printer.local-agent', message, tenantId, route: '/api/printers/local-agent/print' });
    return NextResponse.json(
      {
        ok: false,
        error: message,
        attempts: Array.isArray(maybeError?.attempts) ? maybeError.attempts : [],
      },
      { status: 200 },
    );
  }
}
