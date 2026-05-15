# ADİSYUM Windows Auto Update Flow

## Goal

Support silent and rollback-ready background updates for the Windows runtime.

## Recommended model

1. Bridge and tray read a signed update manifest.
2. Tray checks channel and version in the background.
3. If a newer version is available, the tray downloads the signed package.
4. The installer runs silently.
5. Tray keeps the previous release snapshot until the new version passes health checks.
6. If validation fails, rollback uses the last known good package.

The installer seeds the local manifest into:

`%LOCALAPPDATA%\Adisyum\DesktopBridge\release-manifest.json`

## Update manifest fields

- version
- channel
- sha256
- signature
- downloadUrl
- minimumBridgeVersion
- minimumTrayVersion

## Safety rules

- verify publisher signature
- verify SHA-256
- never auto-reset local data
- never stop printer queue jobs without draining
- keep previous installer available for rollback

## Suggested implementation steps

- expose update status in `/updater/status`
- have tray poll a signed manifest
- download to `%LOCALAPPDATA%\Adisyum\Tray\Updates`
- run update quietly
- relaunch tray and bridge
- recheck health before deleting previous package
