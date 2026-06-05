import { inflateRawSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import iconv from 'iconv-lite';
import { requireTenant, TenantAuthError, tenantAuthErrorResponse } from '@/lib/requireTenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ZipEntry = {
  name: string;
  data: Buffer;
};

const XLSX_MAX_SIZE_BYTES = 2 * 1024 * 1024;

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textDecodeScore(value: string) {
  const replacementCount = (value.match(/\uFFFD/g) ?? []).length * 5;
  const mojibakeCount = (value.match(/[ÃÄÅÂ]/g) ?? []).length * 2;
  return replacementCount + mojibakeCount;
}

function decodeDelimitedBuffer(buffer: Buffer) {
  const utf8 = buffer.toString('utf8');
  const windows1254 = iconv.decode(buffer, 'win1254');
  return textDecodeScore(windows1254) < textDecodeScore(utf8) ? windows1254 : utf8;
}

function parseDelimitedText(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
      if (line.includes(';')) return line.split(';').map((cell) => cell.trim());
      return line.split(',').map((cell) => cell.trim());
    })
    .filter((cells) => cells.some(Boolean));
}

function readUInt32(buffer: Buffer, offset: number) {
  if (offset + 4 > buffer.length) return null;
  return buffer.readUInt32LE(offset);
}

function extractZipEntriesFromLocalHeaders(buffer: Buffer) {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = readUInt32(buffer, offset);
    if (signature !== 0x04034b50) break;

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) break;

    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    const compressed = buffer.subarray(dataStart, dataEnd);
    let data: Buffer | null = null;

    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    }

    if (data) entries.push({ name, data });
    offset = dataEnd;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return extractZipEntriesFromLocalHeaders(buffer);

  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  while (offset + 46 <= buffer.length && readUInt32(buffer, offset) === 0x02014b50) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');

    if (readUInt32(buffer, localHeaderOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd <= buffer.length) {
        const compressed = buffer.subarray(dataStart, dataEnd);
        let data: Buffer | null = null;

        if (method === 0) {
          data = Buffer.from(compressed);
        } else if (method === 8) {
          data = inflateRawSync(compressed);
        }

        if (data) entries.push({ name, data });
      }
    }

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries.length > 0 ? entries : extractZipEntriesFromLocalHeaders(buffer);
}

function getZipText(entries: ZipEntry[], name: string) {
  return entries.find((entry) => entry.name === name)?.data.toString('utf8') ?? '';
}

function parseSharedStrings(xml: string) {
  const values: string[] = [];
  const stringMatches = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);

  for (const match of stringMatches) {
    const richText = match[1] ?? '';
    const parts = [...richText.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1] ?? ''));
    values.push(parts.join(''));
  }

  return values;
}

function columnIndex(cellRef: string) {
  const letters = cellRef.replace(/\d+/g, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function parseSheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowMatches = xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g);

  for (const rowMatch of rowMatches) {
    const row: string[] = [];
    const cells = (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g);

    for (const cellMatch of cells) {
      const attrs = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? '';
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? '';
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
      const targetIndex = ref ? columnIndex(ref) : row.length;
      const value = type === 's' ? sharedStrings[Number(rawValue)] ?? '' : decodeXml(rawValue);
      row[targetIndex] = value.trim();
    }

    if (row.some(Boolean)) rows.push(row.map((cell) => cell ?? ''));
  }

  return rows;
}

function parseXlsx(buffer: Buffer) {
  const entries = extractZipEntries(buffer);
  if (entries.length === 0) throw new Error('Excel dosyası okunamadı.');

  const sharedStrings = parseSharedStrings(getZipText(entries, 'xl/sharedStrings.xml'));
  const sheet =
    getZipText(entries, 'xl/worksheets/sheet1.xml')
    || entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))?.data.toString('utf8')
    || '';

  if (!sheet) throw new Error('Excel çalışma sayfası bulunamadı.');
  return parseSheetRows(sheet, sharedStrings);
}

export async function POST(request: Request) {
  try {
    await requireTenant(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Dosya bulunamadı.' }, { status: 400 });
    }

    if (file.size > XLSX_MAX_SIZE_BYTES) {
      return NextResponse.json({ ok: false, error: 'Dosya boyutu 2 MB sınırını aşamaz.' }, { status: 400 });
    }

    const name = file.name.toLocaleLowerCase('tr-TR');
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = name.endsWith('.xlsx')
      ? parseXlsx(buffer)
      : parseDelimitedText(decodeDelimitedBuffer(buffer));

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      rowCount: rows.length,
      rows,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) return tenantAuthErrorResponse(error);

    console.error('[products] excel import failed', { error });
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Excel dosyası içe aktarılamadı.',
    }, { status: 400 });
  }
}
