import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_AGENT_BASES = [
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'https://127.0.0.1:3443',
  'https://localhost:3443',
];

async function postToLocalAgent(path: string, payload: unknown) {
  let lastError: unknown = null;

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
        lastError = new Error(`Agent status ${response.status}`);
        continue;
      }

      return { response, base };
    } catch (error) {
      lastError = error;
    }
  }

  throw (lastError ?? new Error('Local agent erişilemedi.'));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { printerName?: string; text?: string } | null;
  const printerName = typeof body?.printerName === 'string' ? body.printerName.trim() : '';
  const text = typeof body?.text === 'string' ? body.text : '';

  if (!printerName || !text) {
    return NextResponse.json({ ok: false, error: 'printerName ve text zorunlu.' }, { status: 400 });
  }

  try {
    const { response, base } = await postToLocalAgent('/print', { printerName, text, mode: 'raw' });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ ok: true, base, payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Local agent erişilemedi.' },
      { status: 200 },
    );
  }
}
