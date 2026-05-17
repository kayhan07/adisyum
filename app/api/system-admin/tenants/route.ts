import { NextResponse } from 'next/server';
import { isRouteResponse, requireSystemAdmin } from '@/lib/system-admin/auth';
import {
  createProvisioningJob,
  listProvisioningJobs,
  listSaasTenants,
  rollbackProvisioningJob,
  runProvisioningJob,
} from '@/lib/system-admin/provisioning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireSystemAdmin(request);
    const [tenants, jobs] = await Promise.all([listSaasTenants(), listProvisioningJobs()]);
    return NextResponse.json({
      ok: true,
      tenants,
      jobs,
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
    await runProvisioningJob(job.id);

    const [tenants, jobs] = await Promise.all([listSaasTenants(), listProvisioningJobs()]);
    return NextResponse.json({
      ok: true,
      job: jobs.find((item) => item.id === job.id) ?? job,
      tenants,
      jobs,
      generatedAt: new Date().toISOString(),
    });
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
    const job = body.action === 'rollback'
      ? await rollbackProvisioningJob(body.jobId)
      : await runProvisioningJob(body.jobId);
    const jobs = await listProvisioningJobs();
    return NextResponse.json({ ok: true, job, jobs });
  } catch (error) {
    if (isRouteResponse(error)) return error;
    console.error('[system-admin/tenants] provisioning action failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Provisioning aksiyonu basarisiz.' }, { status: 500 });
  }
}
