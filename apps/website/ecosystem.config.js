module.exports = {
  apps: [
    {
      name: 'adisyum-website',
      cwd: './apps/website',
      script: 'node',
      args: '.next/standalone/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
        HOSTNAME: '0.0.0.0',
      },
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/website-error.log',
      out_file: './logs/website-out.log',
    },
  ],
};
