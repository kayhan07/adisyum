# ADİSYUM Windows Trust, Code Signing & Secure Update Guide

## Goals

- reduce Unknown Publisher warnings
- build Windows Defender reputation
- gain SmartScreen trust
- validate every update before install
- keep rollback safe on failure

## Code signing pipeline

Recommended signing order:

1. sign binaries
2. sign updater
3. sign installer
4. sign release manifest package
5. timestamp every signature

Recommended tooling:

- EV certificate compatible signing certificate
- SHA-256 signatures
- RFC 3161 timestamp server
- CI/CD secret storage for certificate material

## Trust rules

- never install unsigned runtime packages
- never trust a manifest without signature + checksum
- never download from non-HTTPS sources
- never promote to stable without pilot validation
- never accept unsigned binaries for stable/beta/pilot
- require timestamped signatures for installer, binaries and updater

## Secure validation flow

Before download:

- manifest integrity check
- channel validity check
- tenant eligibility check
- signature presence check

After download:

- SHA-256 checksum validation
- signature verification
- staged install to temp location
- rollback snapshot kept until health check passes

## Background update service

The updater service should:

- poll signed manifests
- download in background
- stage silently
- coordinate restart windows
- keep previous release snapshot
- rollback on failure
- emit security observability events for signature or checksum failures

## SmartScreen readiness

To improve trust:

- use stable publisher identity
- keep file hashes consistent across builds
- avoid unnecessary binary churn
- ship signed and timestamped artifacts only
- distribute via consistent download origin

## Security observability

Monitor:

- unsigned runtime detection
- failed signature validation
- tampered update packages
- corrupted manifests
- suspicious update sources

## Operational guidance

- pilot tenants receive beta or hotfix first
- stable channel only after approval
- retain last known good installer for rollback
- log every failed update and rollback reason
