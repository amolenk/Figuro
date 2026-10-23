"""THROWAWAY: snapshot the checkout, overlay a native harness, submit to Mac queue."""
import importlib.util
import argparse
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--timeout", type=int, default=300)
parser.add_argument("--only-testing", default="FiguroUITests/UnifiedHistoryPrototypeTests")
args = parser.parse_args()

root = Path(__file__).resolve().parents[4]
here = Path(__file__).resolve().parent
scratch = Path("/tmp/opencode") / f"figuro-unified-history-native-{uuid4().hex[:8]}"
scratch.mkdir()
spec = importlib.util.spec_from_file_location("ui_tests", root / "scripts/ui-tests.py")
queue_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(queue_tools)
source = scratch / "source"
queue_tools.snapshot(root, root / ".ui-tests", source)
for name in ["AppDelegate", "Document", "EditorViewController"]:
    shutil.copyfile(here / "native" / f"{name}.swift", source / "apps/macos/Sources/Figuro" / f"{name}.swift")
# The ordinary menu references methods intentionally not present in this isolated host.
(source / "apps/macos/Sources/Figuro/MainMenu.swift").unlink()
shutil.copyfile(here / "native/UnifiedHistoryPrototypeTests.swift", source / "apps/macos/Tests/FiguroUITests/UnifiedHistoryPrototypeTests.swift")
build_script = source / "apps/macos/Scripts/build-editor-host.sh"
build_script.write_text('''#!/bin/bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
(cd "$REPO_ROOT" && node packages/editor-host/prototypes/unified-history/server.mjs --build)
STAGING="$REPO_ROOT/apps/macos/Resources/EditorHost"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$REPO_ROOT/packages/editor-host/prototypes/unified-history/dist"/. "$STAGING"/
''')
subprocess.run(["git", "init", "--quiet", str(source)], check=True)
subprocess.run(["python3", "scripts/ui-tests.py", "start", "--queue", str(root / ".ui-tests"), "--only-testing", args.only_testing, "--timeout", str(args.timeout)], cwd=source, check=True)
