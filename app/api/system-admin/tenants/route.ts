import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  createProvisioningJob,
  getProvisioningMetrics,
  listProvisioningJobs,
  listSaasTenants,
  recordProvisioningEvent,
} from '@/lib/system-admin/provisioning';
import { enqueueProvisioningRun } from '@/lib/queue/orchestration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const [tenants, jobs, provisioningMetrics] = await Promise.all([listSaasTenants(), listProvisioningJobs(), getProvisioningMetrics()]);
    return NextResponse.json({
      ok: true,
      tenants,
      jobs,
      provisioningMetrics,
      summary: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === 'active' || tenant.status === 'trial' || tenant.status === 'demo').length,
        expiredTenants: tenants.filter((tenant) => tenant.status === 'expired' || tenant.subscriptionStatus === 'expired').length,
        totalBranches: tenants.reduce((sum, tenant) => sum + tenant.branchCount, 0),
        activeUsers: tenants.reduce((sum, tenant) => sum + tenant.activeUsers, 0),
        dailyOrders: tenants.reduce((sum, tenant) => sum + tenant.dailyOrders, 0),
        liveRevenue: tenants.reduce((sum, tenant) => sum + tenant.dailyRevenue, 0),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/tenants] list failed', error);
    return NextResponse.json({ ok: false, error: 'Tenant listesi alinamadi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as {
      tenantId?: string;
      companyName?: string;
      legalName?: string;
      taxNumber?: string;
      packageType?: 'mini' | 'gold' | 'premium';
      billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
      status?: 'trial' | 'active' | 'suspended' | 'cancelled';
      trialDays?: number;
      startsAt?: string;
      endsAt?: string;
      branchId?: string;
      branchName?: string;
      adminUsername?: string;
      adminPassword?: string;
      adminName?: string;
      adminEmail?: string;
      initialBalance?: number;
      kontorBalance?: number;
      branchLimit?: number;
      seats?: number;
    };

    if (!body.companyName?.trim()) {
      return NextResponse.json({ ok: false, error: 'companyName zorunludur.' }, { status: 400 });
    }

    const job = await createProvisioningJob({
      ...body,
      companyName: body.companyName,
      createdBy: admin.userId,
    });
    await enqueueProvisioningRun({
      action: 'run',
      provisioningJobId: job.id,
      tenantId: job.targetTenantId,
      requestedBy: admin.userId,
    });
    await recordProvisioningEvent(job.id, {
      type: 'queue_scheduled',
      message: 'Provisioning queued for background worker execution.',
      metadata: { queue: 'onboarding', action: 'run', tenantId: job.targetTenantId },
      source: 'system-admin-api',
    });

    const [tenants, jobs, provisioningMetrics] = await Promise.all([listSaasTenants(), listProvisioningJobs(), getProvisioningMetrics()]);
    return NextResponse.json({
      ok: true,
      job: jobs.find((item) => item.id === job.id) ?? job,
      tenants,
      jobs,
      provisioningMetrics,
      generatedAt: new Date().toISOString(),
    }, { status: 202 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/tenants] provisioning failed', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Tenant provision edilemedi.',
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as { jobId?: string; action?: 'retry' | 'rollback' };
    if (!body.jobId || !body.action) {
      return NextResponse.json({ ok: false, error: 'jobId ve action zorunludur.' }, { status: 400 });
    }
    const existing = await listProvisioningJobs();
    const current = existing.find((item) => item.id === body.jobId);
    if (!current) return NextResponse.json({ ok: false, error: 'Provisioning job bulunamadi.' }, { status: 404 });
    if (body.action === 'rollback') {
      await enqueueProvisioningRun({
        action: 'rollback',
        provisioningJobId: body.jobId,
        tenantId: current.targetTenantId,
        requestedBy: current.requestedBy,
      });
    } else {
      await enqueueProvisioningRun({
        action: 'run',
        provisioningJobId: body.jobId,
        tenantId: current.targetTenantId,
        requestedBy: current.requestedBy,
      });
    }
    await recordProvisioningEvent(body.jobId, {
      type: body.action === 'rollback' ? 'rollback_queued' : 'retry_queued',
      severity: body.action === 'rollback' ? 'warning' : 'info',
      message: body.action === 'rollback' ? 'Rollback queued for worker execution.' : 'Retry queued for worker execution.',
      metadata: { action: body.action, queue: 'onboarding', tenantId: current.targetTenantId },
      source: 'system-admin-api',
    });
    const [jobs, provisioningMetrics] = await Promise.all([listProvisioningJobs(), getProvisioningMetrics()]);
    return NextResponse.json({ ok: true, job: jobs.find((item) => item.id === body.jobId), jobs, provisioningMetrics }, { status: 202 });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/tenants] provisioning action failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Provisioning aksiyonu basarisiz.' }, { status: 500 });
  }
}
