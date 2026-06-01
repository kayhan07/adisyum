import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_ONLINE_WINDOW_MS = 45_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const device = await prisma.tenantDeviceRegistry.findFirst({
      where: {
        tenantId: tenant.tenantId,
        revokedAt: null,
      },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    if (!device) {
      return NextResponse.json({
        ok: false,
        code: 'agent_not_found',
        message: 'Bu aboneye bağlı Windows agent bulunamadı.',
        agent: { found: false, online: false },
        printers: [],
      });
    }

    const metadata = asRecord(device.metadata);
    const printers = Array.isArray(device.installedPrinters) ? device.installedPrinters : [];
    const online = Date.now() - device.lastHeartbeatAt.getTime() <= AGENT_ONLINE_WINDOW_MS;
    const agent = {
      found: true,
      online,
      deviceId: device.deviceId,
      deviceName: device.hostname,
      agentVersion: device.bridgeVersion,
      lastSeenAt: device.lastHeartbeatAt,
      printerCount: printers.length,
      spoolerStatus: device.spoolerHealth,
      queueDepth: device.queueDepth,
      lastError: typeof metadata.lastError === 'string' ? metadata.lastError : null,
    };

    if (!online) {
      return NextResponse.json({
        ok: false,
        code: 'agent_offline',
        message: 'Windows agent çevrimdışı. Masaüstü uygulamasını ve Printer Bridge servisini kontrol edin.',
        agent,
        printers,
      });
    }

    return NextResponse.json({
      ok: true,
      code: printers.length > 0 ? 'printers_found' : 'no_printers',
      message: printers.length > 0
        ? `${printers.length} yazıcı bulundu.`
        : 'Agent bağlı fakat Windows üzerinde yazıcı bulunamadı.',
      agent,
      printers,
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
