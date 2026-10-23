# Unified history feasibility prototype

**Throwaway integration experiment.** Question: can independent document-level
Storyboard cards participate in Excalidraw's own drawing undo/redo chronology,
while preserving drawing transaction boundaries and supporting native menus?

Run from the workspace:

```sh
pnpm prototype:history
```

Open <http://127.0.0.1:5198>. The real Excalidraw canvas is on the left; free-play
controls, guided walkthroughs, and the full document/history state are on the
right. It is a logic/integration demo, not a proposed Storyboard layout.

Persistence is in memory: **save** captures drawing JSON plus root Storyboard
metadata; **reopen** restores that snapshot. No drawing files are written.

## Browser validation

```sh
pnpm prototype:history --verify
```

This starts the server, drives real browser shortcuts/pointer gestures and the
public prototype commands, prints asserted outcomes, then closes the browser and
server. The assertions are experiment evidence, not a production test suite.

To exercise the bundled assets instead of the development server:

```sh
pnpm prototype:history --build
pnpm prototype:history --built --verify
```

## How the seam works

`patch-excalidraw.mjs` transforms the installed **0.18.1 development bundle** at
build time, with exact-match checks. It never modifies `node_modules`. The same
transforms apply in dependency prebundling and static builds. A patch hash selects
the temporary Vite cache, preventing stale transforms from being tested.

The prototype adds:

- A generic observed `documentData` slot, classified as standalone state.
- Semantic no-op comparison for that slot.
- Metadata/background changes that invalidate the global redo branch.
- Selection-only changes excluded from document undo entries.
- A pre-capture metadata transformation, used here to clean up deleted targets
  atomically with drawing deletion.
- History commands, status, clear notifications, and access to captured commits.
- A targeted delta-application repair for restoring optional element fields.

The host preserves root metadata explicitly during save/reopen. Original drawing
keyboard/toolbar actions continue using Excalidraw's existing history. It does not
maintain a second snapshot or action stack.

**These text transforms are not suitable as the production dependency patch.**
A release implementation needs source-level types/API contracts, complete
command provenance/acknowledgment, compound-operation semantics, and behavioral
coverage for the drawing tools/resources/settings we support.

## Native experiment

```sh
python3 packages/editor-host/prototypes/unified-history/submit-native.py
```

The helper snapshots current sources into a unique directory under
`/tmp/opencode`, overlays the throwaway Swift host **in that snapshot only**, then
submits it to the configured macOS queue. The installed application sources are
not replaced. Native harness files under `native/` are outside the real Xcode
source directories.

The native host has responder-chain Undo/Redo commands, cached menu status,
serialized asynchronous JS requests, an editable native text field, and a
document saved/dirty-state display. Focused DOM drafts use WebKit's text undo
manager; committed drawing/Storyboard commands use shared JS history.

The Mac experiments also exercise exact command counts, active-document routing,
and consecutive commands. The WKWebView key-equivalent override handles document
shortcuts only when that web view is the first responder; native field editors
retain their normal undo. The multi-window check uses stable accessibility IDs
and explicit native Window-menu activation to avoid clicks through an occluding
window.

The native document wrapper is intentionally minimal: no autosave, complete
save/revert integration, or asynchronous failure recovery. **Snapshot save**
checks semantic clean/dirty transitions, not the complete NSDocument save
lifecycle. The final release still needs those checks.

Results and remaining limitations are recorded in
[`docs/STORYBOARD_UNIFIED_UNDO_RESEARCH.md`](../../../../docs/STORYBOARD_UNIFIED_UNDO_RESEARCH.md).

## Verdict

**Feasibility passed for the exercised integration cases.** All 12 browser
scenario groups passed against both development and static builds. The final
combined macOS run passed **3/3 native checks**:

- Menu/keyboard chronology, exact request counts, menu availability, redo
  branching, and semantic saved/dirty transitions.
- Focused DOM/native draft text undo without changing document history.
- Active-document routing and consecutive commands across two windows.

Native job: `20261023T140003129942Z-5780af68`.

Use the result to design a typed source-level extension to Excalidraw's existing
history. The throwaway bundle transforms and minimal native wrapper are evidence
for that architecture, not a release implementation.
