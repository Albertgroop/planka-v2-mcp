#!/usr/bin/env bash
# Print the release notes of one version: the body of its "## [X.Y.Z]" section
# in CHANGELOG.md, up to the next "## [" heading. Fails if the section is
# missing or empty, so a version bump without notes cannot be released.
#
#   .github/scripts/release-notes.sh 1.4.3
set -euo pipefail

version="${1:?usage: release-notes.sh X.Y.Z}"
changelog="${CHANGELOG:-CHANGELOG.md}"

notes=$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' "$changelog")

# Trim leading and trailing blank lines.
notes=$(printf '%s\n' "$notes" | sed -e '/./,$!d' | sed -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')

if [ -z "$notes" ]; then
  echo "No release notes for $version: add a \"## [$version]\" section to $changelog." >&2
  exit 1
fi

printf '%s\n' "$notes"
