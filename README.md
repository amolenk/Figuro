# Figuro

A native macOS Excalidraw editor, with optional presentation metadata for Slidev.

See the [Figuro user guide](docs/SPEC.md) for drawing and Presentation inspector
workflows. The current specification and delivery plan live in
[GitHub issue #16](https://github.com/amolenk/Figuro/issues/16).

## Status

The native editor and Presentation inspector support single and multiple selected
elements, including arrows. The inspector shows mixed steps and roles, applies
edits to the whole selection, and can clear step, role, or all Figuro metadata.
Its v1 metadata is stored in `customData.figuro` and survives save/reopen while
preserving other custom data. Roles are labels for presentation stylesheets;
editing them keeps the drawing's appearance in Figuro unchanged.

Working and verified end to end through real input events:

- Native document application: `NSDocument`, one window per file, autosave in place, Versions, revert.
- `.excalidraw` files open from Finder and from the Open dialog; new documents save correctly.
- Excalidraw runs fully offline inside the app bundle, including its fonts.
- Opening a file, panning it, clicking the canvas or switching tools never rewrites it on disk.
- Editing the drawing is autosaved within a few seconds.
- SVG and PNG export, defaulting to the document's own folder.

Not done yet:

- Undo and Redo are handled inside Excalidraw and have no native menu items. A native Edit menu entry would capture Cmd-Z without being able to service it, so exposing document history over the bridge is still outstanding.

## Slidev addon

[`@figuro/slidev`](packages/slidev/README.md) renders one `.excalidraw` drawing per
Slidev slide, with click-driven reveals and optional presentation stylesheets.
It supports Slidev 53.x, pins Excalidraw 0.18.1, and has independent SemVer releases.
Ordinary files and Figuro metadata v1 work without the native app installed.

The addon is ready for its first public npm release; registry publication is
pending. See the [addon guide](packages/slidev/README.md) for installation,
`FiguroDiagram` authoring, supported metadata, and complex-scene behavior, and
the [release procedure](docs/SLIDEV_RELEASE.md) for publishing and clean-consumer
verification using `pnpm release:slidev prepare`, `publish`, and `verify`.
Slidev 53 requires Node.js 22.12 or later.

## Requirements

- macOS 14 or later, Xcode 26 or later (for the Icon Composer app icon)
- Node.js 20+, pnpm
- XcodeGen (`brew install xcodegen`)

## Build and run

```sh
make install
make run
```

The app is ad-hoc signed for local use. There is no Apple Developer account involved and the App Sandbox is off.

On its first launch, Figuro requests to become the default app for `.excalidraw`
drawings. Accept the macOS confirmation if one appears. To retry later, choose
**Figuro → Make Default for .excalidraw…**. The automatic request runs only once,
so subsequent launches respect a declined request or a later change of default.

Build a distributable universal DMG with `make dmg`. The
[Mac release guide](docs/MACOS_RELEASE.md) covers local builds, the GitHub Actions
macOS build, downloading artifacts, and first-time installation. Standard macOS
runner build minutes are free for this public repository.

For a single checkout shared between macOS and Docker Sandboxes, follow
[Sandbox development](docs/SANDBOX_DEVELOPMENT.md) to give Linux private
dependencies and build output before installing or building inside the sandbox.

Run the macOS acceptance suite with `make test`.
Each run exports its verdict and artifact paths to
`apps/macos/build/ui-tests/latest.json`, with logs, JSON summaries, and failure
attachments retained in a separate directory per run. Use `make test-results`
to export the latest existing Xcode result bundle without rerunning tests.
Run `make test-setup` once on the Mac to allow XCTest automation without repeated
administrator authentication.

Sandbox agents can submit the same suite to a runner on your Mac:

```sh
# On the Mac, from this checkout; leave running in a desktop session.
python3 scripts/ui-tests.py runner

# In the sandbox, against the shared checkout.
pnpm --silent test:ui:start
pnpm --silent test:ui:wait <job-id>
pnpm --silent test:ui:results <job-id>
```

Jobs capture uncommitted source changes and return JSON results, build logs, and
Xcode attachments. See [docs/UI_TEST_RUNNER.md](docs/UI_TEST_RUNNER.md) for setup,
queue paths, and the agent workflow.

## Layout

| Path | Contents |
| --- | --- |
| `apps/macos` | The Swift application. `Figuro.xcodeproj` is generated from `project.yml` and is not committed. |
| `packages/editor-host` | React app embedding `@excalidraw/excalidraw`, built into the app bundle. |
| `packages/figuro-schema` | Shared presentation metadata v1 types and validation. |
| `packages/slidev` | Independently released Slidev addon and Docker browser acceptance suite. |
| `docs/SPEC.md` | Figuro user guide and current presentation contract. |
