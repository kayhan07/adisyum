import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { normalizeJsonObject } from '@/lib/db/prisma-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccountType = 'customer' | 'supplier' | 'staff' | 'other';
type BalanceDirection = 'debit' | 'credit';

type ImportRow = {
  rowNumber: number;
  name: string;
  type: AccountType;
  phone: string;
  email: string;
  taxNumber: string;
  taxOffice: string;
  address: string;
  city: string;
  district: string;
  openingBalance: number;
  explicitBalanceDirection: BalanceDirection | null;
  balanceDirection: BalanceDirection;
  currency: string;
  note: string;
  group: string;
};

type DuplicateCandidate = {
  id: string;
  name: string;
  phone: string | null;
  metadata: Prisma.JsonValue;
};

const NAME_HEADERS = ['cari adı', 'cari adi', 'ünvan', 'unvan', 'müşteri adı', 'musteri adi', 'firma adı', 'firma adi'];
const TYPE_HEADERS = ['tip', 'cari tipi', 'tür', 'tur', 'müşteri/tedarikçi', 'musteri/tedarikci', 'hesap tipi'];
const BALANCE_HEADERS = ['açılış bakiye', 'acilis bakiye', 'bakiye', 'açılış bakiyesi', 'acilis bakiyesi'];
const BALANCE_DIRECTION_HEADERS = ['bakiye tipi', 'borç/alacak', 'borc/alacak', 'yön', 'yon', 'direction'];

function decodeDelimitedBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le').replace(/^\uFEFF/, '');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.subarray(2).swap16().toString('utf16le').replace(/^\uFEFF/, '');
  }
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

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function headerIndex(headers: string[], candidates: string[], fallback: number) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const index = normalizedHeaders.findIndex((header) => candidates.includes(header));
  return index >= 0 ? index : fallback;
}

function cell(cells: string[], indexes: Record<string, number>, key: string) {
  const index = indexes[key];
  return index >= 0 ? cells[index]?.trim() ?? '' : '';
}

function normalizeType(value: string): AccountType {
  const normalized = value.trim().toLocaleLowerCase('tr-TR');
  if (['tedarikçi', 'tedarikci', 'supplier', 'satıcı', 'satici', 'vendor'].includes(normalized)) return 'supplier';
  if (['personel', 'staff'].includes(normalized)) return 'staff';
  if (['diğer', 'diger', 'other'].includes(normalized)) return 'other';
  if (['müşteri', 'musteri', 'customer', 'alıcı', 'alici', 'client', ''].includes(normalized)) return 'customer';
  return 'customer';
}

function normalizeDirection(value: string): BalanceDirection | null {
  const normalized = value.trim().toLocaleLowerCase('tr-TR');
  if (['alacak', 'credit'].includes(normalized)) return 'credit';
  if (['borç', 'borc', 'debit'].includes(normalized)) return 'debit';
  return null;
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function normalizeTaxNumber(value: string) {
  return value.replace(/\D/g, '').trim();
}

function accountCode(type: AccountType, index: number) {
  const prefix = type === 'supplier' ? 'SUP' : type === 'staff' ? 'STF' : type === 'other' ? 'OTH' : 'CUS';
  return `${prefix}-${String(index).padStart(3, '0')}`;
}

function defaultBalanceDirection(type: AccountType, amount: number): BalanceDirection {
  const positiveDirection = type === 'supplier' ? 'credit' : 'debit';
  const negativeDirection = positiveDirection === 'debit' ? 'credit' : 'debit';
  return amount < 0 ? negativeDirection : positiveDirection;
}

function resolveBalanceDirection(type: AccountType, amount: number, explicit: BalanceDirection | null) {
  return explicit ?? defaultBalanceDirection(type, amount);
}

function buildColumnIndexes(headers: string[]) {
  return {
    name: headerIndex(headers, NAME_HEADERS, 0),
    type: headerIndex(headers, TYPE_HEADERS, 1),
    phone: headerIndex(headers, ['telefon', 'tel', 'phone'], 2),
    email: headerIndex(headers, ['e-posta', 'eposta', 'email', 'mail'], 3),
    taxNumber: headerIndex(headers, ['vergi no', 'vergi numarası', 'vergi numarasi', 'vkn', 'tckn'], 4),
    taxOffice: headerIndex(headers, ['vergi dairesi'], 5),
    address: headerIndex(headers, ['adres', 'address'], 6),
    openingBalance: headerIndex(headers, BALANCE_HEADERS, 7),
    balanceDirection: headerIndex(headers, BALANCE_DIRECTION_HEADERS, 8),
    currency: headerIndex(headers, ['para birimi', 'currency'], 9),
    note: headerIndex(headers, ['not', 'açıklama', 'aciklama'], 10),
    group: headerIndex(headers, ['etiket / grup', 'etiket', 'grup', 'group'], 11),
    city: headerIndex(headers, ['il', 'şehir', 'sehir'], -1),
    district: headerIndex(headers, ['ilçe', 'ilce'], -1),
  };
}

function rowToImport(cells: string[], rowNumber: number, indexes: Record<string, number>): ImportRow {
  const name = cell(cells, indexes, 'name');
  const type = normalizeType(cell(cells, indexes, 'type'));
  const openingBalance = parseMoney(cell(cells, indexes, 'openingBalance'));
  const explicitBalanceDirection = normalizeDirection(cell(cells, indexes, 'balanceDirection'));
  return {
    rowNumber,
    name,
    type,
    phone: cell(cells, indexes, 'phone'),
    email: cell(cells, indexes, 'email'),
    taxNumber: normalizeTaxNumber(cell(cells, indexes, 'taxNumber')),
    taxOffice: cell(cells, indexes, 'taxOffice'),
    address: cell(cells, indexes, 'address'),
    city: cell(cells, indexes, 'city'),
    district: cell(cells, indexes, 'district'),
    openingBalance,
    explicitBalanceDirection,
    balanceDirection: resolveBalanceDirection(type, openingBalance, explicitBalanceDirection),
    currency: (cell(cells, indexes, 'currency') || 'TRY').toUpperCase(),
    note: cell(cells, indexes, 'note'),
    group: cell(cells, indexes, 'group'),
  };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function duplicateKey(row: ImportRow) {
  return row.taxNumber ? `tax:${row.taxNumber}` : `name:${normalizeName(row.name)}`;
}

async function findDuplicate(tx: Prisma.TransactionClient, tenantId: string, row: ImportRow) {
  const candidates: DuplicateCandidate[] = row.type === 'supplier'
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
    const metadata = metadataRecord(candidate.metadata);
    const candidateTaxNumber = typeof metadata.taxNumber === 'string' ? normalizeTaxNumber(metadata.taxNumber) : '';
    if (row.taxNumber && candidateTaxNumber && row.taxNumber === candidateTaxNumber) return true;
    return normalizeName(candidate.name) === rowName;
  }) ?? null;
}

async function accountBalance(tx: Prisma.TransactionClient, tenantId: string, accountId: string) {
  const totals = await tx.currentAccountMovement.aggregate({
    where: { tenantId, accountId },
    _sum: { debit: true, credit: true },
  });
  return Number(totals._sum.debit ?? 0) - Number(totals._sum.credit ?? 0);
}

function openingReconciliationKey(tenantId: string, branchId: string | null, row: ImportRow) {
  const hash = crypto
    .createHash('sha1')
    .update(`${tenantId}|${branchId ?? 'global'}|${row.type}|${duplicateKey(row)}|${Math.abs(row.openingBalance).toFixed(2)}|${row.balanceDirection}`)
    .digest('hex')
    .slice(0, 24);
  return `current-account-opening:${hash}`;
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const branchId = tenant.branchId ?? null;
    const formData = await request.formData();
    const file = formData.get('file');
    const duplicatePolicy = String(formData.get('duplicatePolicy') ?? 'skip') === 'update' ? 'update' : 'skip';
    const dryRun = String(formData.get('dryRun') ?? 'false') === 'true';
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı.' }, { status: 400 });

    const rows = parseDelimitedText(decodeDelimitedBuffer(Buffer.from(await file.arrayBuffer())));
    const hasHeader = rows[0]?.some((header) => NAME_HEADERS.includes(normalizeHeader(header)) || /cari|ünvan|unvan|firma|müşteri|musteri/i.test(header));
    const headers = hasHeader ? rows[0] : [];
    const indexes = buildColumnIndexes(headers);
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const valid: ImportRow[] = [];
    const errors: Array<{ rowNumber: number; message: string }> = [];
    dataRows.forEach((cells, index) => {
      const row = rowToImport(cells, index + (hasHeader ? 2 : 1), indexes);
      if (!row.name) errors.push({ rowNumber: row.rowNumber, message: 'Cari adı boş' });
      else valid.push(row);
    });

    const importId = `cari-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const summary = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let skipped = errors.length;
      let movementCreated = 0;
      let zeroBalanceAccountsCreated = 0;
      let customerReceivableMovements = 0;
      let supplierPayableMovements = 0;
      const previewRows = [];
      const accounts = [];
      const seenKeys = new Set<string>();

      for (const [index, row] of valid.entries()) {
        const key = `${row.type}:${duplicateKey(row)}`;
        if (seenKeys.has(key)) {
          skipped += 1;
          errors.push({ rowNumber: row.rowNumber, message: 'Aynı dosyada duplicate cari' });
          continue;
        }
        seenKeys.add(key);
        const duplicate = await findDuplicate(tx, tenant.tenantId, row);
        const metadata = normalizeJsonObject({
          source: 'excel_import',
          importId,
          rowNumber: row.rowNumber,
          branchId,
          accountType: row.type,
          originalName: row.name,
          normalizedName: normalizeName(row.name),
          taxNumber: row.taxNumber,
          taxOffice: row.taxOffice,
          address: row.address,
          city: row.city,
          district: row.district,
          currency: row.currency,
          note: row.note,
          group: row.group,
        });
        previewRows.push({ rowNumber: row.rowNumber, name: row.name, type: row.type, duplicate: Boolean(duplicate), openingBalance: row.openingBalance });
        if (dryRun) continue;
        const account = row.type === 'supplier'
          ? duplicate
            ? await tx.supplier.update({ where: { id: duplicate.id }, data: { name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
            : await tx.supplier.create({ data: { tenantId: tenant.tenantId, name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
          : duplicate
            ? await tx.customer.update({ where: { id: duplicate.id }, data: { name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } })
            : await tx.customer.create({ data: { tenantId: tenant.tenantId, name: row.name, phone: row.phone || null, email: row.email || null, metadata }, select: { id: true } });
        duplicate ? updated += 1 : created += 1;
        accounts.push({
          id: account.id,
          code: accountCode(row.type, index + 1),
          name: row.name,
          type: row.type === 'supplier' ? 'supplier' : row.type === 'staff' ? 'staff' : 'customer',
          openingBalance: 0,
          phone: row.phone,
          address: row.address,
          taxOffice: row.taxOffice,
          taxNumber: row.taxNumber,
          invoiceTitle: row.name,
        });
        if (row.openingBalance === 0) {
          zeroBalanceAccountsCreated += 1;
          continue;
        }
        const amount = Math.abs(row.openingBalance);
        const reconciliationKey = openingReconciliationKey(tenant.tenantId, branchId, row);
        const existingMovement = await tx.currentAccountMovement.findUnique({
          where: { tenantId_reconciliationKey: { tenantId: tenant.tenantId, reconciliationKey } },
          select: { id: true },
        });
        if (existingMovement) continue;
        const previousBalance = await accountBalance(tx, tenant.tenantId, account.id);
        const debit = row.balanceDirection === 'debit' ? amount : 0;
        const credit = row.balanceDirection === 'credit' ? amount : 0;
        await tx.currentAccountMovement.create({
          data: {
            tenantId: tenant.tenantId,
            accountId: account.id,
            customerId: row.type === 'supplier' ? null : account.id,
            reconciliationKey,
            type: 'OPENING_BALANCE',
            method: 'import',
            debit,
            credit,
            balanceAfter: Number((previousBalance + debit - credit).toFixed(2)),
            description: 'Excel açılış bakiyesi',
            createdBy: tenant.userId,
            metadata: normalizeJsonObject({ source: 'excel_import', rowNumber: row.rowNumber, importId, branchId, originalName: row.name, accountType: row.type, balanceDirection: row.balanceDirection }),
          },
        });
        movementCreated += 1;
        if (row.type === 'customer' && row.balanceDirection === 'debit') customerReceivableMovements += 1;
        if (row.type === 'supplier' && row.balanceDirection === 'credit') supplierPayableMovements += 1;
      }

      if (!dryRun) {
        await writeAuditLog({
          tenantId: tenant.tenantId,
          userId: tenant.userId,
          action: 'system_admin_action',
          entity: 'current_account',
          entityId: importId,
          metadata: normalizeJsonObject({ importId, created, updated, skipped, movementCreated, zeroBalanceAccountsCreated, errorCount: errors.length }),
          db: tx,
        });
      }

      return {
        imported: created + updated,
        created,
        updated,
        skipped,
        movementCreated,
        zeroBalanceAccountsCreated,
        customerReceivableMovements,
        supplierPayableMovements,
        openingMovements: movementCreated,
        accounts,
        valid: valid.length,
        errors,
        previewRows,
      };
    });

    return NextResponse.json({ ok: true, tenantId: tenant.tenantId, branchId, dryRun, duplicatePolicy, importId, ...summary });
  } catch (error) {
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);
    console.error('[finance/current-accounts/import] failed', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Cari import yapılamadı.' }, { status: 500 });
  }
}
