# ADİSYUM Versioning & Release Channel Guide

## Version model

Use SemVer:

- `MAJOR.MINOR.PATCH`
- example: `1.4.2`
- installer and runtime should share the same release version
- build metadata can be represented separately with a timestamped build number

## Release channels

- `stable` – production default
- `beta` – broader validation before stable
- `pilot` – selected restaurants / tenants only
- `internal` – engineering and QA only
- `hotfix` – urgent production correction

## Runtime awareness

The Windows bridge and tray now expose:

- current version
- current release channel
- rollout track
- manifest path

The installer seeds runtime metadata from [deploy/windows/release-manifest.sample.json](deploy/windows/release-manifest.sample.json).

## Suggested environment variables

- `ADISYUM_RELEASE_CHANNEL`
- `ADISYUM_RELEASE_TRACK`
- `ADISYUM_BUILD_NUMBER`

## Installer versioning

- `AdisyumSetup.exe` should be stamped with the same SemVer as the release
- increment patch for compatibility fixes
- increment minor for features
- increment major for breaking changes

## API compatibility tracking

Track compatibility in the release manifest:

- minimum bridge version
- minimum tray version
- compatible API range
- tenant-targeted rollout rules

## Recommended release rule

- `pilot` tenants receive `beta` before `stable`
- `hotfix` can bypass staged rollout but still requires checksum + signature validation
