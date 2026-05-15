# ADİSYUM Windows Installer Build Guide

## Goal

A single `AdisyumSetup.exe` should install:

- Adisyum desktop bridge runtime
- tray monitor
- desktop shortcuts
- startup autorun
- local bridge service
- firewall rules for local runtime ports

## Build prerequisites

- Windows 10/11
- .NET SDK compatible with the bridge and tray projects
- Inno Setup Compiler installed
- Administrator shell

## Build flow

1. Publish the bridge runtime and tray app.
2. Copy desktop shortcut templates.
3. Generate `setup.exe` through Inno Setup.
4. Sign binaries and installer.
5. Test install/uninstall on a clean VM.

## One-command build

```powershell
powershell -ExecutionPolicy Bypass -File deploy/windows/build-installer.ps1
```

Expected output:

- `deploy/artifacts/windows/bridge/AdisyumPosAgent.exe`
- `deploy/artifacts/windows/tray/AdisyumTray.exe`
- `deploy/artifacts/windows/AdisyumSetup.exe`

If `ISCC.exe` is not installed, the script still publishes both binaries and exits safely.

## Signing

Use signed binaries in production:

- `signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ...`
- sign the bridge EXE
- sign the tray EXE
- sign the installer EXE

## Verification

After build:

- check installer opens on a clean VM
- confirm tray icon appears
- confirm local bridge health endpoint responds
- confirm desktop shortcuts open POS/Admin
- confirm reboot persistence
