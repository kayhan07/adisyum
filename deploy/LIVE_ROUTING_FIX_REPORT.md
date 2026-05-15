# Live Routing Fix Report

This report has been superseded by the canonical single-domain architecture.

## Current Canonical Routing

- `https://adisyum.com` -> website app on `127.0.0.1:3010`
- `https://adisyum.com/app` -> root business app on `127.0.0.1:3000/app`
- `https://adisyum.com/system-admin` -> root business app on `127.0.0.1:3000/system-admin`

## Removed Drift

- `app.adisyum.com`
- `admin.adisyum.com`
- `adisyum-pos-app`
- `adisyum-system-admin`
- duplicate root Next.js runtime
- port `3020` admin upstream

Use `deploy-production.sh` or `deploy/scripts/fix-apache-nginx-production.sh` to enforce this routing on the production server.
