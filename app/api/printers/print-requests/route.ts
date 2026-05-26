import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { validateCloudPrintRequest } from '@/lib/device-runtime';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId') ?? undefined;
    const jobs = await prisma.tenantPrintJob.findMany({
      where: {
        tenantId: tenant.tenantId,
        status: { in: ['pending', 'failed'] },
        ...(deviceId ? { targetDeviceId: deviceId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json().catch(() => null) as {
      printerName?: string;
      printerRole?: string;
      bytesBase64?: string;
      mutationId?: string;
      targetDeviceId?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    } | null;

    const validated = validateCloudPrintRequest({
      tenantId: tenant.tenantId,
      printerName: body?.printerName,
      bytesBase64: body?.bytesBase64,
      mutationId: body?.mutationId,
      targetDeviceId: body?.targetDeviceId,
    });
    if (!validated.ok) {
      return NextResponse.json({ ok: false, errors: validated.errors }, { status: 400 });
    }

    const activeDevice = validated.targetDeviceId
      ? await prisma.tenantDeviceRegistry.findFirst({ where: { tenantId: tenant.tenantId, deviceId: validated.targetDeviceId, status: 'online', revokedAt: null } })
      : await prisma.tenantDeviceRegistry.findFirst({
          where: { tenantId: tenant.tenantId, branchId: tenant.branchId ?? undefined, status: 'online', revokedAt: null },
          orderBy: { lastHeartbeatAt: 'desc' },
        });

    if (!activeDevice) {
      return NextResponse.json({ ok: false, error: 'No active printer bridge registered for tenant/branch.', code: 'no_active_bridge' }, { status: 409 });
    }

    const job = await prisma.tenantPrintJob.upsert({
      where: { tenantId_mutationId: { tenantId: tenant.tenantId, mutationId: validated.mutationId } },
      update: {
        targetDeviceId: activeDevice.deviceId,
        printerName: validated.printerName,
        printerRole: body?.printerRole ?? 'cashier',
        payload: JSON.parse(JSON.stringify({ bytesBase64: body?.bytesBase64, metadata: body?.metadata ?? {} })) as Prisma.InputJsonValue,
        status: 'pending',
        lastError: null,
      },
      create: {
        tenantId: tenant.tenantId,
        branchId: tenant.branchId,
        targetDeviceId: activeDevice.deviceId,
        printerName: validated.printerName,
        printerRole: body?.printerRole ?? 'cashier',
        payload: JSON.parse(JSON.stringify({ bytesBase64: body?.bytesBase64, metadata: body?.metadata ?? {} })) as Prisma.InputJsonValue,
        source: body?.source ?? 'cloud',
        mutationId: validated.mutationId,
      },
    });

    await publishTenantEvent(tenant.tenantId, 'system', {
      type: 'printer.job.queued',
      jobId: job.id,
      targetDeviceId: job.targetDeviceId,
      printerName: job.printerName,
      mutationId: job.mutationId,
    }).catch((eventError) => {
      console.warn('[print-requests] tenant event publish failed', {
        timestamp: new Date().toISOString(),
        tenantId: tenant.tenantId,
        jobId: job.id,
        targetDeviceId: job.targetDeviceId,
        mutationId: job.mutationId,
        error: eventError instanceof Error ? eventError.message : String(eventError),
      });
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json().catch(() => null) as {
      jobId?: string;
      deviceId?: string;
      status?: 'printing' | 'printed' | 'failed' | 'dead';
      error?: string;
    } | null;
    if (!body?.jobId || !body?.deviceId || !body?.status) {
      return NextResponse.json({ ok: false, error: 'jobId, deviceId and status are required.' }, { status: 400 });
    }

    const job = await prisma.tenantPrintJob.updateMany({
      where: {
        tenantId: tenant.tenantId,
        id: body.jobId,
        targetDeviceId: body.deviceId,
      },
      data: {
        status: body.status,
        attempts: { increment: body.status === 'failed' ? 1 : 0 },
        lastError: body.error ?? null,
        lockedBy: body.status === 'printing' ? body.deviceId : null,
        lockedAt: body.status === 'printing' ? new Date() : null,
        printedAt: body.status === 'printed' ? new Date() : null,
      },
    });

    if (job.count === 0) return NextResponse.json({ ok: false, error: 'Print job not found for this device.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
