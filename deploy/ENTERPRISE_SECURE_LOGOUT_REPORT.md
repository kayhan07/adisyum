# ADISYUM Enterprise Secure Logout & Session Termination Report

## Scope

Production-grade secure logout hardening for shared-device restaurant operations:

- ortak cihaz / kasa paylaşımı
- vardiya değişimi
- tablet paylaşımı
- tenant-safe runtime isolation

## Implemented Controls

### 1) Secure Logout Flow

- Server-side logout route with revocation scope:
  - `current` (aktif session)
  - `user` (aynı kullanıcıya ait tüm sessionlar)
  - `tenant` (tenant düzeyinde revoke)
- httpOnly cookie temizleme (`/api/auth/session` DELETE)
- JWT payload session id (`sid`) desteği
- Session revoke registry (`runtime_states` tablosu üzerinden)

### 2) Client State Cleanup

Logout sırasında temizlenir:

- React Query cache
- tenant/system-admin runtime state
- auth snapshot + session state
- offline queue
- realtime bağlantı state

### 3) WebSocket / Realtime Termination

Logout sırasında:

- realtime disconnect
- room/subscription bırakma
- reconnect guard (`isLogoutInProgress`)

### 4) Offline Queue Isolation

- tenant/user fingerprint değişiminde isolation reset
- stale queue/state temizliği

### 5) Desktop Bridge Session Reset

- bridge çağrıları auth sessiona bağlı
- logout sırasında runtime + realtime reset
- reconnect flow logout sırasında bastırılır

### 6) Auto Redirect & Route Safety

- logout sonrası login ekranına `replace` redirect
- stale back navigation etkisi middleware + auth me ile engellenir

### 7) Idle Auto Logout

- POS: 30 dk
- Admin: 15 dk
- 60 sn warning modal + countdown
- activity tracking (mouse/keyboard/touch/click/visibility)

### 8) Shift-End Forced Logout

- App shell üzerinde `Vardiya Kapat` aksiyonu
- scope=`user` ile zorunlu session revoke

### 9) Security Hardening

- multi-tab logout sync (`BroadcastChannel` + `storage` event)
- stale token prevention (`/api/auth/me` polling + revoke check)
- logout audit logging (`action=logout`)
- concurrent session revoke controls (`current/user/tenant`)

## Validation Endpoints

- `GET /api/auth/me`
- `DELETE /api/auth/session`
- `GET /api/auth/security-score`

## Target Scores

- Session Security Score: **95/100**
- Logout Safety Score: **96/100**
- Idle Protection Score: **92/100 (POS) / 95/100 (Admin)**
- Tenant Isolation Validation: **97/100**

## Notes

- Revocation checks API katmanında uygulanır.
- Middleware katmanında DB erişimi olmadığı için revocation doğrulaması `auth/me + protected API` çağrılarında enforce edilir.
