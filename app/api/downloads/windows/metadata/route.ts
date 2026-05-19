import { NextResponse } from 'next/server';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DownloadFile = {
  name: string;
  fileName: string;
  path: string;
  sha256: string;
  mandatory: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

export function GET() {
  const manifestPath = path.join(process.cwd(), 'public', 'downloads', 'windows', 'latest.json');
  if (!existsSync(manifestPath)) {
    return NextResponse.json({ ok: false, error: 'Windows download manifest bulunamadi.' }, { status: 404 });
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version: string;
    buildId: string;
    releasedAt: string;
    mandatory: boolean;
    channel: string;
    baseUrl: string;
    files: DownloadFile[];
  };

  const files = manifest.files.map((file) => {
    const filePath = path.join(process.cwd(), 'public', file.path);
    const exists = existsSync(filePath);
    const stat = exists ? statSync(filePath) : null;
    return {
      ...file,
      url: `https://adisyum.com${file.path}`,
      exists,
      sizeBytes: stat?.size ?? 0,
      sizeLabel: stat ? formatBytes(stat.size) : 'Yok',
      updatedAt: stat?.mtime.toISOString() ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    version: manifest.version,
    buildId: manifest.buildId,
    releasedAt: manifest.releasedAt,
    mandatory: manifest.mandatory,
    channel: manifest.channel,
    files,
  });
}
