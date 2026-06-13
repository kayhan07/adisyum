import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { normalizeJsonObject } from '@/lib/db/prisma-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportRow = {
  rowNumber: number;
  name: string;
  type: 'customer' | 'supplier' | 'staff' | 'other';
  phone: string;
  email: string;
  taxNumber: string;
  taxOffice: string;
  address: string;
  openingBalance: number;
  balanceDirection: 'debit' | 'credit';
  currency: string;
  note: string;
  group: string;
};

function decodeDelimitedBuffer(buffer: Buffer) {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function parseDelimitedText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
      if (line.includes(';')) return line.split(';').map((cell) => cell.trim());
      return line.split(',').map((cell) => cell.trim());
    });
}

function normalizeType(value: string): ImportRow['type'] {
  const normalized = value.trim().toLocaleLowerCase('tr-TR');
  if (['tedarikçi', 'tedarikci', 'supplier'].includes(normalized)) return 'supplier';
  if (['personel', 'staff'].includes(normalized)) return 'staff';
  if (['diğer', 'diger', 'other'].includes(normalized)) return 'other';
  return 'customer';
}

function normalizeDirection(value: string): ImportRow['balanceDirection'] {
  const normalized = value.trim().toLocaleLowerCase('tr-TR');
  return ['alacak', 'credit'].includes(normalized) ? 'credit' : 'debit';
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function accountCode(type: ImportRow['type'], index: number) {
  const prefix = type === 'supplier' ? 'SUP' : type === 'staff' ? 'STF' : type === 'other' ? 'OTH' : 'CUS';
  return `${prefix}-${String(index).padStart(3, '0')}`;
}

function rowToImport(cells: string[], rowNumber: number): ImportRow {
  return {
    rowNumber,
    name: cells[0]?.trim() ?? '',
    type: normalizeType(cells[1] ?? ''),
    phone: cells[2]?.trim() ?? '',
    email: cells[3]?.trim() ?? '',
    taxNumber: cells[4]?.trim() ?? '',
    taxOffice: cells[5]?.trim() ?? '',
    address: cells[6]?.trim() ?? '',
    openingBalance: parseMoney(cells[7] ?? '0'),
    balanceDirection: normalizeDirection(cells[8] ?? ''),
    currency: (cells[9]?.trim() || 'TRY').toUpperCase(),
    note: cells[10]?.trim() ?? '',
    group: cells[11]?.trim() ?? '',
  };
}

async function findDuplicate(tx: Prisma.TransactionClient, tenantId: string, row: ImportRow) {
  const candidates = row.type === 'supplier'
    ? await tx.supplier.findMany({
        where: { tenantId },
        select: { id: true, name: true, phone: true, metadata: true },
        take: 5000,
      })
    : await tx.customer.findMany({
        where: { tenantId },
        select: { id: true, name: true, phone: true, metadata: true },
        take: 5000,
      });
  const rowName = normalizeName(row.name);
  return candidates.find((candidate) => {
    const metadata = candidate.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata) ? candidate.metadata as Record<string, unknown> : {};
    const candidateTaxNumber = typeof metadata.taxNumber === 'string' ? metadata.taxNumber.trim() : '';
    if (row.taxNumber && candidateTaxNumber && row.taxNumber === candidateTaxNumber) return true;
    return normalizeName(candidate.name) === rowName && String(candidate.phone ?? '').trim() === row.phone;
  }) ?? null;
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const duplicatePolicy = String(formData.get('duplicatePolicy') ?? 'skip') === 'update' ? 'update' : 'skip';
    const dryRun = String(formData.get('dryRun') ?? 'false') === 'true';
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı.' }, { status: 400 });

    const rows = parseDelimitedText(decodeDelimitedBuffer(Buffer.from(await file.arrayBuffer())));
    const dataRows = rows[0]?.some((cell) => /cari|ünvan|unvan|tip/i.test(cell)) ? rows.slice(1) : rows;
    const valid: ImportRow[] = [];
    const errors: Array<{ rowNumber: number; message: string }> = [];
    dataRows.forEach((cells, index) => {
      const row = rowToImport(cells, index + 2);
      if (!row.name) errors.push({ rowNumber: row.rowNumber, message: 'Cari adı zorunlu.' });
      else valid.push(row);
    });

    const importId = `cari-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const summary = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let openingMovements = 0;
      const previewRows = [];

      for (const [index, row] of valid.entries()) {
        const duplicate = await findDuplicate(tx, tenant.tenantId, row);
        const metadata = normalizeJsonObject({
          source: 'excel_import',
          importId,
          rowNumber: row.rowNumber,
          accountType: row.type,
          originalName: row.name,
          taxNumber: row.taxNumber,
          taxOffice: row.taxOffice,
          address: row.address,
          currency: row.currency,
          note: row.note,
          group: row.group,
        });
        previewRows.push({ rowNumber: row.rowNumber, name: row.name, type: row.type, duplicate: Boolean(duplicate), openingBalance: row.openingBalance });
        if (dryRun) continue;
        if (duplicate && duplicatePolicy === 'skip') {
          skipped += 1;
          continue;
        }
        const account = row.type === 'supplier'
          ? duplicate
            ? await tx.supplier.update({ where: { id: duplicate.id }, data: { name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
            : await tx.supplier.create({ data: { tenantId: tenant.tenantId, name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
          : duplicate
            ? await tx.customer.update({ where: { id: duplicate.id }, data: { name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
            : await tx.customer.create({ data: { tenantId: tenant.tenantId, name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } });
        duplicate ? updated += 1 : created += 1;
        if (row.openingBalance > 0) {
          const reconciliationKey = `${importId}:${row.rowNumber}:opening`;
          await tx.currentAccountMovement.upsert({
            where: { tenantId_reconciliationKey: { tenantId: tenant.tenantId, reconciliationKey } },
            update: {},
            create: {
              tenantId: tenant.tenantId,
              accountId: account.id,
              customerId: row.type === 'supplier' ? null : account.id,
              reconciliationKey,
              type: 'OPENING_BALANCE',
              method: 'import',
              debit: row.balanceDirection === 'debit' ? row.openingBalance : 0,
              credit: row.balanceDirection === 'credit' ? row.openingBalance : 0,
              balanceAfter: row.balanceDirection === 'debit' ? row.openingBalance : -row.openingBalance,
              description: 'opening_balance_import',
              createdBy: tenant.userId,
              metadata: normalizeJsonObject({ source: 'excel_import', rowNumber: row.rowNumber, importId, originalName: row.name }),
            },
          });
          openingMovements += 1;
        }
      }

      if (!dryRun) {
        await writeAuditLog({
          tenantId: tenant.tenantId,
          userId: tenant.userId,
          action: 'system_admin_action',
          entity: 'current_account',
          entityId: importId,
          metadata: normalizeJsonObject({ importId, created, updated, skipped, openingMovements, errorCount: errors.length }),
          db: tx,
        });
      }

      return { created, updated, skipped, openingMovements, valid: valid.length, errors, previewRows };
    });

    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, dryRun, duplicatePolicy, importId, ...summary });
  } catch (error) {
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    console.error('[finance/current-accounts/import] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Cari import yapılamadı.' }, { status: 500 });
  }
}
