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
- The reusable `@figuro/slidev` addon is planned; metadata authoring in the native
  editor is available now. See [#16](https://github.com/amolenk/Figuro/issues/16)
  for the addon contract and remaining implementation tickets.

## Requirements

- macOS 14 or later, Xcode 16 or later
- Node.js 20+, pnpm
- XcodeGen (`brew install xcodegen`)

## Build and run

```sh
make install
make run
```

The app is ad-hoc signed for local use. There is no Apple Developer account involved and the App Sandbox is off.

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
| `docs/SPEC.md` | Figuro user guide and current presentation contract. |
