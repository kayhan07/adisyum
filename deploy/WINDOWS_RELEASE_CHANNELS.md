# ADİSYUM Release Channels

## stable

Production default. Only proven releases reach this channel.

## beta

Broad validation channel before stable promotion.

## pilot

Tenant-targeted rollout channel for selected restaurants.

## internal

Engineering and QA only.

## hotfix

Urgent production correction channel.

## Channel policy

- Every runtime knows its current channel.
- Every manifest carries its rollout track.
- Every promotion must keep checksum + signature validation.
- Pilot tenants can be pinned to beta or hotfix releases.
