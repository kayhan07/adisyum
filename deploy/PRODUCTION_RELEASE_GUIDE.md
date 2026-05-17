# Adisyum Production Release Guide

Canonical production deployment is now a single command:

```bash
sudo APP_DIR=/var/www/adisyum APP_USER=adisyum bash deploy-production.sh
```

## Architecture

- Website: `adisyum-website` -> `127.0.0.1:3010` -> `https://adisyum.com`
- Root business app: `adisyum-root-app` -> `127.0.0.1:3000`
- POS route: `https://adisyum.com/app` -> `127.0.0.1:3000/app`
- System admin route: `https://adisyum.com/system-admin` -> `127.0.0.1:3000/system-admin`

There is no `app.adisyum.com`, `admin.adisyum.com`, second root Next.js process, or port `3020` runtime in the canonical architecture.

## Canonical Files

- PM2: `ecosystem.config.cjs` with `adisyum-website`, `adisyum-root-app`, and `adisyum-worker`
- Deploy: `deploy-production.sh`
- Nginx: `deploy/nginx/adisyum.conf`
- Prisma: `prisma/schema.prisma`, `prisma.config.ts`
- Auth bootstrap: `scripts/bootstrap-admin.ts`

## Deploy Flow

1. Load `.env.production` and reject recursive env references.
2. Install root and website dependencies.
3. Run Prisma generate and db push.
4. Bootstrap tenant admin and system admin.
5. Build root Next app and website Next app.
6. Install nginx configs and validate `nginx -t`.
7. Start PM2 with exactly `adisyum-website`, `adisyum-root-app`, and `adisyum-worker`.
8. Install single-domain Nginx routing and validate `nginx -t`.
9. Validate local ports, path routes, domains, and auth endpoints.

## Credentials

Defaults used by the deployment bootstrap:

- Tenant: `ABN-48291`
- Username: `admin`
- Password: `1234`

Override with `BOOTSTRAP_TENANT_ID`, `BOOTSTRAP_ADMIN_USERNAME`, and `BOOTSTRAP_ADMIN_PASSWORD`.
