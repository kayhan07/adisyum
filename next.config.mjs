import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootAssetPrefix = process.env.ADISYUM_ROOT_ASSET_PREFIX
  ?? (process.env.NODE_ENV === 'production' ? '/adisyum-root-assets' : '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: appDir,
  generateBuildId: async () => `adisyon-${Date.now()}`,
  assetPrefix: rootAssetPrefix,
  async rewrites() {
    if (!rootAssetPrefix) {
      return [];
    }

    return [
      {
        source: `${rootAssetPrefix}/_next/:path*`,
        destination: '/_next/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/floor',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/orders',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
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
