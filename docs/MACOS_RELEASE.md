# Building a Figuro DMG

Figuro can be distributed as a DMG without an Apple Developer account. The build
is ad-hoc signed, so recipients may need to allow it in macOS Privacy & Security
when opening it for the first time.

## Build on your Mac

Install the full Xcode 26 or later, accept its license and complete first-run
setup, then install Node.js 22+, pnpm 10.11.0, Python 3, and XcodeGen:

```sh
brew install node@22 python xcodegen
export PATH="$(brew --prefix node@22)/bin:$PATH"
npm install --global pnpm@10.11.0
xcodebuild -version
```

If `xcodebuild` points at Command Line Tools or Xcode 16, select your full Xcode
installation. For example, if Xcode 26 is installed as `/Applications/Xcode.app`:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

Xcode 26 is needed to compile `apps/macos/Resources/figuro.icon`; the built app
still targets **macOS 14 and later**. Include that Icon Composer source directory
in the checkout used by CI.

From the repository root:

```sh
make dmg
# Equivalent:
python3 scripts/build-dmg.py
```

The script installs dependencies from the frozen pnpm lockfile, builds the offline
editor assets, generates the Xcode project, and builds a **Release universal app**
for **Apple Silicon and Intel**. It verifies the architectures, embedded editor,
ad-hoc code signature, and disk image before writing:

```text
apps/macos/build/dmg/Figuro-0.1.0-macos-universal.dmg
apps/macos/build/dmg/Figuro-0.1.0-macos-universal.dmg.sha256
```

The DMG contains `Figuro.app`, an Applications shortcut, installation instructions,
and the MIT license. No Node.js or pnpm installation is needed on recipients' Macs.
The native app version is independent of `@figuro/slidev` and defaults to
`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `apps/macos/project.yml`.
To override them for a build:

```sh
python3 scripts/build-dmg.py --version 0.1.1 --build-number 2
python3 scripts/build-dmg.py --output-dir "$HOME/Desktop/Figuro-release"
python3 scripts/build-dmg.py --help
```

The script works from any directory when invoked with its absolute path. It must
run on macOS; a Linux Docker sandbox cannot compile the app or create this DMG.
Builds use `apps/macos/build/dmg-derived-data`, separate from Debug/test output.
Coordinate builds from a shared checkout because editor asset staging is shared.

## Build in GitHub Actions

[`.github/workflows/macos-dmg.yml`](../.github/workflows/macos-dmg.yml) runs on the
standard `macos-15` Apple Silicon runner, explicitly selects its installed Xcode
26.3, and cross-compiles both app architectures. It runs on relevant pull requests,
pushes to `main`, and manual dispatches. The workflow requires no Apple credentials
or npm publishing token.

After these files and the app icon source are committed and pushed, use
**Actions → macOS DMG → Run workflow**. Select the branch you want to build. Or:

```sh
gh workflow run macos-dmg.yml --ref main
gh run list --workflow macos-dmg.yml
gh run watch RUN_ID
gh run download RUN_ID --dir ./downloaded-dmg
```

Replace `RUN_ID` with the number from `gh run list`. Download the
`Figuro-macos-universal-…` artifact from the completed run. It contains the DMG and
SHA-256 file. CI also mounts the image and checks its app, editor assets,
Applications shortcut, universal binary, and signature. Artifacts are retained
for **7 days**. Download the DMG for longer-term distribution.

### Is the macOS runner free?

**Yes for this repository:** `amolenk/Figuro` is public, and GitHub's standard
hosted macOS runners have free, unlimited build minutes for public repositories.
The workflow uses a standard runner. GitHub's paid larger runners are charged
even for public repositories.

Artifact storage has a separate plan allowance (currently 500 MB on GitHub Free,
shared with GitHub Packages), which is why the workflow keeps only the DMG and
checksum for seven days. If the repository becomes private, macOS jobs use the
account's included Actions allowance and may incur charges beyond it.

These facts were checked against GitHub's documentation on 2026-10-21:

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Standard hosted runners and public-repository pricing](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories)
- [macOS 15 runner software, including Xcode versions](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md)

If GitHub removes the selected Xcode version from the runner image, update
`DEVELOPER_DIR` in the workflow to an installed Xcode 26-or-later version.

## Share and install

Share the `.dmg` and its `.sha256` file. For a GitHub release, create the release
in the web UI and upload both files, or upload to an existing release with:

```sh
gh release upload YOUR_APP_TAG apps/macos/build/dmg/*.dmg apps/macos/build/dmg/*.sha256
```

On the receiving Mac:

1. Open the DMG and drag **Figuro.app** onto **Applications**.
2. Eject the DMG, then open Figuro from Applications.
3. If macOS blocks the app, try opening it once, then go to
    **System Settings → Privacy & Security → Open Anyway**, confirm, and open it.
4. On its first launch, Figuro requests to become the default app for `.excalidraw`
   drawings. Accept the macOS confirmation if shown. You can retry with
   **Figuro → Make Default for .excalidraw…**; Figuro won't automatically request
   the change again on subsequent launches.

This prompt is expected for the ad-hoc-signed build. Allow it only when you trust
the source. See [Apple's instructions for opening an app from an unidentified
developer](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

Verify the download's checksum from the directory containing both files:

```sh
shasum -a 256 -c Figuro-0.1.0-macos-universal.dmg.sha256
```

Before announcing a release, test the downloaded DMG on a Mac: install the app,
open a drawing, edit/save/reopen presentation metadata, and export SVG/PNG. Native
acceptance remains available with `make test`; the packaging workflow verifies
the built artifact but does not drive the native UI.
