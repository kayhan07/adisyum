import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = Number(record[key]);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

async function accountBalance(tenantId: string, accountId: string) {
  const aggregate = await prisma.currentAccountMovement.aggregate({
    where: { tenantId, accountId },
    _sum: { debit: true, credit: true },
  });
  return Number(((Number(aggregate._sum.debit ?? 0) - Number(aggregate._sum.credit ?? 0))).toFixed(2));
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId')?.trim();
    const [movements, customers, suppliers] = await Promise.all([
      prisma.currentAccountMovement.findMany({
        where: { tenantId: tenant.tenantId, ...(accountId ? { accountId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.customer.findMany({
        where: { tenantId: tenant.tenantId, ...(accountId ? { id: accountId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { id: true, name: true, phone: true, metadata: true },
      }),
      prisma.supplier.findMany({
        where: { tenantId: tenant.tenantId, ...(accountId ? { id: accountId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { id: true, name: true, phone: true, metadata: true },
      }),
    ]);
    const mapAccount = (account: { id: string; name: string; phone: string | null; metadata: unknown }, type: 'customer' | 'supplier') => {
      const metadata = isRecord(account.metadata) ? account.metadata : {};
      return {
        id: account.id,
        code: stringField(metadata, 'code') || `${type === 'supplier' ? 'SUP' : 'CUS'}-${account.id.slice(0, 8)}`,
        name: account.name,
        type,
        openingBalance: 0,
        phone: account.phone ?? '',
        address: stringField(metadata, 'address'),
        taxOffice: stringField(metadata, 'taxOffice'),
        taxNumber: stringField(metadata, 'taxNumber'),
        invoiceTitle: stringField(metadata, 'invoiceTitle') || account.name,
      };
    };
    const accounts = [
      ...customers.map((account) => mapAccount(account, 'customer')),
      ...suppliers.map((account) => mapAccount(account, 'supplier')),
    ];
    return NextResponse.json({ ok: true, source: 'db', movements, accounts });
  } catch (error) {
    console.error('[cari-flow] current account movement list failed', error);
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Cari hareketleri yüklenemedi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const body = await request.json().catch(() => null);
    const record = isRecord(body) ? body : {};
    const action = stringField(record, 'action');
    const accountId = stringField(record, 'accountId');
    const reconciliationKey = stringField(record, 'reconciliationKey');
    const amount = numberField(record, 'amount');
    const method = stringField(record, 'method') || 'cash';
    const description = stringField(record, 'description');
    const accountName = stringField(record, 'accountName');
    const accountType = stringField(record, 'accountType');

    if (!['record_debt', 'record_refund', 'record_collection', 'record_payment', 'record_adjustment', 'sync_reservation_deposit'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Desteklenmeyen cari hareketi.' }, { status: 400 });
    }
    if (!accountId || !reconciliationKey || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Cari hesap, tutar ve mutabakat anahtarı zorunludur.' }, { status: 400 });
    }

    const movement = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenant.tenantId}), hashtext(${accountId}))`;
      const duplicate = await tx.currentAccountMovement.findUnique({
        where: { tenantId_reconciliationKey: { tenantId: tenant.tenantId, reconciliationKey } },
      });
      if (duplicate) {
        if (action === 'sync_reservation_deposit') {
          const totals = await tx.currentAccountMovement.aggregate({
            where: { tenantId: tenant.tenantId, accountId },
            _sum: { debit: true, credit: true },
          });
          const currentBalance = Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0);
          return tx.currentAccountMovement.update({
            where: { id: duplicate.id },
            data: {
              credit: amount,
              balanceAfter: Number((currentBalance + Number(duplicate.credit) - amount).toFixed(2)),
              description: description || duplicate.description,
              metadata: { action, accountName, accountType, source: 'finance-current-account-movements' },
            },
          });
        }
        console.warn('[cari-flow] duplicate movement ignored', {
          tenantId: tenant.tenantId,
          accountId,
          reconciliationKey,
          movementId: duplicate.id,
        });
        return duplicate;
      }
      const totals = await tx.currentAccountMovement.aggregate({
        where: { tenantId: tenant.tenantId, accountId },
        _sum: { debit: true, credit: true },
      });
      const previousBalance = Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0);
      const isDebt = action === 'record_debt' || action === 'record_refund';
      const isAdjustment = action === 'record_adjustment';
      const isReservationDeposit = action === 'sync_reservation_deposit';
      const debit = isDebt ? amount : 0;
      const credit = isDebt ? 0 : amount;
      const created = await tx.currentAccountMovement.create({
        data: {
          tenantId: tenant.tenantId,
          accountId,
          reconciliationKey,
          type: action === 'record_refund' ? 'REFUND' : isDebt ? 'SALE_DEBT' : isAdjustment ? 'ADJUSTMENT' : 'PAYMENT',
          method,
          debit,
          credit,
          balanceAfter: Number((previousBalance + debit - credit).toFixed(2)),
          description: description || (action === 'record_collection' || isReservationDeposit ? 'Cari tahsilat' : 'Cari ödeme'),
          createdBy: tenant.userId,
          metadata: { action, accountName, accountType, source: 'finance-current-account-movements' },
        },
      });
      if (!isDebt && method === 'cash') {
        await tx.cashTransaction.create({
          data: {
            tenantId: tenant.tenantId,
            type: action === 'record_collection' ? 'current_account_collection' : 'current_account_payment',
            amount: action === 'record_collection' ? amount : -amount,
            note: created.description,
            metadata: {
              accountId,
              movementId: created.id,
              reconciliationKey,
              source: 'finance-current-account-movements',
            },
          },
        });
      }
      return created;
    });

    return NextResponse.json({
      ok: true,
      source: 'db',
      movement,
      balance: await accountBalance(tenant.tenantId, accountId),
    });
  } catch (error) {
    console.error('[cari-flow] current account mutation failed', error);
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Cari işlemi kaydedilemedi.' }, { status: 500 });
  }
}
