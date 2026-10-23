#!/usr/bin/env python3
"""Build a universal Release app and package it in a distributable disk image."""

import argparse
import hashlib
from pathlib import Path
import platform
import plistlib
import re
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent


def run(*command, cwd=ROOT, capture=False):
    return subprocess.run(command, cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def verify_architectures(binary):
    # Select Xcode's tool explicitly and avoid variant-dependent parsing of
    # -verify_arch's variable-length argument list.
    architectures = set(run("xcrun", "lipo", "-archs", str(binary), capture=True).split())
    missing = {"arm64", "x86_64"} - architectures
    if missing:
        raise ValueError(
            f"Universal binary {binary} is missing architectures: {', '.join(sorted(missing))}. "
            f"Found: {', '.join(sorted(architectures)) or 'none'}.")


def build(args):
    if platform.system() != "Darwin":
        raise ValueError("DMG builds require macOS with Xcode 26 or later; run on your Mac or the macOS GitHub Actions runner.")
    for tool in ("xcodebuild", "xcrun", "xcodegen", "pnpm", "hdiutil", "codesign", "ditto"):
        if not shutil.which(tool):
            raise ValueError(f"Missing {tool}. See docs/MACOS_RELEASE.md for prerequisites.")
    xcode = run("xcodebuild", "-version", capture=True)
    match = re.search(r"Xcode (\d+)", xcode)
    if not match or int(match[1]) < 26:
        raise ValueError("Select Xcode 26 or later (needed for the Icon Composer app icon), using DEVELOPER_DIR or xcode-select.")
    if not (ROOT / "apps/macos/Resources/figuro.icon/icon.json").is_file():
        raise ValueError("Missing apps/macos/Resources/figuro.icon. Include the Icon Composer source in the checkout before building.")
    if args.version and not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        raise ValueError("--version must be a numeric app version such as 0.1.0.")
    if args.build_number and not re.fullmatch(r"[1-9]\d*", args.build_number):
        raise ValueError("--build-number must be a positive integer.")

    output = args.output_dir.resolve()
    derived = ROOT / "apps/macos/build/dmg-derived-data"
    output.mkdir(parents=True, exist_ok=True)
    run("pnpm", "install", "--frozen-lockfile")
    run("bash", "apps/macos/Scripts/build-editor-host.sh")
    run("xcodegen", "generate", cwd=ROOT / "apps/macos")
    settings = ["ARCHS=arm64 x86_64", "ONLY_ACTIVE_ARCH=NO", "CODE_SIGNING_ALLOWED=NO"]
    if args.version:
        settings.append(f"MARKETING_VERSION={args.version}")
    if args.build_number:
        settings.append(f"CURRENT_PROJECT_VERSION={args.build_number}")
    run("xcodebuild", "-project", "apps/macos/Figuro.xcodeproj", "-scheme", "Figuro",
        "-configuration", "Release", "-destination", "generic/platform=macOS",
        "-derivedDataPath", str(derived), *settings, "build")

    app = derived / "Build/Products/Release/Figuro.app"
    if not (app / "Contents/Resources/EditorHost/index.html").is_file():
        raise ValueError("The Release app is missing its embedded editor host.")
    verify_architectures(app / "Contents/MacOS/Figuro")
    with (app / "Contents/Info.plist").open("rb") as file:
        info = plistlib.load(file)
    version = info["CFBundleShortVersionString"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"Unexpected built app version: {version}")
    run("codesign", "--force", "--sign", "-", str(app))
    run("codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app))

    filename = f"Figuro-{version}-macos-universal.dmg"
    with tempfile.TemporaryDirectory(prefix="figuro-dmg-") as temporary:
        temporary = Path(temporary)
        stage = temporary / "contents"
        stage.mkdir()
        run("ditto", str(app), str(stage / "Figuro.app"))
        (stage / "Applications").symlink_to("/Applications")
        shutil.copy2(ROOT / "LICENSE", stage / "LICENSE.txt")
        (stage / "Install.txt").write_text(
            "Drag Figuro.app to Applications, then open it from Applications.\n"
            "Requires macOS 14 or later. Supports Apple Silicon and Intel Macs.\n"
            "This build is ad-hoc signed and is not notarized by Apple.\n"
            "After attempting to open it, use System Settings > Privacy & Security > Open Anyway if macOS blocks it.\n",
            encoding="utf8")
        image = temporary / filename
        run("hdiutil", "create", "-volname", "Figuro", "-srcfolder", str(stage),
            "-fs", "HFS+", "-format", "UDZO", str(image))
        run("hdiutil", "verify", str(image))
        # Publish the output only after packaging and verification succeed.
        shutil.copy2(image, output / filename)
    digest = hashlib.sha256((output / filename).read_bytes()).hexdigest()
    (output / f"{filename}.sha256").write_text(f"{digest}  {filename}\n", encoding="utf8")
    print(f"Built {output / filename}\nSHA-256: {digest}")
    print("Ad-hoc signed; see docs/MACOS_RELEASE.md for installation instructions.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="Override the app marketing version; default: project.yml")
    parser.add_argument("--build-number", help="Override the app build number; default: project.yml")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "apps/macos/build/dmg")
    args = parser.parse_args()
    try:
        build(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"DMG build failed: {error}\n")


if __name__ == "__main__":
    main()
