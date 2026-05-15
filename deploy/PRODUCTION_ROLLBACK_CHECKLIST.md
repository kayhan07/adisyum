# Adisyum Production Rollback Checklist

## Auto Rollback Triggers

- [ ] Prisma validation fails
- [ ] Prisma Client generation fails
- [ ] Bootstrap admin fails
- [ ] Root Next build fails
- [ ] Root `.next/BUILD_ID` is missing
- [ ] Website Next build fails
- [ ] PM2 does not contain exactly `adisyum-root-app` and `adisyum-website`
- [ ] PM2 restart loop is detected
- [ ] Port `3020` is listening
- [ ] `nginx -t` fails
- [ ] `https://adisyum.com` fails
- [ ] `https://adisyum.com/app` fails
- [ ] `https://adisyum.com/system-admin` fails

## Manual Rollback Verification

- [ ] `pm2 list` shows only `adisyum-root-app` and `adisyum-website`
- [ ] Both PM2 apps are `online`
- [ ] `nginx -t` is clean
- [ ] `https://adisyum.com` returns success
- [ ] `https://adisyum.com/app` returns success
- [ ] `https://adisyum.com/system-admin` returns success
- [ ] PostgreSQL access succeeds
- [ ] Redis access succeeds, if configured
- [ ] No `app.adisyum.com`, `admin.adisyum.com`, or `127.0.0.1:3020` active routing remains

## Safety Rules

- [ ] Do not reset the production database
- [ ] Do not restore `.env` from Git
- [ ] Do not reintroduce split root Next.js processes
- [ ] Do not reintroduce `adisyum-pos-app` or `adisyum-system-admin`
- [ ] Do not reload Nginx when `nginx -t` fails
