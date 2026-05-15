# Adisyum Production Deploy Checklist

## Canonical Architecture

- Website: `adisyum.com` -> `adisyum-website` -> `127.0.0.1:3010`
- POS: `adisyum.com/app` -> `adisyum-root-app` -> `127.0.0.1:3000/app`
- System admin: `adisyum.com/system-admin` -> `adisyum-root-app` -> `127.0.0.1:3000/system-admin`
- Forbidden drift: `app.adisyum.com`, `admin.adisyum.com`, `adisyum-pos-app`, `adisyum-system-admin`, and port `3020`

## Pre-Deploy

- [ ] Production server working tree is clean: `git status --short`
- [ ] `.env.production` or `.env` exists on the server
- [ ] `DATABASE_URL` is defined and not recursive
- [ ] `ADISYUM_JWT_SECRET`, `JWT_SECRET`, or `SESSION_SECRET` is at least 32 characters
- [ ] Cloudflare origin cert files exist in `/etc/ssl/cloudflare`
- [ ] `node`, `npm`, `pm2`, `nginx`, `curl`, `ss`, and `lsof` are installed

## One-Command Deploy

```bash
sudo APP_DIR=/root/adisyum APP_USER=root bash deploy-production.sh
```

## Required Green Checks

- [ ] `npx prisma validate`
- [ ] `npx prisma generate`
- [ ] `npm run bootstrap:admin`
- [ ] `npm run build`
- [ ] `.next/BUILD_ID`, `.next/server`, and `.next/static` exist
- [ ] `npm --prefix apps/website run build`
- [ ] `apps/website/.next/BUILD_ID` exists
- [ ] `pm2 list` shows only `adisyum-root-app` and `adisyum-website`
- [ ] No PM2 restart loop or unstable restart count
- [ ] No listener exists on `127.0.0.1:3020`
- [ ] `nginx -t`
- [ ] `curl -I http://127.0.0.1:3000/app` returns `200`
- [ ] `curl -I http://127.0.0.1:3000/system-admin` returns `200`
- [ ] `curl -I https://adisyum.com` returns `200`
- [ ] `curl -I https://adisyum.com/app` returns `200`
- [ ] `curl -I https://adisyum.com/system-admin` returns `200`

## Post-Deploy Smoke

- [ ] Website home page opens
- [ ] POS login opens at `/app`
- [ ] System admin login opens at `/system-admin`
- [ ] Tenant admin bootstrap login succeeds
- [ ] System admin bootstrap login succeeds
- [ ] Nginx active config has no `app.adisyum.com`, `admin.adisyum.com`, or `127.0.0.1:3020`
