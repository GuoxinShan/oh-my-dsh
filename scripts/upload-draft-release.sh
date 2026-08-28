#!/usr/bin/env bash
# Create-or-reuse a draft GitHub Release for $TAG and upload every file in $DIR.
# Both platform jobs call this so publish does not shuttle 400MB artifacts.
set -euo pipefail

TAG="${1:?usage: upload-draft-release.sh <tag> <dir>}"
DIR="${2:?usage: upload-draft-release.sh <tag> <dir>}"

if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --draft --title "$TAG" --notes "Publishing…" \
    || gh release view "$TAG" >/dev/null
fi

shopt -s nullglob
files=("$DIR"/*)
[ "${#files[@]}" -gt 0 ] || { echo "upload-draft-release: $DIR is empty" >&2; exit 1; }

for attempt in 1 2 3 4 5; do
  if gh release upload "$TAG" "${files[@]}" --clobber; then
    exit 0
  fi
  sleep $((attempt * 2))
done

echo "upload-draft-release: failed to upload to $TAG" >&2
exit 1
