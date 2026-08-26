#!/usr/bin/env bash
# Sign (if an identity is present), notarize, staple, and Gatekeeper-assess a DMG.
#
# electron-builder's mac.notarize submits the .app before it wraps zip/dmg.
# The DMG is a new hash — stapler cannot find a ticket until this script
# submits it. Same extra notarytool pass the archived Tauri pipeline used.
#
# Usage: scripts/notarize-dmg.sh <path-to.dmg>
# Env:   APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD or APPLE_APP_SPECIFIC_PASSWORD
#        DSH_CODESIGN_IDENTITY or CSC_NAME (optional; re-signs the DMG)

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <path-to.dmg>" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "notarize-dmg: macOS is required" >&2
  exit 2
fi

dmg=$1
if [[ ! -f "$dmg" ]]; then
  echo "notarize-dmg: not found: $dmg" >&2
  exit 1
fi
dmg=$(cd "$(dirname "$dmg")" && pwd)/$(basename "$dmg")

apple_id=${APPLE_ID:-}
password=${APPLE_PASSWORD:-${APPLE_APP_SPECIFIC_PASSWORD:-}}
team_id=${APPLE_TEAM_ID:-}
identity=${DSH_CODESIGN_IDENTITY:-${CSC_NAME:-}}

if [[ -z "$apple_id" || -z "$password" || -z "$team_id" ]]; then
  echo "notarize-dmg: APPLE_ID, APPLE_TEAM_ID, and APPLE_PASSWORD (or APPLE_APP_SPECIFIC_PASSWORD) are required" >&2
  exit 1
fi

if [[ -n "$identity" ]]; then
  echo "notarize-dmg: signing $(basename "$dmg")"
  codesign --force --sign "$identity" --timestamp "$dmg"
fi

echo "notarize-dmg: submitting $(basename "$dmg")"
xcrun notarytool submit "$dmg" \
  --apple-id "$apple_id" \
  --password "$password" \
  --team-id "$team_id" \
  --wait

echo "notarize-dmg: stapling $(basename "$dmg")"
xcrun stapler staple "$dmg"

spctl -a -vv -t install "$dmg"
echo "notarize-dmg: ok $(basename "$dmg")"
