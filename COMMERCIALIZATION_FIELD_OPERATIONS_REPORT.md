# ADISYUM Commercialization & Field Operations Platform

## Commercial Operations Scope

This layer turns the enterprise SaaS, Desktop Bridge and pilot validation stack into a commercial field operations platform.

Core capabilities:

- one-click tenant provisioning
- trial onboarding
- module-based licensing
- remote device management
- temporary support sessions
- reseller/dealer operations
- field installer mode
- commercial operations dashboard
- health-based support recommendations
- deployment and installer readiness tracking

## Tenant Provisioning

API:

```text
POST /api/commercial/provision
```

Provisioning creates:

- tenant shell
- package/license policy
- default roles
- starter tables
- starter printers
- starter recipes
- onboarding wizard steps
- trial license window

Default onboarding checklist:

- tenant created
- admin user created
- starter tables
- starter printers
- starter recipes
- desktop bridge install
- fiscal POS validation
- staff training

## License Management

API:

```text
POST /api/commercial/license
```

Supported license states:

- trial
- active
- suspended
- expired

License policy supports:

- module-based licensing
- printer limits
- branch limits
- user limits
- expiration tracking

Default limits:

| Package | Printers | Branches | Users |
| --- | ---: | ---: | ---: |
| Mini | 3 | 1 | 8 |
| Gold | 6 | 2 | 25 |
| Premium | 12 | 10 | 80 |

## Remote Device Management

API:

```text
POST /api/commercial/remote-device
```

Supported remote actions:

- printer restart
- bridge restart
- queue clear
- sync retry
- device diagnostics
- websocket reconnect
- remote config push

Every remote command is audit logged and tenant scoped.

## Remote Support Mode

API:

```text
POST /api/commercial/support
```

Support sessions include:

- temporary TTL
- pending approval
- tenant-safe permissions
- audit log
- screen assist hook
- diagnostics permission
- remote config permission
- queue control permission

## Reseller / Bayi Readiness

The commercial dashboard summarizes:

- active dealers
- tenants by dealer
- pending commissions
- reseller readiness score

Reseller operations are ready for:

- tenant creation
- license sales
- health score review
- support session review

## Field Installer Mode

Installer manifest includes:

- signed installer
- signed binaries
- auto update
- startup registration
- device permissions
- silent install
- local health check
- rollback

Install command:

```bash
AdisyumDesktopBridgeSetup.exe /quiet /norestart
```

Health check:

```text
http://127.0.0.1:4891/health
```

## Commercial Operations Dashboard

System-admin monitoring now includes `Commercial Ops`.

Dashboard signals:

- active tenants
- unhealthy tenants
- expiring licenses
- failing devices
- pilot restaurants
- revenue metrics
- support metrics
- reseller metrics
- installer readiness
- auto support recommendations

## Auto Support Recommendations

Recommendation engine generates examples such as:

- Printer timeout artiyor
- WiFi instability detected
- Fiscal latency elevated
- Offline recovery risk
- Commercial operations stable

Signals come from pilot field telemetry, health scores, licenses and support command state.

## Readiness Scores

Current implementation baseline:

- commercialization readiness score: generated live in `commercialOps.scores`
- support maturity score: support sessions, auditability and remote command readiness
- deployment readiness score: signed installer/update/startup/silent install readiness
- reseller readiness score: dealer activation and tenant coverage
- field operations maturity score: pilot readiness plus support/deployment maturity

## Production Checklist

- [ ] Create first tenant through `/api/commercial/provision`.
- [ ] Confirm license policy is created.
- [ ] Install Desktop Bridge using signed installer package.
- [ ] Verify local health check.
- [ ] Run field installer device diagnostics.
- [ ] Send remote `device_diagnostics` command.
- [ ] Open temporary support session.
- [ ] Approve support session from tenant side.
- [ ] Validate remote config push audit log.
- [ ] Confirm reseller commission appears.
- [ ] Confirm Commercial Ops dashboard scores.
- [ ] Confirm low health pilot restaurant creates recommendation.
