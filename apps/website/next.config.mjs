import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: '/website-assets',
  outputFileTracingRoot: path.join(process.cwd()),
  generateBuildId: async () => `adisyum-web-${Date.now()}`,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/website-assets/_next/:path*',
          destination: '/_next/:path*',
        },
      ],
    };
  },
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [430, 640, 768, 1024, 1280, 1920],
  },
};

export default nextConfig;
