#!/bin/bash
#
# Builds the Excalidraw editor host and stages it into the app bundle
# resources. Run automatically as an Xcode pre-build phase.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST_DIST="$REPO_ROOT/packages/editor-host/dist"
STAGING="$REPO_ROOT/apps/macos/Resources/EditorHost"

# Xcode's build environment has a minimal PATH; find the toolchain the way a
# login shell would.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. Install it, then rebuild." >&2
  exit 1
fi

(cd "$REPO_ROOT" && pnpm --filter @figuro/editor-host build)

rm -rf "$STAGING"
mkdir -p "$STAGING"
# Copy contents, not the directory itself, so index.html sits at the root.
cp -R "$HOST_DIST"/. "$STAGING"/
