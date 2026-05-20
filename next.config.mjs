import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: appDir,
  generateBuildId: async () => `adisyon-${Date.now()}`,
  assetPrefix: process.env.ADISYUM_ROOT_ASSET_PREFIX || '',
  images: {
    formats: ['image/webp'],
    deviceSizes: [430, 640, 768, 1080, 1280],
    imageSizes: [64, 128, 240, 400, 800],
    // Local /uploads/ served from public/ — allow any hostname and the CDN domain
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
