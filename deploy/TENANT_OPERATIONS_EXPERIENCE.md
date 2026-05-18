# Tenant Operations Experience

## Operator Model

Tenant cards now open a full-height right-side operations drawer. The drawer keeps tenant context visible while allowing operators to switch between overview, live operations, finance, users, devices, printers, queues, audit, activity, billing, AI, security, and settings views.

## Reused Durable Signals

The experience composes existing production signals rather than creating demo-only data:

- `PresenceSession`
- `DeviceHeartbeat`
- `OperationalEvent`
- provisioning jobs
- subscription and finance state

## Workflow Additions

- `Ctrl+K` / `Cmd+K` opens a global command palette for tenant search.
- Tenant cards can be favorited locally as saved operator views.
- Tenant deep-link context is written into the URL through `?tenant=...`.
- `Escape` closes both palette and drawer.

## Performance Choices

- Drawer content is rendered on demand.
- Tenant-specific lists are filtered from already-loaded realtime summaries.
- No extra SSE stream is spawned per tab.
- Drawer tabs use compact tenant slices instead of fetching giant global payloads again.

## Follow-On Work

1. Move tenant-detail tabs to dedicated tenant detail APIs once branch/user/printer aggregates become durable.
2. Replace local saved favorites with persisted operator preferences.
3. Back AI Insights with scored evidence from the intelligence engine.
4. Add virtualized tables once tenant event density exceeds comfortable DOM limits.
