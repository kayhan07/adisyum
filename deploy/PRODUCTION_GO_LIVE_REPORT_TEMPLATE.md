# Adisyum Production Go-Live Report

Date:
Operator:
Environment: Production

## 1) Live Cutover Status

- Cutover start time:
- Cutover end time:
- Snapshot path:
- Rollback script path:
- Nginx reload status:
- PM2 startup status:

## 2) Canonical Routing Status

- `adisyum.com` -> website app `127.0.0.1:3010`:
- `www.adisyum.com` -> website app `127.0.0.1:3010`:
- `adisyum.com/app` -> root app `127.0.0.1:3000/app`:
- `adisyum.com/system-admin` -> root app `127.0.0.1:3000/system-admin`:
- No `app.adisyum.com` active vhost:
- No `admin.adisyum.com` active vhost:
- No port `3020` listener:

## 3) PM2 Runtime Health

- `adisyum-website`:
- `adisyum-root-app`:
- Only two PM2 apps present:
- Restart loops absent:
- Persisted with `pm2 save/startup`:
- Memory/CPU summary:

## 4) Build Health

- Root `.next/BUILD_ID`:
- Root `.next/server`:
- Root `.next/static`:
- Website `.next/BUILD_ID`:
- Prisma Client generated:
- Bootstrap admin completed:

## 5) POS Smoke Test

- `/app` opens:
- Login:
- Table open:
- Product add:
- Order create:
- Payment:
- Kitchen ticket:
- Realtime update:

## 6) System Admin Validation

- `/system-admin` opens:
- System admin login:
- Tenant provisioning:
- Observability dashboard:
- Commercial ops:
- Pilot field metrics:

## 7) Website Validation

- Homepage:
- Pricing:
- CTA:
- Mobile responsiveness:
- SEO metadata:
- Forms/buttons:

## 8) Infrastructure Health

- `nginx -t`:
- Cloudflare SSL mode Full strict:
- PostgreSQL:
- Redis:
- WebSocket upgrade headers:

## 9) Production Readiness Verdict

- Status: GO / NO-GO
- Known risks:
- Action items:
- Owner:
- ETA:
