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
    const payload = await response.json() as Array<string | {
      Name?: string;
      name?: string;
      driverName?: string;
      DriverName?: string;
      portName?: string;
      PortName?: string;
      status?: string;
      PrinterStatus?: string | number;
      shared?: boolean;
      Shared?: boolean;
      default?: boolean;
      online?: boolean;
      connectionType?: string;
      escpos?: boolean;
      source?: string;
    }>;

    const printers = Array.isArray(payload)
      ? payload
          .map((item) => {
            if (typeof item === 'string') return { name: item.trim() };
            return {
              name: (item.Name ?? item.name ?? '').trim(),
              driverName: item.DriverName ?? item.driverName ?? '',
              portName: item.PortName ?? item.portName ?? '',
              status: String(item.PrinterStatus ?? item.status ?? ''),
              shared: Boolean(item.Shared ?? item.shared ?? false),
              default: Boolean(item.default ?? false),
              online: item.online !== false,
              connectionType: item.connectionType ?? 'local',
              escpos: Boolean(item.escpos ?? false),
              source: item.source ?? 'local-agent',
            };
          })
          .filter((printer) => Boolean(printer.name))
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
