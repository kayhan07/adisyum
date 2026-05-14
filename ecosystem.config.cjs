// PM2 Ecosystem Config – Adisyum Enterprise
// Usage: pm2 start ecosystem.config.cjs --env production
'use strict';

module.exports = {
  apps: [
    {
      name: 'adisyum',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 'max',
      exec_mode: 'cluster',
      listen_timeout: 15000,
      kill_timeout: 5000,
      wait_ready: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        ENABLE_METRICS: 'true',
        SLOW_QUERY_THRESHOLD_MS: '300',
      },
      env_staging: {
        NODE_ENV: 'production',
        PORT: 3000,
        ENABLE_METRICS: 'true',
        SLOW_QUERY_THRESHOLD_MS: '200',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        ENABLE_METRICS: 'true',
        SLOW_QUERY_THRESHOLD_MS: '150',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
};
