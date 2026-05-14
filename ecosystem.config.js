module.exports = {
  apps: [
    {
      name: 'adisyum-prod',
      script: './node_modules/.bin/next',
      args: 'start',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'production'
      },
      merge_logs: true,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', '.next', 'logs'],
      max_memory_restart: '1G',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000,
      kill_timeout: 5000,
      wait_ready: true,
      max_exit_code: 1,
      shutdown_with_message: true,

      // Cluster management
      cron_restart: '0 0 * * *', // Daily restart at midnight UTC
      grace_delay: 3000,
      abort_delay: 100,

      // Monitoring
      instance_var: 'INSTANCE_ID',
      pmx: true,
      max_sessions: 10000,

      // Development overrides for staging
      env_staging: {
        NODE_ENV: 'staging',
        APP_ENV: 'staging',
        instances: 4,
        ENABLE_PROFILING: 'true',
      },

      // Development overrides
      env_development: {
        NODE_ENV: 'development',
        APP_ENV: 'development',
        instances: 1,
        ENABLE_PROFILING: 'true',
        DEBUG: 'adisyum:*'
      }
    },

    // Background worker for offline sync
    {
      name: 'adisyum-worker-offline-sync',
      script: './lib/workers/offline-sync-worker.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_NAME: 'offline-sync'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/worker-offline-sync-error.log',
      out_file: './logs/worker-offline-sync-out.log',
      pmx: true,
      env_staging: {
        NODE_ENV: 'staging',
      },
      env_development: {
        NODE_ENV: 'development',
        DEBUG: 'adisyum:worker:*'
      }
    },

    // Background worker for webhooks
    {
      name: 'adisyum-worker-webhooks',
      script: './lib/workers/webhook-worker.ts',
      interpreter: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        WORKER_NAME: 'webhooks'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: './logs/worker-webhooks-error.log',
      out_file: './logs/worker-webhooks-out.log',
      pmx: true,
      env_staging: {
        NODE_ENV: 'staging',
      }
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'prod.adisyum.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/adisyum.git',
      path: '/var/www/adisyum',
      'pre-deploy-local': 'npm run test',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    },
    staging: {
      user: 'deploy',
      host: 'staging.adisyum.local',
      ref: 'origin/staging',
      repo: 'git@github.com:your-org/adisyum.git',
      path: '/var/www/adisyum-staging',
      'pre-deploy-local': 'npm run test',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging'
    }
  }
};
