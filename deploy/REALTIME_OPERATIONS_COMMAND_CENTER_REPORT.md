# Realtime Operations Command Center

## Architecture

Adisyum now records operational visibility through durable database-backed primitives:

- `PresenceSession` tracks live authenticated sessions.
- `DeviceHeartbeat` tracks active runtime devices.
- `OperationalEvent` stores the live operations stream.
- `/api/runtime/heartbeat` updates session/device presence.
- `/api/system-admin/live-operations` returns the current command-center snapshot.
- `/api/system-admin/live-operations/stream` publishes server-sent live snapshots for the system-admin UI.

The source of truth is server-side persisted state. Browser heartbeats enrich visibility, but do not become business-state authority.

## Captured Signals

- successful and failed POS logins
- successful and failed system-admin logins
- POS product additions
- payment completions
- provisioning lifecycle events bridged from the onboarding journal
- live route/device/browser/OS/IP metadata from active sessions

## Multi-Tenant Safety

- Presence rows remain tenant-scoped.
- Device heartbeats are unique per `tenantId + deviceId`.
- POS operational events carry tenant and branch identity from authenticated server context.
- System-admin reads are protected by `requireSystemAdmin()`.
- No client-provided tenant identifier is trusted for protected operational records.

## Runtime Behavior

- Clients heartbeat every 30 seconds and immediately on focus/visibility regain.
- Presence automatically transitions:
  - `online` inside 90 seconds
  - `idle` after 90 seconds
  - `disconnected` after 5 minutes
- Session `lastSeenAt` is refreshed by heartbeat traffic.
- Live command-center snapshots refresh every 5 seconds over SSE.

## Current Command-Center Surface

System-admin now exposes:

- online tenants
- online users
- online branches
- active devices
- active tables
- active orders
- failed logins in the last 24 hours
- live presence table
- live operational event stream
- live device monitoring table

## Follow-On Recommendations

1. Add explicit printer-agent heartbeats and queue worker heartbeats into `DeviceHeartbeat`.
2. Add anomaly scoring for repeated failed logins, unstable device reconnects, and heartbeat gaps.
3. Add event retention/archival policy before event volume becomes large.
4. Add tenant drill-down pages for branch-level health and active route maps.
