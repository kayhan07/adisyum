import { NextResponse } from 'next/server';

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

async function fetchLocalAgent(path: string, init?: RequestInit) {
  let lastError: unknown = null;

  for (const base of LOCAL_AGENT_BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        cache: 'no-store',
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

export async function GET() {
  try {
    const { response, base } = await fetchLocalAgent('/printers');
    const payload = await response.json() as Array<string | { Name?: string; name?: string }>;

    const printers = Array.isArray(payload)
      ? payload
          .map((item) => (typeof item === 'string' ? item : (item.Name ?? item.name ?? '')))
          .filter((name): name is string => Boolean(name && name.trim()))
      : [];

    return NextResponse.json({ ok: true, base, printers });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        printers: [],
        error: error instanceof Error ? error.message : 'Local agent erişilemedi.',
      },
      { status: 200 },
    );
  }
}
