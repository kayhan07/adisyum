/**
 * Media Optimizer — Server-side image processing with Sharp
 * Handles resize, WEBP conversion, thumbnail generation, compression
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Dynamic import of sharp so it stays server-only
async function getSharp() {
  const { default: sharp } = await import('sharp');
  return sharp;
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const SIZE_PRESETS = {
  product: { width: 800, height: 800, fit: 'cover' as const },
  category: { width: 1200, height: 400, fit: 'cover' as const },
  thumbnail: { width: 240, height: 240, fit: 'cover' as const },
} satisfies Record<string, { width: number; height: number; fit: 'cover' | 'inside' }>;

export type MediaEntityType = 'product' | 'category';

export type OptimizeResult = {
  url: string;
  thumbnailUrl: string;
  webpUrl: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  optimizedSizeBytes: number;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
};

function getUploadRoot() {
  return process.env.UPLOAD_ROOT_DIR ?? path.join(process.cwd(), 'public', 'uploads');
}

function safeTenantPath(tenantId: string) {
  // Strip any path traversal attempts
  const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe;
}

function buildFilePaths(tenantId: string, entityType: MediaEntityType, nameBase: string) {
  const safeId = safeTenantPath(tenantId);
  const folder = path.join(getUploadRoot(), `tenant_${safeId}`, `${entityType}s`);
  const thumbFolder = path.join(folder, 'thumbs');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(thumbFolder, { recursive: true });
  const main = path.join(folder, `${nameBase}.webp`);
  const thumb = path.join(thumbFolder, `${nameBase}_thumb.webp`);
  return { folder, thumbFolder, main, thumb };
}

function urlFromAbsPath(absPath: string) {
  const root = getUploadRoot();
  const publicRoot = path.join(process.cwd(), 'public');
  // uploads is inside public → serve as /uploads/…
  const rel = absPath.startsWith(root)
    ? absPath.slice(publicRoot.length).replace(/\\/g, '/')
    : absPath;
  return rel.startsWith('/') ? rel : '/' + rel;
}

export async function optimizeAndSave(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  tenantId: string,
  entityType: MediaEntityType,
): Promise<OptimizeResult> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error(`Desteklenmeyen dosya türü: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`Dosya boyutu 5MB limitini aşıyor.`);
  }

  const sharp = await getSharp();

  const nameBase = crypto.randomBytes(12).toString('hex');
  const preset = entityType === 'category' ? SIZE_PRESETS.category : SIZE_PRESETS.product;
  const thumbPreset = SIZE_PRESETS.thumbnail;

  const { main, thumb } = buildFilePaths(tenantId, entityType, nameBase);

  // Process main image
  const mainInfo = await sharp(buffer)
    .resize(preset.width, preset.height, { fit: preset.fit, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(main);

  // Process thumbnail
  const thumbInfo = await sharp(buffer)
    .resize(thumbPreset.width, thumbPreset.height, { fit: thumbPreset.fit, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toFile(thumb);

  return {
    url: urlFromAbsPath(main),
    thumbnailUrl: urlFromAbsPath(thumb),
    webpUrl: urlFromAbsPath(main),
    mimeType: 'image/webp',
    originalName,
    sizeBytes: buffer.byteLength,
    optimizedSizeBytes: mainInfo.size,
    width: mainInfo.width,
    height: mainInfo.height,
    thumbWidth: thumbInfo.width,
    thumbHeight: thumbInfo.height,
  };
}

export function deleteMediaFiles(urls: string[]) {
  const publicRoot = path.join(process.cwd(), 'public');
  for (const url of urls) {
    // Only allow deletion within uploads dir
    if (!url.startsWith('/uploads/')) continue;
    const absPath = path.join(publicRoot, url);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {
      // best-effort
    }
  }
}
