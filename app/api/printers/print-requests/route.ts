import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { toPrismaJson } from '@/lib/db/prisma-json';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { validateCloudPrintRequest } from '@/lib/device-runtime';
import { publishTenantEvent } from '@/lib/realtime/tenant-events';
import { authenticateRegisteredDevice } from '@/lib/server/device-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_ONLINE_WINDOW_MS = 45_000;

export async function GET(request: Request) {
  try {
    const registeredDevice = await authenticateRegisteredDevice(request);
    const tenant = registeredDevice ?? await requireTenant(request);
    const url = new URL(request.url);
    const requestedDeviceId = url.searchParams.get('deviceId') ?? undefined;
    if (registeredDevice && requestedDeviceId && requestedDeviceId !== registeredDevice.deviceId) {
      return NextResponse.json({ ok: false, error: 'Cihaz kimliği eşleşmiyor.' }, { status: 403 });
    }
    const deviceId = registeredDevice?.deviceId ?? requestedDeviceId;
    const branchId = tenant.branchId ?? registeredDevice?.branchId ?? 'mrk';
    const jobs = await prisma.tenantPrintJob.findMany({
      where: {
        tenantId: tenant.tenantId,
        OR: [{ branchId }, { branchId: null }],
        status: { in: ['pending', 'failed'] },
        ...(deviceId ? { targetDeviceId: deviceId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, branchId, jobs });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId ?? 'mrk';
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
      return NextResponse.json({ ok: false, tenantId: tenant.tenantId, branchId, errors: validated.errors }, { status: 400 });
    }

    const activeDevice = validated.targetDeviceId
      ? await prisma.tenantDeviceRegistry.findFirst({
          where: {
            tenantId: tenant.tenantId,
            deviceId: validated.targetDeviceId,
            OR: [{ branchId }, { branchId: null }],
            status: 'online',
            revokedAt: null,
            lastHeartbeatAt: { gte: new Date(Date.now() - AGENT_ONLINE_WINDOW_MS) },
          },
        })
      : await prisma.tenantDeviceRegistry.findFirst({
          where: {
            tenantId: tenant.tenantId,
            OR: [{ branchId }, { branchId: null }],
            status: 'online',
            revokedAt: null,
            lastHeartbeatAt: { gte: new Date(Date.now() - AGENT_ONLINE_WINDOW_MS) },
          },
          orderBy: { lastHeartbeatAt: 'desc' },
        });

    if (!activeDevice) {
      return NextResponse.json({ ok: false, tenantId: tenant.tenantId, branchId, error: 'No active printer bridge registered for tenant/branch.', code: 'no_active_bridge' }, { status: 409 });
    }

    const existingJob = await prisma.tenantPrintJob.findUnique({
      where: { tenantId_mutationId: { tenantId: tenant.tenantId, mutationId: validated.mutationId } },
    });
    if (existingJob && !['pending', 'failed'].includes(existingJob.status)) {
      return NextResponse.json({
        ok: true,
        status: existingJob.status,
        duplicate: true,
        tenantId: tenant.tenantId,
        branchId,
        deviceId: existingJob.targetDeviceId,
        printerName: existingJob.printerName,
        role: existingJob.printerRole,
        job: existingJob,
      });
    }

    const job = existingJob
      ? await prisma.tenantPrintJob.update({
          where: { tenantId_mutationId: { tenantId: tenant.tenantId, mutationId: validated.mutationId } },
          data: {
            branchId,
            targetDeviceId: activeDevice.deviceId,
            printerName: validated.printerName,
            printerRole: body?.printerRole ?? 'general',
            payload: toPrismaJson({ bytesBase64: body?.bytesBase64, metadata: body?.metadata ?? {} }),
            status: 'pending',
            lastError: null,
          },
        })
      : await prisma.tenantPrintJob.create({
          data: {
            tenantId: tenant.tenantId,
            branchId,
            targetDeviceId: activeDevice.deviceId,
            printerName: validated.printerName,
            printerRole: body?.printerRole ?? 'general',
            payload: toPrismaJson({ bytesBase64: body?.bytesBase64, metadata: body?.metadata ?? {} }),
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
        branchId,
        jobId: job.id,
        targetDeviceId: job.targetDeviceId,
        mutationId: job.mutationId,
        error: eventError instanceof Error ? eventError.message : String(eventError),
      });
    });

    return NextResponse.json({
      ok: true,
      status: 'queued',
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

export async function PATCH(request: Request) {
  try {
    const registeredDevice = await authenticateRegisteredDevice(request);
    const tenant = registeredDevice ?? await requireTenant(request);
    const body = await request.json().catch(() => null) as {
      jobId?: string;
      deviceId?: string;
      status?: 'printing' | 'printed' | 'failed' | 'dead';
      error?: string;
    } | null;
    if (!body?.jobId || !body?.deviceId || !body?.status) {
      return NextResponse.json({ ok: false, error: 'jobId, deviceId and status are required.' }, { status: 400 });
    }
    if (registeredDevice && body.deviceId !== registeredDevice.deviceId) {
      return NextResponse.json({ ok: false, error: 'Cihaz kimliği eşleşmiyor.' }, { status: 403 });
    }

    const branchId = tenant.branchId ?? registeredDevice?.branchId ?? 'mrk';
    const job = await prisma.tenantPrintJob.updateMany({
      where: {
        tenantId: tenant.tenantId,
        OR: [{ branchId }, { branchId: null }],
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
    if (body.status === 'printed') {
      await publishTenantEvent(tenant.tenantId, 'system', {
        type: 'receipt.printed',
        branchId,
        jobId: body.jobId,
        deviceId: body.deviceId,
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, branchId });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}
