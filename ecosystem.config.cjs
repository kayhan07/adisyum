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
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
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
