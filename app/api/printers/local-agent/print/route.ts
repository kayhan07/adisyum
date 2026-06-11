import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { validateCloudPrintRequest } from '@/lib/device-runtime';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const AGENT_ONLINE_WINDOW_MS = 45_000;

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId ?? 'mrk';
    const body = await request.json().catch(() => null) as {
      printerName?: string;
      printerRole?: string;
      bytesBase64?: string;
      targetDeviceId?: string;
      source?: string;
    } | null;
    const mutationId = `local-test-${randomUUID()}`;
    const validated = validateCloudPrintRequest({
      tenantId: tenant.tenantId,
      printerName: body?.printerName,
      bytesBase64: body?.bytesBase64,
      mutationId,
      targetDeviceId: body?.targetDeviceId,
    });

    if (!validated.ok) {
      return NextResponse.json({ ok: false, status: 'failed', tenantId: tenant.tenantId, branchId, error: validated.errors.join(' ') }, { status: 400 });
    }

    const activeDevice = await prisma.tenantDeviceRegistry.findFirst({
      where: {
        tenantId: tenant.tenantId,
        OR: [{ branchId }, { branchId: null }],
        revokedAt: null,
        lastHeartbeatAt: { gte: new Date(Date.now() - AGENT_ONLINE_WINDOW_MS) },
        ...(validated.targetDeviceId ? { deviceId: validated.targetDeviceId } : {}),
      },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    if (!activeDevice) {
      return NextResponse.json({
        ok: false,
        status: 'failed',
        tenantId: tenant.tenantId,
        branchId,
        code: 'agent_offline',
        error: 'Çevrimiçi Windows agent bulunamadı. Test baskısı kuyruğa alınamadı.',
      }, { status: 409 });
    }

    const job = await prisma.tenantPrintJob.create({
      data: {
        tenantId: tenant.tenantId,
        branchId,
        targetDeviceId: activeDevice.deviceId,
        printerName: validated.printerName,
        printerRole: body?.printerRole ?? 'general',
        payload: JSON.parse(JSON.stringify({ bytesBase64: body?.bytesBase64 })) as JsonRecord,
        source: body?.source ?? 'cloud:test-print',
        mutationId,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'queued',
      queued: true,
      tenantId: tenant.tenantId,
      branchId,
      deviceId: activeDevice.deviceId,
      printerName: job.printerName,
      role: job.printerRole,
      job,
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
