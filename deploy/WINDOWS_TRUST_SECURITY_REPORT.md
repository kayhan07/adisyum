# Adisyum Windows Trust, Code Signing and Secure Update Report

Date: 2026-05-14

## Architecture Summary

Adisyum Windows releases now follow a signed runtime and signed installer model:

- Bridge, tray and updater binaries are signed with SHA256 Authenticode.
- Installer packages are signed after Inno Setup output is produced.
- Timestamp server support is built into the packaging pipeline.
- Release manifests carry publisher, certificate thumbprint, checksum, signature, digest and approval metadata.
- The updater validates checksum, Authenticode certificate thumbprint, manifest digest, release approvals, channel validity and safe update window before staging an install.
- Update failures emit telemetry for failed signature validation, tampered updates, corrupted manifests and suspicious update sources.

## CI/CD Signing Flow

Recommended production flow:

1. Build bridge, tray and updater from a clean release branch.
2. Sign all runtime binaries with the EV or OV code-signing certificate.
3. Generate the release manifest with channel, rollout, approval and digest metadata.
4. Build the Inno Setup installer.
5. Sign the installer and recompute checksum and manifest digest.
6. Upload installer and manifest to the approved release origin.
7. Approve pilot rollout, then staged rollout, then stable rollout.

Required build inputs:

- `ADISYUM_SIGNING_THUMBPRINT` or `ADISYUM_SIGNING_PFX`
- `ADISYUM_SIGNING_PFX_PASSWORD` when PFX signing is used
- `ADISYUM_DOWNLOAD_BASE_URL`
- Timestamp server, default: `http://timestamp.digicert.com`

## Runtime Update Safety

The updater blocks installation when any of these fail:

- Invalid release channel
- Missing signed installer, binaries or updater policy
- Missing publisher, certificate thumbprint or timestamp metadata
- Checksum mismatch
- Authenticode certificate thumbprint mismatch
- Invalid certificate chain
- Manifest digest mismatch
- Missing release, pilot or staged rollout approval
- Update outside safe update window, except hotfix releases

Recovery behavior:

- `.partial` downloads are reused only when fresh.
- Stale partial downloads are discarded.
- Existing final installer files are replaced before a new download.
- Rollback snapshots are created before staging.
- Failed updates are logged to health and security telemetry.

## Windows Trust Readiness Score

Score: 86/100

Strengths:

- SHA256 Authenticode signing path is automated.
- Timestamp support is present.
- Runtime and installer signing are both enforced for trust builds.
- Manifest integrity is checked before install.
- Update tampering produces security telemetry.

Remaining production items:

- Use an EV code-signing certificate for faster SmartScreen reputation building.
- Publish releases from a long-lived, HTTPS-only download domain.
- Keep installer file names stable and versioned.
- Avoid frequent certificate or publisher name changes.

## Signing Maturity Score

Score: 88/100

Implemented:

- Signed installer
- Signed bridge runtime
- Signed tray runtime
- Signed updater
- SHA256 digest policy
- Timestamp server support
- CI/CD compatible certificate thumbprint and PFX inputs

Next maturity step:

- Move signing keys to a hardware-backed HSM or cloud signing provider.
- Require dual approval before stable channel publication.

## Update Security Score

Score: 90/100

Implemented:

- Checksum validation
- Authenticode validation
- Publisher thumbprint pinning
- Manifest digest validation
- Channel validation
- Safe update window
- Partial download recovery
- Rollback snapshot flow
- Staged rollout approval checks
- Security observability events

Next maturity step:

- Add detached manifest signatures from the release service.
- Store signed release manifests in append-only audit storage.

## SmartScreen Readiness Report

Current readiness: High, pending certificate reputation.

SmartScreen trust improves when:

- The same publisher identity is used consistently.
- Installers and binaries are always signed.
- Downloads come from the same trusted domain.
- Release volume grows without malware or reputation incidents.
- The installer uses clear product metadata and support URLs.

Production release checklist:

- EV certificate configured on CI/CD runner
- Timestamp server reachable
- `-RequireSigning` enabled for stable releases
- Release, pilot and staged rollout approvals present
- Installer and manifest uploaded atomically
- Security telemetry monitored after rollout
