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

function printerName(value: unknown) {
  if (typeof value === 'string') return value.trim();
  const record = asRecord(value);
  const name = typeof record.name === 'string'
    ? record.name
    : typeof record.Name === 'string'
      ? record.Name
      : '';
  return name.trim();
}

function mergePrinters(
  installedPrinters: unknown[],
  registeredPrinters: Array<{ name: string; type: string; endpoint: string | null; metadata: unknown }>,
) {
  const printers = new Map<string, unknown>();

  for (const printer of installedPrinters) {
    const name = printerName(printer);
    if (name) printers.set(name.toLocaleLowerCase('tr-TR'), printer);
  }

  for (const printer of registeredPrinters) {
    const key = printer.name.trim().toLocaleLowerCase('tr-TR');
    if (!key || printers.has(key)) continue;
    printers.set(key, {
      name: printer.name,
      type: printer.type,
      endpoint: printer.endpoint,
      registered: true,
      ...asRecord(printer.metadata),
    });
  }

  return Array.from(printers.values());
}

function filterRegisteredPrintersByBranch<T extends { metadata: unknown }>(printers: T[], branchId: string) {
  return printers.filter((printer) => {
    const metadata = asRecord(printer.metadata);
    const printerBranchId = typeof metadata.branchId === 'string' ? metadata.branchId : '';
    return !printerBranchId || printerBranchId === branchId;
  });
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId ?? 'mrk';
    const [device, registeredPrinters] = await Promise.all([
      prisma.tenantDeviceRegistry.findFirst({
        where: {
          tenantId: tenant.tenantId,
          OR: [{ branchId }, { branchId: null }],
          revokedAt: null,
        },
        orderBy: { lastHeartbeatAt: 'desc' },
      }),
      prisma.printer.findMany({
        where: {
          tenantId: tenant.tenantId,
          active: true,
        },
        orderBy: { name: 'asc' },
        select: {
          name: true,
          type: true,
          endpoint: true,
          metadata: true,
        },
      }),
    ]);

    const branchPrinters = filterRegisteredPrintersByBranch(registeredPrinters, branchId);

    if (!device) {
      const printers = mergePrinters([], branchPrinters);
      return NextResponse.json({
        ok: printers.length > 0,
        tenantId: tenant.tenantId,
        branchId,
        code: printers.length > 0 ? 'registered_printers_only' : 'agent_not_found',
        message: branchPrinters.length > 0
          ? 'Windows agent bağlı değil. Kayıtlı yazıcı eşleşmeleri gösteriliyor.'
          : 'Bu aboneye bağlı Windows agent bulunamadı.',
        agent: { found: false, online: false },
        printers,
      });
    }

    const metadata = asRecord(device.metadata);
    const printers = mergePrinters(
      Array.isArray(device.installedPrinters) ? device.installedPrinters : [],
      branchPrinters,
    );
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
        ok: printers.length > 0,
        tenantId: tenant.tenantId,
        branchId,
        code: printers.length > 0 ? 'agent_offline_registered_printers' : 'agent_offline',
        message: printers.length > 0
          ? 'Windows agent çevrimdışı. Kayıtlı yazıcı eşleşmeleri gösteriliyor.'
          : 'Windows agent çevrimdışı. Masaüstü uygulamasını ve Printer Bridge servisini kontrol edin.',
        agent,
        printers,
      });
    }

    return NextResponse.json({
      ok: true,
      tenantId: tenant.tenantId,
      branchId,
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
