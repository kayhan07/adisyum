#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-${SCRIPT_DIR}}"

exec bash "${APP_DIR}/deploy/scripts/reconstruct-vps-runtime.sh" "$@"
