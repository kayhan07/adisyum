import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function metadataObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? { ...(input as Record<string, unknown>) }
    : {};
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanMetadata(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject;
}

function companyPayload(input: {
  tenantId: string;
  branchId: string;
  tradeName: string;
  branchName: string;
  taxNumber: string;
  metadata: Record<string, unknown>;
}) {
  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    tradeName: input.tradeName,
    branchName: input.branchName,
    logoUrl: stringField(input.metadata.logoUrl),
    taxOffice: stringField(input.metadata.taxOffice),
    taxNumber: input.taxNumber,
    phone: stringField(input.metadata.phone),
    email: stringField(input.metadata.email),
    address: stringField(input.metadata.address),
  };
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId || 'mrk';
    const [tenantRecord, branch] = await Promise.all([
      prisma.tenant.findUnique({
        where: { tenantId: tenant.tenantId },
        select: { name: true, legalName: true, taxNumber: true, metadata: true },
      }),
      prisma.branch.findUnique({
        where: { tenantId_branchId: { tenantId: tenant.tenantId, branchId } },
        select: { name: true },
      }).catch(() => null),
    ]);

    if (!tenantRecord) {
      return NextResponse.json({ ok: false, error: 'Tenant bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      company: companyPayload({
        tenantId: tenant.tenantId,
        branchId,
        tradeName: tenantRecord.legalName || tenantRecord.name,
        branchName: branch?.name || 'Merkez Şube',
        taxNumber: tenantRecord.taxNumber || '',
        metadata: metadataObject(tenantRecord.metadata),
      }),
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId || 'mrk';
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await prisma.tenant.findUnique({
      where: { tenantId: tenant.tenantId },
      select: { name: true, legalName: true, taxNumber: true, metadata: true },
    });

    if (!current) {
      return NextResponse.json({ ok: false, error: 'Tenant bulunamadı.' }, { status: 404 });
    }

    const tradeName = stringField(body.tradeName);
    const branchName = stringField(body.branchName);
    const taxNumber = stringField(body.taxNumber);
    const metadata = cleanMetadata({
      ...metadataObject(current.metadata),
      logoUrl: stringField(body.logoUrl) || undefined,
      taxOffice: stringField(body.taxOffice) || undefined,
      phone: stringField(body.phone) || undefined,
      email: stringField(body.email) || undefined,
      address: stringField(body.address) || undefined,
      profileUpdatedAt: new Date().toISOString(),
      profileUpdatedBy: tenant.userId,
    });

    const [updatedTenant, updatedBranch] = await prisma.$transaction([
      prisma.tenant.update({
        where: { tenantId: tenant.tenantId },
        data: {
          name: tradeName || current.name,
          legalName: tradeName || current.legalName,
          taxNumber: taxNumber || null,
          metadata,
        },
        select: { name: true, legalName: true, taxNumber: true, metadata: true },
      }),
      prisma.branch.upsert({
        where: { tenantId_branchId: { tenantId: tenant.tenantId, branchId } },
        update: branchName ? { name: branchName } : {},
        create: {
          tenantId: tenant.tenantId,
          branchId,
          name: branchName || 'Merkez Şube',
          active: true,
        },
        select: { name: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      company: companyPayload({
        tenantId: tenant.tenantId,
        branchId,
        tradeName: updatedTenant.legalName || updatedTenant.name,
        branchName: updatedBranch.name,
        taxNumber: updatedTenant.taxNumber || '',
        metadata: metadataObject(updatedTenant.metadata),
      }),
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('[settings/company] update failed', { message: error.message });
    }
    return tenantAuthErrorResponse(error);
  }
}
