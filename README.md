# Figuro

A native macOS Excalidraw editor, with optional presentation tooling for Reveal.js.

See [docs/SPEC.md](docs/SPEC.md) for the design.

## Status

Phase 1 editor work is in progress, and initial Phase 2 metadata authoring has begun.
The persistent Presentation inspector can set or clear a reveal step on one selected
element; its metadata is stored in `customData.figuro` and survives save/reopen.

Working and verified end to end through real input events:

- Native document application: `NSDocument`, one window per file, autosave in place, Versions, revert.
- `.excalidraw` files open from Finder and from the Open dialog; new documents save correctly.
- Excalidraw runs fully offline inside the app bundle, including its fonts.
- Opening a file, panning it, clicking the canvas or switching tools never rewrites it on disk.
- Editing the drawing is autosaved within a few seconds.
- SVG and PNG export, defaulting to the document's own folder.

Not done yet:

- Undo and Redo are handled inside Excalidraw and have no native menu items. A native Edit menu entry would capture Cmd-Z without being able to service it, so exposing document history over the bridge is still outstanding.

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

## Layout

| Path | Contents |
| --- | --- |
| `apps/macos` | The Swift application. `Figuro.xcodeproj` is generated from `project.yml` and is not committed. |
| `packages/editor-host` | React app embedding `@excalidraw/excalidraw`, built into the app bundle. |
| `docs/SPEC.md` | Product and technical specification. |
