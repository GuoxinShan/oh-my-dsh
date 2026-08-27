#!/usr/bin/env bash
# Submit the updater zip and the install DMG to Apple in parallel, then staple
# and Gatekeeper-assess only the DMG. Zip cannot be stapled; electron-updater
# looks the ticket up online after download.
#
# Two hashes, two tickets — one wait: notarytool --wait on both at once, so
# wall clock is max(zip, dmg) instead of sum. electron-builder must leave
# mac.notarize false (its default); blocking on .app before pack serializes
# the same Apple queue this script collapses.
#
# Usage: scripts/notarize-mac-artifacts.sh <path-to.dmg> <path-to.zip>
# Env:   APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD or APPLE_APP_SPECIFIC_PASSWORD
#        DSH_CODESIGN_IDENTITY or CSC_NAME (optional; re-signs the DMG)

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <path-to.dmg> <path-to.zip>" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "notarize-mac: macOS is required" >&2
  exit 2
fi

dmg=$1
zip=$2
if [[ ! -f "$dmg" ]]; then
  echo "notarize-mac: not found: $dmg" >&2
  exit 1
fi
if [[ ! -f "$zip" ]]; then
  echo "notarize-mac: not found: $zip" >&2
  exit 1
fi
dmg=$(cd "$(dirname "$dmg")" && pwd)/$(basename "$dmg")
zip=$(cd "$(dirname "$zip")" && pwd)/$(basename "$zip")

apple_id=${APPLE_ID:-}
password=${APPLE_PASSWORD:-${APPLE_APP_SPECIFIC_PASSWORD:-}}
team_id=${APPLE_TEAM_ID:-}
identity=${DSH_CODESIGN_IDENTITY:-${CSC_NAME:-}}

if [[ -z "$apple_id" || -z "$password" || -z "$team_id" ]]; then
  echo "notarize-mac: APPLE_ID, APPLE_TEAM_ID, and APPLE_PASSWORD (or APPLE_APP_SPECIFIC_PASSWORD) are required" >&2
  exit 1
fi

if [[ -n "$identity" ]]; then
  echo "notarize-mac: signing $(basename "$dmg")"
  codesign --force --sign "$identity" --timestamp "$dmg"
fi

submit() {
  local file=$1
  echo "notarize-mac: submitting $(basename "$file")"
  xcrun notarytool submit "$file" \
    --apple-id "$apple_id" \
    --password "$password" \
    --team-id "$team_id" \
    --wait
}

submit "$dmg" &
pid_dmg=$!
submit "$zip" &
pid_zip=$!

fail=0
if ! wait "$pid_dmg"; then
  echo "notarize-mac: DMG submission failed" >&2
  fail=1
fi
if ! wait "$pid_zip"; then
  echo "notarize-mac: zip submission failed" >&2
  fail=1
fi
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "notarize-mac: stapling $(basename "$dmg")"
xcrun stapler staple "$dmg"

spctl -a -vv -t install "$dmg"
echo "notarize-mac: ok $(basename "$dmg") $(basename "$zip")"
