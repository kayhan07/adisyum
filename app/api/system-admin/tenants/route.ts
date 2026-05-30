import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  createProvisioningJob,
  exportTenantData,
  getProvisioningMetrics,
  listProvisioningJobs,
  listSaasTenants,
  recordProvisioningEvent,
  updateTenantPassword,
  updateTenantStatus,
  updateTenantSubscription,
} from '@/lib/system-admin/provisioning';
import { enqueueProvisioningRun } from '@/lib/queue/orchestration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const url = new URL(request.url);
    const exportTenantId = url.searchParams.get('exportTenantId');
    if (exportTenantId) {
      const exported = await exportTenantData(exportTenantId);
      return NextResponse.json({ ok: true, export: exported, generatedAt: new Date().toISOString() });
    }
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
    return NextResponse.json({ ok: false, error: 'Tenant listesi alınamadı.' }, { status: 500 });
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
    const admin = await requireSystemAdmin(request);
    const body = await request.json().catch(() => ({})) as {
      action?: 'retry' | 'rollback' | 'update_subscription' | 'update_password' | 'update_status';
      jobId?: string;
      tenantId?: string;
      startsAt?: string;
      endsAt?: string;
      addDays?: number;
      addMonths?: number;
      addYears?: number;
      unlimitedLicense?: boolean;
      subscriptionStatus?: 'active' | 'trial' | 'demo' | 'past_due' | 'canceled' | 'expired' | 'suspended';
      tenantStatus?: 'active' | 'suspended' | 'expired' | 'trial' | 'demo' | 'blocked' | 'disabled';
      billingPeriod?: 'monthly' | 'quarterly' | 'yearly';
      packageType?: 'mini' | 'gold' | 'premium';
      username?: string;
      password?: string;
      temporaryPassword?: string;
      forcePasswordChange?: boolean;
    };

    if (body.action === 'update_subscription') {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId zorunludur.' }, { status: 400 });
      const subscription = await updateTenantSubscription({
        action: 'update_subscription',
        tenantId: body.tenantId,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        addDays: body.addDays,
        addMonths: body.addMonths,
        addYears: body.addYears,
        unlimitedLicense: body.unlimitedLicense,
        status: body.subscriptionStatus,
        billingPeriod: body.billingPeriod,
        packageType: body.packageType,
        requestedBy: admin.userId,
      });
      const [tenants, jobs, provisioningMetrics] = await Promise.all([listSaasTenants(), listProvisioningJobs(), getProvisioningMetrics()]);
      return NextResponse.json({ ok: true, subscription, tenants, jobs, provisioningMetrics });
    }

    if (body.action === 'update_password') {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId zorunludur.' }, { status: 400 });
      const user = await updateTenantPassword({
        action: 'update_password',
        tenantId: body.tenantId,
        username: body.username,
        password: body.password,
        temporaryPassword: body.temporaryPassword,
        forcePasswordChange: body.forcePasswordChange,
        requestedBy: admin.userId,
      });
      return NextResponse.json({ ok: true, user });
    }

    if (body.action === 'update_status') {
      if (!body.tenantId || !body.tenantStatus) return NextResponse.json({ ok: false, error: 'tenantId ve tenantStatus zorunludur.' }, { status: 400 });
      const tenant = await updateTenantStatus({
        action: 'update_status',
        tenantId: body.tenantId,
        status: body.tenantStatus,
        requestedBy: admin.userId,
      });
      const [tenants, jobs, provisioningMetrics] = await Promise.all([listSaasTenants(), listProvisioningJobs(), getProvisioningMetrics()]);
      return NextResponse.json({ ok: true, tenant, tenants, jobs, provisioningMetrics });
    }

    if (!body.jobId || !body.action) {
      return NextResponse.json({ ok: false, error: 'jobId ve action zorunludur.' }, { status: 400 });
    }
    if (body.action !== 'retry' && body.action !== 'rollback') {
      return NextResponse.json({ ok: false, error: 'Gecersiz tenant aksiyonu.' }, { status: 400 });
    }
    const existing = await listProvisioningJobs();
    const current = existing.find((item) => item.id === body.jobId);
    if (!current) return NextResponse.json({ ok: false, error: 'Provisioning job bulunamadı.' }, { status: 404 });
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Provisioning aksiyonu başarısız.' }, { status: 500 });
  }
}
