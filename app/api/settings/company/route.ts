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

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const [tenantRecord, branch] = await Promise.all([
      prisma.tenant.findUnique({
        where: { tenantId: tenant.tenantId },
        select: { name: true, legalName: true, taxNumber: true, metadata: true },
      }),
      prisma.branch.findUnique({
        where: { tenantId_branchId: { tenantId: tenant.tenantId, branchId: tenant.branchId || 'mrk' } },
        select: { name: true },
      }).catch(() => null),
    ]);

    if (!tenantRecord) {
      return NextResponse.json({ ok: false, error: 'Tenant bulunamadı.' }, { status: 404 });
    }

    const metadata = metadataObject(tenantRecord.metadata);
    return NextResponse.json({
      ok: true,
      company: {
        tradeName: tenantRecord.legalName || tenantRecord.name,
        branchName: branch?.name || 'Merkez Şube',
        logoUrl: stringField(metadata.logoUrl),
        taxOffice: stringField(metadata.taxOffice),
        taxNumber: tenantRecord.taxNumber || '',
        phone: stringField(metadata.phone),
        email: stringField(metadata.email),
        address: stringField(metadata.address),
      },
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const tenant = await requireTenant(request);
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
        where: { tenantId_branchId: { tenantId: tenant.tenantId, branchId: tenant.branchId || 'mrk' } },
        update: branchName ? { name: branchName } : {},
        create: {
          tenantId: tenant.tenantId,
          branchId: tenant.branchId || 'mrk',
          name: branchName || 'Merkez Şube',
          active: true,
        },
        select: { name: true },
      }),
    ]);

    const nextMetadata = metadataObject(updatedTenant.metadata);
    return NextResponse.json({
      ok: true,
      company: {
        tradeName: updatedTenant.legalName || updatedTenant.name,
        branchName: updatedBranch.name,
        logoUrl: stringField(nextMetadata.logoUrl),
        taxOffice: stringField(nextMetadata.taxOffice),
        taxNumber: updatedTenant.taxNumber || '',
        phone: stringField(nextMetadata.phone),
        email: stringField(nextMetadata.email),
        address: stringField(nextMetadata.address),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('[settings/company] update failed', { message: error.message });
    }
    return tenantAuthErrorResponse(error);
  }
}
