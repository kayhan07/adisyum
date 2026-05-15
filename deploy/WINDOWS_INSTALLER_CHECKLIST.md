# ADİSYUM Windows Installer Checklist

## Pre-build

- [ ] `tools/adisyum-pos-agent` builds
- [ ] `tools/adisyum-tray` builds
- [ ] `tools/adisyum-updater` builds
- [ ] Inno Setup Compiler installed
- [ ] Binaries are signed
- [ ] Release version number set
- [ ] Update manifest published
- [ ] SHA-256 hash matches release manifest
- [ ] Timestamp server configured
- [ ] EV certificate signing configured

## Install

- [ ] `setup.exe` starts with admin prompt
- [ ] install path selectable
- [ ] bridge files copied to Program Files
- [ ] tray app copied to Program Files
- [ ] updater service copied to Program Files
- [ ] desktop shortcuts created
- [ ] startup autorun created
- [ ] bridge service created
- [ ] updater service created
- [ ] firewall rules added

## First-run

- [ ] tray icon visible
- [ ] bridge runtime starts automatically
- [ ] printer discovery works
- [ ] websocket health is shown
- [ ] local API responds on loopback
- [ ] POS/Admin shortcuts open correct targets
- [ ] update manifest integrity is verified
- [ ] signed package check passes
- [ ] updater service is online

## Uninstall

- [ ] service removed
- [ ] autorun removed
- [ ] firewall rules removed
- [ ] cache removed
- [ ] stale runtime removed
- [ ] no leftover shortcuts
- [ ] updater cache cleared

## Trust checks

- [ ] SmartScreen publisher identity matches expected certificate
- [ ] installer and binaries are timestamped
- [ ] unsigned artifacts are blocked
- [ ] corrupted manifest handling is tested
- [ ] tenant-safe staged rollout verified
