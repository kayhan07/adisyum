import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(process.cwd()),
  generateBuildId: async () => `adisyum-web-${Date.now()}`,
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [430, 640, 768, 1024, 1280, 1920],
  },
};

export default nextConfig;
