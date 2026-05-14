# ADISYUM Production Go-Live Report (Isolated Architecture)

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

## 2) Domain Routing Status

- adisyum.com -> 3010 (marketing):
- www.adisyum.com -> 3010 (marketing):
- app.adisyum.com -> 3000 (POS):
- admin.adisyum.com -> 3020 (admin):

## 3) WebSocket / Realtime Health

- Nginx Upgrade headers active:
- app.adisyum.com WS handshake (101):
- Table realtime:
- Kitchen realtime:
- Monitoring realtime:
- Desktop bridge realtime:
- Telemetry realtime:

## 4) SSL / Cloudflare Health

- Cloudflare SSL mode (Full strict):
- Root SSL valid:
- App SSL valid:
- Admin SSL valid:
- Redirect loop check:
- Mixed-content check:

## 5) PM2 Runtime Health

- adisyum-website:
- adisyum-pos-app:
- adisyum-system-admin:
- Persisted with pm2 save/startup:
- Memory/CPU summary:

## 6) POS Smoke Test

- Login:
- Masa aç:
- Ürün ekle:
- Sipariş oluştur:
- Ödeme al:
- Mutfak fişi:
- Websocket update:
- Monitoring event:
- QR menu:

## 7) Admin Validation

- system-admin login:
- tenant provisioning:
- observability dashboard:
- monitoring tabs:
- commercial ops:
- pilot field metrics:

## 8) Website Validation

- homepage:
- pricing:
- CTA:
- mobile responsiveness:
- SEO metadata:
- performance:
- animations:
- forms/buttons:

## 9) Infrastructure Health

- Nginx workers:
- Redis health:
- PostgreSQL connections:
- WebSocket connection count:

## 10) Production Readiness Verdict

- Status: GO / NO-GO
- Known risks:
- Action items:
- Owner:
- ETA:

## 11) Rollback Readiness

- Snapshot verified:
- Rollback tested:
- Rollback ETA:
- Command:

```bash
sudo APP_USER=<app-user> SNAP_ROOT=/var/backups/adisyum-cutover bash deploy/scripts/rollback-isolated.sh latest
```
