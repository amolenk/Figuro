#!/usr/bin/env python3
"""Give a Linux sandbox private dependencies/output in a shared source checkout."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def mount_source(target):
    result = subprocess.run(
        ["findmnt", "--mountpoint", str(target), "--json", "--output", "SOURCE"],
        capture_output=True, text=True,
    )
    if result.returncode == 1:
        return None
    result.check_returncode()
    # The last entry is the visible mount when mounts have been stacked.
    source = json.loads(result.stdout)["filesystems"][-1]["source"]
    # findmnt reports bind sources as the backing filesystem plus a subdirectory.
    if "[" in source and source.endswith("]"):
        return source[source.index("[") + 1:-1]
    return source


def main():
    if sys.platform != "linux":
        raise ValueError("Run this inside the Linux sandbox, not on macOS")
    root = Path(__file__).resolve().parents[1]
    workspace_fs = subprocess.check_output(
        ["findmnt", "--target", str(root), "--noheadings", "--output", "FSTYPE"],
        text=True,
    ).strip()
    if workspace_fs != "virtiofs":
        raise ValueError("Expected a Docker Sandbox checkout shared through virtiofs")

    key = hashlib.sha256(os.fsencode(root)).hexdigest()[:16]
    storage = Path.home() / ".local/share/figuro-sandbox" / key
    if storage.resolve() == root or root in storage.resolve().parents:
        raise ValueError("Private storage must be outside the shared checkout")
    projects = [root, *sorted(path.parent for path in (root / "packages").glob("*/package.json"))]
    mounts = [
        (storage / project.relative_to(root) / name, project / name)
        for project in projects for name in ("node_modules", "dist")
    ]
    # Check existing mounts before modifying anything. Never replace an unrelated mount.
    for source, target in mounts:
        if target.is_symlink():
            raise ValueError(f"Refusing to mount over a symlink: {target}")
        existing = mount_source(target)
        if existing is not None and existing != str(source):
            raise ValueError(f"Already mounted from another source: {target} ({existing})")

    subprocess.run(["sudo", "-n", "true"], check=True)
    for source, target in mounts:
        source.mkdir(parents=True, exist_ok=True)
        # Creating a missing, ignored directory is the only host-side filesystem change.
        target.mkdir(exist_ok=True)
        if mount_source(target) is None:
            subprocess.run(["sudo", "-n", "mount", "--bind", str(source), str(target)], check=True)
        if mount_source(target) != str(source):
            raise ValueError(f"Could not verify private mount: {target}")
        print(f"{target.relative_to(root)} -> {source}")
    print("Private Linux storage is ready. Install dependencies with --frozen-lockfile.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Sandbox storage setup failed: {error}", file=sys.stderr)
        sys.exit(1)
