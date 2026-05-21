'use strict';

module.exports = {
  apps: [
    {
      name: 'adisyum-website',
      cwd: './apps/website',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3010',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'adisyum-root-app',
      cwd: '.',
      script: '.next/standalone/server.js',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
        GIT_COMMIT: process.env.GIT_COMMIT || '',
        DEPLOYED_AT: process.env.DEPLOYED_AT || '',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://adisyum.com',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://adisyum.com',
        APP_URL: process.env.APP_URL || 'https://adisyum.com',
        PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || 'https://adisyum.com',
        SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN || '.adisyum.com',
        ADISYUM_ROOT_ASSET_PREFIX: '/adisyum-root-assets',
      },
    },
    {
      name: 'adisyum-worker',
      cwd: '.',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'workers/orchestration-worker.ts',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
