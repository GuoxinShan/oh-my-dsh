#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <path-to.dmg>" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "verify-dmg-layout: macOS is required" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dmg=$1
if [[ ! -f "$dmg" ]]; then
  echo "verify-dmg-layout: DMG not found: $dmg" >&2
  exit 1
fi
dmg=$(cd "$(dirname "$dmg")" && pwd)/$(basename "$dmg")

product_name="Oh My DSH"
# Keep these in lockstep with electron-builder.yml dmg.window / dmg.contents.
window_width=660
window_height=400
app_x=180
app_y=196
applications_x=480
applications_y=196

expected_background="$repo_root/src-tauri/dmg/background.png"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/dsh-dmg-verify.XXXXXX")
attached=false

cleanup() {
  if [[ "$attached" == true ]]; then
    hdiutil detach "$mount_dir" >/dev/null 2>&1 || hdiutil detach -force "$mount_dir" >/dev/null 2>&1 || true
  fi
  rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mount_dir" "$dmg" >/dev/null
attached=true

failed=false
fail() {
  echo "verify-dmg-layout: $*" >&2
  failed=true
}

ds_store="$mount_dir/.DS_Store"
background="$mount_dir/.background/background.png"
app="$mount_dir/$product_name.app"
applications="$mount_dir/Applications"

if [[ ! -s "$ds_store" ]]; then
  fail ".DS_Store is missing or empty; Finder will show the default bare layout"
else
  ds_store_size=$(stat -f '%z' "$ds_store")
  if (( ds_store_size < 1024 )); then
    fail ".DS_Store is unexpectedly small (${ds_store_size} bytes)"
  fi

  if ! python3 - "$ds_store" "$product_name.app" \
    "$window_width" "$window_height" "$app_x" "$app_y" "$applications_x" "$applications_y" <<'PY'
import re
import sys

try:
    from ds_store import DSStore
    from ds_store.store import codecs
except ModuleNotFoundError:
    print("verify-dmg-layout: install ds-store==1.3.1 to validate Finder records", file=sys.stderr)
    raise SystemExit(1)

path, app_name, width, height, app_x, app_y, applications_x, applications_y = sys.argv[1:]
expected_size = (int(width), int(height))
expected_app = (int(app_x), int(app_y))
expected_applications = (int(applications_x), int(applications_y))
errors = []

# Some create-dmg pBBk payloads are not standalone bookmark files. They are
# unrelated to the records inspected here and otherwise make traversal fail.
codecs.pop(b"pBBk", None)

try:
    with DSStore.open(path, "r") as store:
        bwsp = store["."]["bwsp"]
        icvp = store["."]["icvp"]
        app_position = store[app_name]["Iloc"]
        applications_position = store["Applications"]["Iloc"]
except Exception as exc:
    print(f"verify-dmg-layout: cannot parse Finder records: {exc}", file=sys.stderr)
    raise SystemExit(1)

bounds = bwsp.get("WindowBounds", "")
match = re.fullmatch(r"\{\{\s*-?\d+,\s*-?\d+\},\s*\{\s*(\d+),\s*(\d+)\}\}", bounds)
actual_size = None if match is None else (int(match.group(1)), int(match.group(2)))
if actual_size != expected_size:
    errors.append(f"Finder window size {actual_size!r} != {expected_size!r}")
if icvp.get("backgroundType") != 2:
    errors.append(f"Finder backgroundType {icvp.get('backgroundType')!r} != 2 (image)")
alias = icvp.get("backgroundImageAlias", b"")
if not isinstance(alias, (bytes, bytearray)) or b"background.png" not in alias:
    errors.append("Finder background image alias does not reference background.png")
if icvp.get("arrangeBy") != "none":
    errors.append(f"Finder arrangeBy {icvp.get('arrangeBy')!r} != 'none'")
if icvp.get("iconSize") != 128.0:
    errors.append(f"Finder iconSize {icvp.get('iconSize')!r} != 128")
if app_position != expected_app:
    errors.append(f"{app_name} position {app_position!r} != {expected_app!r}")
if applications_position != expected_applications:
    errors.append(f"Applications position {applications_position!r} != {expected_applications!r}")

if errors:
    for error in errors:
        print(f"verify-dmg-layout: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
  then
    failed=true
  fi
fi

if [[ ! -f "$background" ]]; then
  fail "bundled background is missing"
elif ! cmp -s "$expected_background" "$background"; then
  fail "bundled background differs from src-tauri/dmg/background.png"
fi

[[ -d "$app" ]] || fail "$product_name.app is missing"
if [[ ! -L "$applications" ]]; then
  fail "Applications drop link is missing"
elif [[ "$(readlink "$applications")" != '/Applications' ]]; then
  fail "Applications drop link points to $(readlink "$applications"), expected /Applications"
fi

if [[ "$failed" == true ]]; then
  exit 1
fi

echo "verify-dmg-layout: ok ($(basename "$dmg"), .DS_Store ${ds_store_size} bytes, background $(shasum -a 256 "$background" | awk '{print $1}'))"
