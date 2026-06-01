import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { hashDeviceToken, normalizePrinterInventory, summarizeDeviceCapabilities } from '@/lib/device-runtime';
import { authenticateRegisteredDevice, authenticateTenantSession } from '@/lib/server/device-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId') ?? undefined;
    const devices = await prisma.tenantDeviceRegistry.findMany({
      where: {
        tenantId: tenant.tenantId,
        ...(branchId ? { branchId } : {}),
        revokedAt: null,
      },
      orderBy: [{ status: 'asc' }, { lastHeartbeatAt: 'desc' }],
      take: 500,
    });
    return NextResponse.json({ ok: true, devices });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {
      tenantId?: string;
      deviceId?: string;
      branchId?: string;
      hostname?: string;
      localIp?: string;
      bridgeVersion?: string;
      deviceToken?: string;
      printers?: Array<Record<string, unknown>>;
      fiscalCapable?: boolean;
      queueDepth?: number;
      reconnectCount?: number;
      spoolerHealth?: string;
      metadata?: Record<string, unknown>;
    } | null;

    const deviceId = body?.deviceId?.trim().slice(0, 160);
    if (!deviceId) return NextResponse.json({ ok: false, error: 'deviceId required' }, { status: 400 });
    const [session, registeredDevice] = await Promise.all([
      authenticateTenantSession(request),
      authenticateRegisteredDevice(request),
    ]);
    const tenantId = session?.tenantId ?? registeredDevice?.tenantId;
    if (!tenantId) return NextResponse.json({ ok: false, error: 'Cihaz eşleşmesi veya tenant oturumu gerekli.' }, { status: 401 });
    if (body?.tenantId && body.tenantId !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Tenant eşleşmesi geçersiz.' }, { status: 403 });
    }
    if (registeredDevice && registeredDevice.deviceId !== deviceId) {
      return NextResponse.json({ ok: false, error: 'Cihaz kimliği eşleşmiyor.' }, { status: 403 });
    }

    const printers = normalizePrinterInventory((body?.printers ?? []).map((printer) => ({
      printerId: typeof printer.printerId === 'string' ? printer.printerId : undefined,
      name: typeof printer.name === 'string' ? printer.name : '',
      driver: typeof printer.driver === 'string'
        ? printer.driver
        : typeof printer.driverName === 'string'
          ? printer.driverName
          : undefined,
      portName: typeof printer.portName === 'string' ? printer.portName : undefined,
      status: typeof printer.status === 'string' ? printer.status : undefined,
      shared: typeof printer.shared === 'boolean' ? printer.shared : undefined,
      online: typeof printer.online === 'boolean' ? printer.online : undefined,
      connectionType: typeof printer.connectionType === 'string' ? printer.connectionType : undefined,
      default: typeof printer.default === 'boolean' ? printer.default : undefined,
      paperWidthMm: typeof printer.paperWidthMm === 'number' ? printer.paperWidthMm : undefined,
      escpos: typeof printer.escpos === 'boolean' ? printer.escpos : undefined,
      turkishCharset: typeof printer.turkishCharset === 'boolean' ? printer.turkishCharset : undefined,
      cut: typeof printer.cut === 'boolean' ? printer.cut : undefined,
      drawerPulse: typeof printer.drawerPulse === 'boolean' ? printer.drawerPulse : undefined,
    })));
    const capabilities = summarizeDeviceCapabilities(printers);

    const device = await prisma.tenantDeviceRegistry.upsert({
      where: { tenantId_deviceId: { tenantId, deviceId } },
      update: {
        branchId: body?.branchId ?? session?.branchId ?? registeredDevice?.branchId ?? null,
        hostname: body?.hostname?.slice(0, 180),
        localIp: body?.localIp?.slice(0, 80),
        bridgeVersion: body?.bridgeVersion?.slice(0, 80),
        deviceTokenHash: hashDeviceToken(body?.deviceToken),
        installedPrinters: JSON.parse(JSON.stringify(printers)) as Prisma.InputJsonValue,
        status: 'online',
        reconnectCount: Math.max(0, Math.floor(Number(body?.reconnectCount ?? 0))),
        queueDepth: Math.max(0, Math.floor(Number(body?.queueDepth ?? 0))),
        spoolerHealth: body?.spoolerHealth ?? 'healthy',
        escposCapable: capabilities.escposCapable,
        fiscalCapable: Boolean(body?.fiscalCapable),
        lastHeartbeatAt: new Date(),
        metadata: JSON.parse(JSON.stringify({ ...(body?.metadata ?? {}), capabilities })) as Prisma.InputJsonValue,
      },
      create: {
        tenantId,
        branchId: body?.branchId ?? session?.branchId ?? registeredDevice?.branchId ?? null,
        deviceId,
        hostname: body?.hostname?.slice(0, 180),
        localIp: body?.localIp?.slice(0, 80),
        bridgeVersion: body?.bridgeVersion?.slice(0, 80),
        deviceTokenHash: hashDeviceToken(body?.deviceToken),
        installedPrinters: JSON.parse(JSON.stringify(printers)) as Prisma.InputJsonValue,
        status: 'online',
        reconnectCount: Math.max(0, Math.floor(Number(body?.reconnectCount ?? 0))),
        queueDepth: Math.max(0, Math.floor(Number(body?.queueDepth ?? 0))),
        spoolerHealth: body?.spoolerHealth ?? 'healthy',
        escposCapable: capabilities.escposCapable,
        fiscalCapable: Boolean(body?.fiscalCapable),
        metadata: JSON.parse(JSON.stringify({ ...(body?.metadata ?? {}), capabilities })) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, device });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
