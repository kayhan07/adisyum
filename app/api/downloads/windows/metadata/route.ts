import { NextResponse } from 'next/server';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DownloadFile = {
  name: string;
  fileName: string;
  path: string;
  versionedPath?: string;
  sha256: string;
  mandatory: boolean;
  component?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  const windowsMb = Math.round((bytes / 1024 / 1024) * 10) / 10;
  return `${windowsMb} MB (${bytes.toLocaleString('tr-TR')} byte)`;
}

function isWindowsExecutable(filePath: string, sizeBytes: number) {
  if (sizeBytes < 100 * 1024) return false;

  const handle = openSync(filePath, 'r');
  const signature = Buffer.alloc(2);
  try {
    readSync(handle, signature, 0, 2, 0);
  } finally {
    closeSync(handle);
  }

  return signature.toString('ascii') === 'MZ';
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
    const executable = exists && stat ? isWindowsExecutable(filePath, stat.size) : false;
    const publicPath = file.versionedPath || file.path;
    return {
      ...file,
      url: `https://adisyum.com${publicPath}?v=${encodeURIComponent(manifest.buildId)}`,
      latestUrl: `https://adisyum.com${file.path}?v=${encodeURIComponent(manifest.buildId)}`,
      exists,
      sizeBytes: stat?.size ?? 0,
      sizeLabel: stat ? formatBytes(stat.size) : 'Yok',
      updatedAt: stat?.mtime.toISOString() ?? null,
      executable,
      healthy: exists && executable,
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
