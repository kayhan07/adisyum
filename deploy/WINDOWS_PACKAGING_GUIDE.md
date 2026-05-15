# ADİSYUM Windows Packaging Guide

## Packaging strategy

Recommended stack:

- Inno Setup for `setup.exe`
- signed bridge EXE
- signed tray EXE
- versioned release manifest for auto-update
- local registry autorun for tray and bridge

## Artifacts

| Artifact | Purpose |
| --- | --- |
| `AdisyumPosAgent.exe` | local bridge runtime |
| `AdisyumTray.exe` | status tray + launcher |
| `AdisyumSetup.exe` | customer installer |
| `.url` shortcuts | POS/Admin desktop links |

## Install locations

- Bridge and tray: `%ProgramFiles%\Adisyum`
- Bridge local state: `%LOCALAPPDATA%\Adisyum\DesktopBridge`
- Tray local state: `%LOCALAPPDATA%\Adisyum\Tray`
- Shared app data: `%ProgramData%\Adisyum`
- Release manifest: `%LOCALAPPDATA%\Adisyum\DesktopBridge\release-manifest.json`

## Desktop shortcuts

- Adisyum POS
- Adisyum Admin
- Adisyum Tray

## Startup behavior

- tray app launches on logon
- tray starts bridge if bridge is not running
- bridge is registered as a service for background runtime

## Firewall rules

Installer opens only the local ports required by the bridge:

- 3001
- 4891
- 3443

## Cleanup on uninstall

Remove:

- service entry
- autorun registry entries
- firewall rules
- cached runtime state
- desktop shortcuts
- stale app folders
