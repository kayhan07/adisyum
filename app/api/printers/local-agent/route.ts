import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_ONLINE_WINDOW_MS = 45_000;

function jsonUtf8(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

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
  registeredPrinters: Array<{ name?: string; type?: string; endpoint?: string | null; metadata: unknown }>,
) {
  const printers = new Map<string, unknown>();

  for (const printer of installedPrinters) {
    const name = printerName(printer);
    if (name) printers.set(name.toLocaleLowerCase('tr-TR'), printer);
  }

  for (const printer of registeredPrinters) {
    const name = typeof printer.name === 'string' ? printer.name.trim() : '';
    const key = name.toLocaleLowerCase('tr-TR');
    if (!key || printers.has(key)) continue;
    printers.set(key, {
      name,
      type: typeof printer.type === 'string' ? printer.type : 'network',
      endpoint: typeof printer.endpoint === 'string' ? printer.endpoint : null,
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
    const url = new URL(request.url);
    const requestedDeviceId = (request.headers.get('x-adisyum-device-id') || url.searchParams.get('deviceId') || '').trim();
    const [device, latestTenantDevice, registeredPrinters] = await Promise.all([
      requestedDeviceId
        ? prisma.tenantDeviceRegistry.findFirst({
            where: {
              tenantId: tenant.tenantId,
              deviceId: requestedDeviceId,
              OR: [{ branchId }, { branchId: null }],
              revokedAt: null,
            },
            orderBy: { lastHeartbeatAt: 'desc' },
          })
        : Promise.resolve(null),
      prisma.tenantDeviceRegistry.findFirst({
        where: {
          tenantId: tenant.tenantId,
          revokedAt: null,
        },
        orderBy: { lastHeartbeatAt: 'desc' },
        select: {
          deviceId: true,
          hostname: true,
          branchId: true,
          lastHeartbeatAt: true,
          status: true,
        },
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
      if (!requestedDeviceId) {
        const printers = mergePrinters([], branchPrinters);
        return jsonUtf8({
          ok: printers.length > 0,
          tenantId: tenant.tenantId,
          branchId,
          code: printers.length > 0 ? 'registered_printers_only' : 'agent_device_required',
          message: printers.length > 0
            ? 'Bu bilgisayarın Windows agent kimliği alınamadı. Sadece kayıtlı yazıcı eşleşmeleri gösteriliyor.'
            : 'Bu bilgisayarın Windows agent kimliği alınamadı. Yazıcıları görmek için Adisyum Desktop/Printer Bridge ile bu bilgisayarı aktive edin.',
          agent: { found: false, online: false, deviceScoped: false, tenantId: tenant.tenantId, branchId },
          printers,
        });
      }

      if (latestTenantDevice?.branchId && latestTenantDevice.branchId !== branchId) {
        return jsonUtf8({
          ok: false,
          tenantId: tenant.tenantId,
          branchId,
          code: 'agent_branch_mismatch',
          message: `Yazıcı farklı şubeye bağlı. Aktif şube: ${branchId}. Yazıcı şubesi: ${latestTenantDevice.branchId}.`,
          agent: {
            found: true,
            online: false,
            tenantId: tenant.tenantId,
            branchId: latestTenantDevice.branchId,
            deviceId: latestTenantDevice.deviceId,
            deviceName: latestTenantDevice.hostname,
            lastSeenAt: latestTenantDevice.lastHeartbeatAt,
            status: latestTenantDevice.status,
          },
          printers: [],
        });
      }

      const printers = mergePrinters([], branchPrinters);
      return jsonUtf8({
        ok: printers.length > 0,
        tenantId: tenant.tenantId,
        branchId,
        code: printers.length > 0 ? 'registered_printers_only' : 'agent_not_found',
        message: branchPrinters.length > 0
          ? 'Yazıcı köprüsü çalışmıyor. Kayıtlı yazıcı eşleşmeleri gösteriliyor.'
          : 'Yazıcı köprüsü çalışmıyor. Lütfen Printer Bridge uygulamasını açın.',
        agent: { found: false, online: false, tenantId: tenant.tenantId, branchId },
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
      tenantId: tenant.tenantId,
      branchId,
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
      return jsonUtf8({
        ok: printers.length > 0,
        tenantId: tenant.tenantId,
        branchId,
        code: printers.length > 0 ? 'agent_offline_registered_printers' : 'agent_offline',
        message: printers.length > 0
          ? 'Yazıcı köprüsü çevrimdışı. Kayıtlı yazıcı eşleşmeleri gösteriliyor.'
          : 'Yazıcı köprüsü çalışmıyor. Lütfen Printer Bridge uygulamasını açın.',
        agent,
        printers,
      });
    }

    return jsonUtf8({
      ok: true,
      tenantId: tenant.tenantId,
      branchId,
      code: printers.length > 0 ? 'printers_found' : 'no_printers',
      message: printers.length > 0
        ? `${printers.length} yazıcı bulundu.`
        : 'Yazıcı köprüsü bağlı fakat bu bilgisayarda kurulu yazıcı yok veya Windows spooler kapalı.',
      agent,
      printers,
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
