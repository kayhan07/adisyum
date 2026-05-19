# ADİSYUM Update Manifest Spec

## Purpose

A signed manifest drives background updates for the Windows runtime.

## Fields

- `version`
- `runtimeVersion`
- `buildNumber`
- `channel`
- `track`
- `changelog`
- `downloadUrl`
- `checksum`
- `signature`
- `publisher`
- `publisherThumbprint`
- `timestampServer`
- `signedInstaller`
- `signedBinaries`
- `signedUpdater`
- `stagedRolloutPercent`
- `minimumBridgeVersion`
- `minimumTrayVersion`
- `targetTenants`

## Example

```json
{
  "version": "1.4.2",
  "runtimeVersion": "1.4.2",
  "buildNumber": "202605141230",
  "channel": "stable",
  "track": "stable",
  "changelog": "Printer reconnect hardening, tray health improvements, update rollback safety.",
  "downloadUrl": "https://adisyum.com/downloads/windows/v1.4.2/AdisyumDesktopSetup.exe",
  "checksum": "sha256:...",
  "signature": "base64-signature",
  "stagedRolloutPercent": 100,
  "minimumBridgeVersion": "1.4.2",
  "minimumTrayVersion": "1.4.2",
  "targetTenants": []
}
```

## Validation rules

- signature must verify before download execution
- checksum must match before install
- manifest version must be newer than installed runtime
- channel must match the runtime track unless tenant-targeted rollout applies
- signedInstaller/signedBinaries/signedUpdater must all be true for production channels
- timestampServer must be present for production signing metadata
- failed install must preserve previous runtime snapshot
