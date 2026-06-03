import path from 'path';

const websiteAssetPrefix = process.env.ADISYUM_WEBSITE_ASSET_PREFIX || '/website-assets';

/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: websiteAssetPrefix,
  outputFileTracingRoot: path.join(process.cwd()),
  generateBuildId: async () => `adisyum-web-${Date.now()}`,
  async rewrites() {
    if (!websiteAssetPrefix) {
      return [];
    }

    return {
      beforeFiles: [
        {
          source: `${websiteAssetPrefix}/_next/:path*`,
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
