# Storyboard: unified document undo research

Research date: 2026-10-23. Status: architecture investigation; no design decision recorded.

## Executive summary

- **The full requirement is plausible, but unavailable through the installed public API alone.** Excalidraw 0.18.1 has only `history.clear()`, no commit subscription or history status, and no observed document-metadata slot. This was confirmed in a running browser. [B1][I1]
- **The retained-history approach passed an integration prototype.** A version-pinned, throwaway extension supports document metadata, metadata-only entries, global redo branching, and atomic drawing/deletion cleanup while preserving drawing gestures. This validates the approach for the exercised cases, not a production patch. See the prototype results below. [B2]
- **Avoid a snapshot history built from `onChange` callbacks as the default.** A real drag produced 14 callbacks and 13 positions; Excalidraw undid it in one operation. Retaining its transaction boundaries is valuable. Newer unreleased upstream has `onIncrement`, but still lacks the complete integration. [B1][U1][U2]
- **The native menu facade passed a Mac prototype.** Menu clicks and standard shortcuts share the JS history authority; focused DOM/native text uses text undo. Cached validation, branching, and semantic saved/dirty transitions passed. Full disk save/autosave/revert still needs production integration. [B2][A1][A2][A5]
- **An existing metadata undo defect was reproduced:** absent `customData` is not restored when undoing the first annotation or redoing the last-field removal. An empty-object baseline worked. The prototype needs explicit optional-value and no-op semantics. [B1][I7]

## Finding and recommendation

**Investigate a narrow Excalidraw metadata/history extension first.** A generic, observed document-metadata slot, captured atomically with drawing changes by Excalidraw's existing history, plus public history commands, commit notifications, and status, is a credible route to the complete Storyboard requirement. It preserves Excalidraw's drawing transaction boundaries and delta application instead of rebuilding them in Figuro. The source already separates observed standalone state from element-related state, and current upstream has a merged increment API. These are useful extension points, although neither installed 0.18.1 nor inspected upstream implements the complete contract. This is a source-based architectural recommendation, conditional on a bounded patch and acceptable maintenance ownership. [I1][I2][I3][U1][U2][U3]

**A Figuro-owned chronological history remains the fallback, preferably fed by a supported/backported durable-increment seam.** It can cover document-level pauses and titles, but inferring drawing transactions from 0.18.1 `onChange` alone is a substantial integration problem. Snapshot storage does not solve that problem. Current upstream's `onIncrement` helps, but does not supply a complete external-history controller, operation reasons, binary-file changes, or metadata ownership. [I1][U1][U2][U4]

Simply upgrading to the latest stable package does not unlock this: the registry's `latest` is already 0.18.1. Current `master` has additional APIs, but is a different, unreleased code line with breaking API changes. Two separate, unsynchronized Storyboard/drawing stacks cannot meet the agreed chronology. [R1][R2][U5]; see the counterexample below.

## Follow-up: retained-history prototype

Source: [`packages/editor-host/prototypes/unified-history/`](../packages/editor-host/prototypes/unified-history/README.md). Run `pnpm prototype:history`; run the assertion-driven experiment with `pnpm prototype:history --verify`.

This mounts the real Excalidraw 0.18.1 component and transforms its development
bundle in memory during Vite build/prebundling. Installed package files and the
application's editor/native sources are not patched. Exact-match replacements
fail on unexpected source, and a transform hash isolates dependency caches. The
prototype has free-play controls, guided scenarios, and a full document/history
state display. Save/reopen uses in-memory serialized JSON, not a file on disk.

### What passed in Chromium

| Case | Outcome |
| --- | --- |
| Drawing → pause → movement → title | Four history entries undo and redo in exactly that order. Metadata-only entries stop normally. |
| No-op / view changes | Reassigning the same title creates no entry. Selection-only updates do not create document undo entries, including an explicitly captured selection. |
| Redo branching | Selection preserves redo. A new Storyboard edit after undo clears all redo. |
| Card reorder / reset status | Metadata-only reorder undoes/redoes correctly; clear/reset publishes cleared history status. |
| Compound deletion | Imperative deletion and Excalidraw's built-in Delete action remove targets in the same recorded entry. Undo restores the shape, Initial setting, and actions; an empty card remains. |
| Persistence / clean state | An empty titled card survives explicit JSON save/restore. Reopen clears history. Undo to the saved semantic document is clean, redo away is dirty, and vice versa when the save point is later in history. |
| Gesture / command routing | A 12-move real pointer drag remains one entry; a public prototype command reports busy mid-drag. Original browser undo shortcut and Excalidraw footer redo use the extended history. |
| Bound text / arrow bindings | Interleaving metadata with movement and replay retains label-container and arrow-target references. |
| Image recovery | Deletion undo/redo retains the referenced in-memory image resource. |
| Optional metadata | Targeted delta application forces element regeneration when restoring undefined fields. First-annotation undo and final-annotation removal redo pass. |

All experiment assertions passed in both the development harness and its static
production build; no uncaught browser page errors occurred. These are limited execution cases, not
complete regression coverage of Excalidraw's tools. [B2]

### What the experiment changed

1. Observe a generic JSON-compatible `documentData` slot as standalone app state.
2. Compare its semantic value for no-op detection.
3. Record persisted metadata/background edits and clear redo on them; omit
   selection-only entries from document history.
4. Add a synchronous pre-capture metadata transformation. The host removes
   deleted targets there, before the existing Store computes its element/state
   deltas. Carry the resulting metadata into committed editor state.
5. Expose minimal commands/status, capture subscriptions, and clear notification.
6. Force delta application for optional element properties.
7. Preserve root metadata explicitly in the host's JSON envelope.

The pre-capture transformation is necessary for deletion initiated by Excalidraw
itself. Cleanup in an ordinary post-change React callback would be too late for
atomic capture. The prototype demonstrates the seam; its live-state propagation
uses a render-time correction on internal drawing commits. A production design
should incorporate the transformed metadata into the editor's commit/micro-action
result, rather than depend on that corrective render.

### Native experiment status

An isolated source snapshot overlays a throwaway AppKit/WKWebView host and
submits only `UnifiedHistoryPrototypeTests` to the existing Mac queue. The real
application's native sources are not replaced. The harness implements standard
responder-chain Undo/Redo, cached validation, serial async JS commands, DOM/native
text focus handling, and a minimal semantic dirty-state display.

- Job `20261023T131536446712Z-3bfe1d88`: Xcode build succeeded and the web canvas
  appeared. The initial XCTest assertion read only the native label's accessibility
  `label`, although its displayed text is normally its `value`. It failed before
  undo commands were exercised. XCTest stalled during failure diagnostics; the
  queue's execution limit ended the job with `infrastructure-error`.
- Job `20261023T131823559785Z-f39eed21`: correction reads both accessibility
  value and label. Focused DOM/native text undo passed. Menu chronology correctly
  changed the document, but failed the exact native request-count assertion:
  after an Undo menu click, the next shortcut went directly through Excalidraw's
  browser handler rather than the native command facade.
- Job `20261023T132935653137Z-13b47552`: focused menu/chronology run with a
  five-minute execution limit, corrected window setup and assertion, no slow
  accessibility-tree collection on failure, and the current prototype patch.
  Reproduced the same key-equivalent routing issue.
- Job `20261023T133707246216Z-da17a567`: explicit WKWebView key-equivalent
  handling made menu/shortcut chronology pass, but intercepted undo while a
  native field editor was first responder. Native text undo failed.
- Job **`20261023T133917951371Z-addaaed7`**: key-equivalent override applies
  only when the WKWebView is the actual first responder. **2/2 native tests
  passed**, with no failures/warnings in the exported result. Menu click and
  shortcut requests had the expected exact counts, DOM/native draft undo
  preserved document history, disabled Redo followed branching, and in-memory
  snapshot clean/dirty transitions worked.
- Job `20261023T134046894921Z-f52c204f`: focused active-document/two-window
  routing check failed before command validation because it used a blank window
  accessibility label. Prototype windows now have stable accessibility IDs.
- Jobs `20261023T135511038899Z-163633ab` and
  `20261023T135725813806Z-87be4713`: identified windows correctly, but a coordinate
  click intended for the background window could hit the foreground window
  covering it. The test now activates the exact window using a native Window
  menu entry before testing commands; the focus helper reports key-window state.
- Job **`20261023T135903899264Z-09e05307`**: **1/1 focused multi-window test
  passed**. Undo affected only the active document; activating the other document
  and issuing consecutive Undo commands emptied its history in order without
  changing the first document's state.
- Job `20261023T140003129942Z-5780af68`: final combined three-test native run on
  the same snapshot: **3/3 passed**, zero failures/skips/warnings, exit code 0.
  Source snapshot:
  `0c9d99e88e00d9088c0849b7a2d3294a0e8ef3904814f65d33213f9a7794d167`.
  Results: `.ui-tests/jobs/20261023T140003129942Z-5780af68/results.json`.

The key-equivalent findings are important: a nil-target menu alone did not ensure
one acknowledged command path in WKWebView. Intercepting every view-tree key
equivalent was too broad; the tested override checks the native first responder
before handling document shortcuts, and then chooses DOM draft undo versus JS
document history. Native field editors keep their default responder behavior.
The window-routing test uses explicit native activation, rather than relying on
clicks through occluded windows. Runtime results are tied to the reported source
snapshot; build success and earlier failed harness attempts are not counted as
passing command checks.

The native wrapper disables autosave and uses an in-memory snapshot save;
complete NSDocument save/autosave/revert behavior remains outside this spike.

### Verdict and remaining work

**Proceed with a source-level retained-history integration.** The core
chronology/compound-edit and native menu/focus/window-routing feasibility gates
passed for the cases above. Avoid
building a Figuro drawing snapshot engine unless the source-level API/maintenance
requirements become unacceptable.

Before treating it as production-ready:

- Replace bundle text transforms with a typed, documented source patch or
  upstream contribution, and choose pinned dependency maintenance ownership.
- Define operation identities, provenance (edit/undo/redo/load), acknowledged
  committed revisions, labels, and busy/focus status. The current prototype's
  capture emitter fires before editor installation and is not that protocol.
- Suppress history for every view-only field while retaining appropriate editor
  selection repair. Inventory all persisted settings and resource operations.
- Specify text-draft commit grouping and disposal, same-drawing duplication and
  copy/paste remapping, and derived state for those compound operations.
- Validate Excalidraw text editing/IME,
  actual disk saves, autosave, revert, failed commands, and process reload.
- Measure document metadata history memory/diff cost for realistic Storyboards;
  the prototype uses whole-value metadata replacement and JSON comparison.

### Requirement under investigation

User-agreed input to this research:

- A **Storyboard** belongs to the document: **Initial**, followed by ordered **click cards**.
- Cards contain reveal, hide, and semantic style role changes targeting individual shapes. A card can have a title or be an independent pause with no shape changes.
- All persisted Storyboard edits and drawing edits participate in one chronological document undo/redo sequence.
- macOS has proper Undo/Redo menu items, routing, shortcuts, and enabled state.

The existing glossary defines presentation metadata and semantic style role; its older element-level **reveal step** is not a sufficient model for independent cards. The current user guide describes that older model, not the new agreed input above. [F1][F2]

Architecture implications, rather than existing APIs:

- A pause/title must remain when the scene is empty or its final shape is deleted.
- A compound edit, such as deleting a shape and cleaning up its card targets, must be reversible as one operation if cleanup is part of that action.
- Preview position, canvas selection, focus, zoom, and a text field's uncommitted draft need explicit treatment; they are not automatically persisted Storyboard edits.
- One authority must determine the next operation, redo branching, transaction identity, and whether a command completed.

## Scope, location, and evidence levels

Read `AGENTS.md`, its referenced domain/issue-tracker/label docs, `GLOSSARY.md`, the current user guide, editor host, native document, and bridge. No existing research-note naming convention was found among repository Markdown files. This file uses the descriptive uppercase filenames already present in `docs/`. The domain instructions reserve glossary/ADRs for domain documentation and resolved decisions; the issue-tracker instructions place specs in GitHub Issues. This research note is neither an ADR nor a published spec. [F1][F2][F3]

Evidence labels used throughout:

| Level | Meaning |
| --- | --- |
| Installed source | Inspected installed package declarations and development bundle for **0.18.1**. Confirms exposed shapes and implementation, not executed behavior. |
| Upstream source | Inspected first-party source pinned to **`1d4dc2c0e6e476911d0760e9c3cf3694f2d43384`**, `master` returned by GitHub on the research date; commit dated 2026-10-21. [U0] |
| Documentation/release | First-party Excalidraw docs, GitHub releases/PR metadata, npm registry metadata, and Apple docs. |
| Runtime-proven | Isolated Chromium experiments against installed 0.18.1 production and development bundles, React 19.2.8, and the real Excalidraw component. See section 5. [B1] |
| macOS scope | The follow-up harness passed actual menu/shortcut, DOM/native draft text, cached validation, semantic clean/dirty, and window-routing checks. Complete disk save/autosave/revert, Excalidraw text/IME, process reload, and asynchronous failures remain unverified. Apple documentation establishes contracts beyond the cases exercised. |
| Proposal/inference | Suggested architecture, implications, estimates, and validation cases. Not claims of an available API. |

## 1. Installed 0.18.1: what is actually available

The workspace pins `@excalidraw/excalidraw` to 0.18.1, and the installed package identifies itself as that version. [F4][I0]

| Surface | Installed-source finding | Consequence |
| --- | --- | --- |
| `api.history` | Only `clear`; no public undo, redo, stack status, history subscription, or external entry registration. [I1] | A native menu bridge cannot obtain a complete history controller from this object. |
| `api.onChange` / prop `onChange` | Callback is `(elements, appState, files)`; no reason, transaction ID, committed/draft distinction, or undo/redo direction. [I1][I5] | State differences alone cannot establish user-level transaction boundaries or replay provenance. |
| `updateScene({captureUpdate})` | Capture policy affects observed element/state changes. Store snapshots observe a fixed subset of app state and detect versioned element changes. [I3][E1] | An arbitrary root key or unknown app-state property does not become undoable merely by specifying `IMMEDIATELY`. |
| `registerAction` | Exposed in types and the API object; the action manager assigns `actions[action.name] = action`. [I1][I5] | Late replacement of `undo`/`redo` routed browser shortcuts and replacement footer buttons in the experiment. It is undocumented in the public API guide, and does not expose the original actions or their history. [B1] |
| Action registration timing | The API callback happens before constructor registration of the built-in history actions. [I5] | Registering replacements directly inside that callback can be overwritten; initialization timing is part of the experiment. |
| Internal `History` | Has undo/redo arrays and `onHistoryChangedEmitter`; built-in actions capture this object and use the store snapshot. [I2] | These are not properties of the public `history` object. Access through React internals, bundle internals, or an internal `App` callback is a private integration. |
| Drawing action guards | Built-in undo/redo refuse during text editing, creation, resize/drag/selection, or flowchart creation. [I2] | External commands must preserve or deliberately replace these guards, not just swap snapshots during an active gesture. |
| Replay behavior | History applies inverse entries, can skip entries with no visible change, and pushes inverse entries to the other stack. New element changes clear redo; app-state-only changes do not. [I2] | A global coordinator must understand more than one-call/one-array-pop behavior. |

The public guide still documents only `history.clear()`, the same three-argument `onChange`, pointer subscriptions, and capture policies. It explicitly warns that unobserved app-state changes never reach history regardless of `captureUpdate`. Absence from this guide is a documentation finding; it is not proof that all upstream APIs are absent. [E1]

### Metadata and persistence are separate gaps

- Installed `serializeAsJSON` constructs a fixed root object: `type`, `version`, `source`, `elements`, `appState`, `files`. Installed `restore` returns only elements, restored app state, and files. Figuro uses these directly today. An added root `figuro` field would therefore need explicit preservation in Figuro or upstream changes to this pipeline. [I4][F5]
- Unknown app-state keys are not restored by the installed defaults-based restore loop and are not exported by its storage allowlist. The observed-state selector also has no external metadata field. [I3][I4]
- Element `customData` is retained by restore and participates in the general element diff when the version nonce changes; it is not among the fields stripped from history diffs. Figuro currently uses `newElementWith` and `IMMEDIATELY` for presentation edits. Runtime annotation/clear undo worked with an empty-object baseline, but failed when the inverse needed to restore `undefined`; see section 5. [I3][I4][I7][F5][B1]
- **Inference:** storing the only copy of all cards on an ordinary shape cannot satisfy independent pauses in an empty document, survival after deletion, or copying only that shape into another document. Replicating cards across shapes introduces another consistency problem. A hidden/sentinel shape is also an element subject to scene actions/export/restore; it needs a separate lifecycle contract and is not a supported document-metadata facility. [I2][I4]

The installed package's wildcard subpath export supplies **types only**, whereas its package entry point supplies JavaScript. The presence of internal `.d.ts` files does not make `History`/`Store` classes supported runtime imports. [I0]

### Existing Figuro bridge cannot establish history chronology

Figuro fingerprints document state, tracks interactions to avoid marking load normalization as a user edit, and debounces serialized `sceneChanged` messages by 250 ms. Native `Document` replaces its cached JSON and calls `.changeDone` for each unequal received string. Its menu deliberately omits Undo/Redo. [F5][F6][F7]

**Inference:** this is a persistence/dirty bridge, not a transaction journal. Several drawing/card commits could fit in one debounce interval; an undo can produce the same message type as an edit. Reusing these messages as history entries would merge or misclassify operations. An acknowledged document commit should update the native save cache promptly; save immediately after an edit or undo must not depend on the debounce timer firing. [F5][F6]

Another boundary to settle: Figuro's signature includes grid settings and `name`. Excalidraw's observed standalone history is `name` and background color, not grid settings; its export configuration persists grid settings but excludes `name`. Thus persistence, history observation, and dirty-state projection are not identical today. A claim of **full document undo** needs an explicit persisted-field inventory, not just shape/card coverage. [F5][I3][I4][U1][U6]

## 2. Newer/upstream APIs: useful, but not a complete solution

### Release and publication status

On 2026-10-23, `npm view @excalidraw/excalidraw dist-tags --json` returned `latest: 0.18.1` and `next: 0.18.0-17d8904`. GitHub's most recent release was 0.18.1, published 2026-04-21 as a security backport to the 0.18.x line; 0.18.0's release introduced the multiplayer Store/history work and replaced `commitToHistory` with `captureUpdate`. The exact revision behind a moving npm `next` tag was not inspected here. Do not equate that tag with the pinned `master` below. [R1][R2]

### Merged current-source seams

| Seam | What upstream actually provides | Remaining gap |
| --- | --- | --- |
| `onIncrement` prop and API subscription | Merged PR #9450 (2025-05-06); current public types expose durable/ephemeral increments. A durable increment has `change` and `delta`; ephemeral has `change`. `StoreDelta` includes an ID plus elements and observed app-state deltas. [U1][U2][U4] | No external document metadata, operation label/reason, or stable original-history-entry ID for a complete chronological controller. A delta ID is not an entire history protocol. |
| Durable/ephemeral distinction | Store captures emit durable increments; `NEVER` and `EVENTUALLY` emit ephemeral increments. `StoreChange` contains changed elements and observed app state, explicitly not binary files. [U2] | Ephemeral does not mean view-only: it can be a pending drag, initialization, remote update, or replay through `NEVER`. Files need separate resource/persistence handling. |
| Undo/redo increment emission | Current `History.perform` schedules durable `HistoryDelta`s; `History.record` excludes these so replay is not recorded again internally. [U3] | A consumer cannot blindly append every durable increment. Identifying history deltas by private class/prototype is not a documented operation-reason contract. |
| `applyDeltas` | Public type maps to an implementation that squashes deltas and returns `[nextElementsMap, nextAppState, visibleChange]`. It does **not** itself install that state. [U1][U7] | Not a drop-in `undo()`, history-entry registration API, or completed-transaction acknowledgment. Caller still must install/apply consistently. |
| `onStateChange` | Selective app-state subscription; lifecycle `onEvent` map contains mount/initialize/unmount. [U1][U5] | History arrays are not app state. These APIs do not expose can-undo/can-redo or transaction events. |
| History/actions | Public `history` still only has `clear`; `registerAction` remains. Current action manager still replaces by name. [U1][U8] | No supported history provider, execute-by-name API, or stack/status subscription. |
| `setPlugins` | Internal App plugin object is specifically diagram-to-code generation. [U7] | Not a general external-history extension point. |

The official next-version documentation tracking issue #9458 remains open and lists `onIncrement`, `applyDeltas`, and map access as documentation work. The ordinary API page is therefore insufficient as the sole source for current capabilities. [U9][E1]

Upstream's micro-action machinery captures immutable changes before batching, distinguishing them from a pending gesture, then processes multiple scheduled actions FIFO. Reusing that machinery is materially narrower than Figuro inferring transactions from pointer events and timers. This is an architectural inference from its implementation, not a promise that it meets Storyboard's compound-edit semantics unchanged. [U2][U7]

### Proposals that must not be treated as available hooks

- PR **#5983**, proposing external `executeAction` and undo/redo access, is **open and unmerged** at the research date. [P1]
- PR **#11310**, proposing begin/commit/rollback transaction grouping, is **closed and unmerged**. [P2]
- PR **#11545**, proposing a more extensive editor transaction system, is **closed and unmerged**. Its author lists unresolved consolidated increment emission and unspecified mid-transaction remote-update behavior. These are proposal limitations, not defects proven in the current implementation. [P3]
- Issue **#7925** discussed emitter exposure and a future pluggable store; #9450 partially fulfilled emitter exposure, not arbitrary external-history ownership. [P4][U4]

No maintained, documented full-history integration or durable document-metadata hook was found in the inspected API/types/source. This is a bounded finding about the inspected revision and listed proposals, not a claim that no other branch or future release can supply one.

## 3. Architecture options for the complete requirement

The following contracts are proposals, not existing Excalidraw methods.

### A. Extend observed document metadata inside Excalidraw history

**Candidate narrow seam:** an optional, namespaced, JSON-compatible `documentData`/document `customData` slot, stored independently of elements and captured by the same Store/history transaction as drawing edits. Figuro supplies its versioned Storyboard value; Excalidraw does not need to know what a click card means.

A possible minimal implementation strategy is an observed **standalone app-state slot**, with Figuro explicitly preserving it as root metadata when loading/saving. This reuses generic app-state delta inversion rather than adding an entirely new delta family. It is smaller than a general plugin/history framework, but is still a patch: the observed selector, defaults/restore, state types, standalone/element projection helpers, capture scheduling, replay, and reset behavior must agree. Metadata updates must be immutable, or explicitly versioned/compared. [I3][I4][U1][U2]

Required additions and semantic changes:

1. **Durable ownership and round-trip.** Metadata survives an empty scene, shape deletion, undo/redo, save/reopen/revert, and reset to a new document. Either Excalidraw officially restores/serializes the slot or Figuro's envelope does so explicitly. A history-only slot is not a persistence feature. [I4][U6]
2. **Atomic capture.** A card edit with associated element changes contributes one entry; metadata-only changes create an entry without manufacturing a shape delta. Beginning/finishing a compound edit must distinguish a pending drawing gesture from a later card action. Reuse micro-actions where sufficient; add only the grouping seam that the actual cases require. [U2][U7]
3. **Undo stopping rule.** A pause/title/card-order change is meaningful in the sidebar even if canvas pixels are unchanged. It must stop the history loop. The current loop skips non-visible deltas; standalone changes are considered separately from element visibility. An explicit external-document-change flag or the standalone slot can supply that meaning. [I2][U3][U10]
4. **Redo invalidation.** A new durable Storyboard edit after undo invalidates the global redo branch. Current history intentionally preserves redo for app-state-only edits, including standalone state. Adding a slot without changing this rule is insufficient. Distinguish persisted document edits from selection/UI changes. [I2][U3][U11]
5. **Commands and status.** Public undo/redo entry points reuse built-in guards and return completion/no-op/busy information; public status exposes can-undo/can-redo and can-execute-now, with labels if available. Route keyboard, footer, command palette, and native commands through that same controller. Status must refresh on initialization, record, replay, clear, branch truncation, and interaction transitions. `History.clear()` currently only truncates arrays without emitting its status event. [I2][U3][U8]
6. **Committed-document notification.** A stable operation kind (`edit`, `undo`, `redo`, `load/reset`), transaction/entry identity, monotonically increasing state revision, and changed persisted payload. Existing `onChange`/`onIncrement` signatures do not supply this complete information. Commit/status order needs a defined contract. [I1][U1][U2][U3]
7. **Full persisted-state coverage.** Include persisted grid/background settings and any editable resource changes. Binary files are currently outside Store deltas; image bytes must remain available while either stack references them. [I3][U2][U6]

**Why this is worth evaluating first:** Excalidraw continues deciding where drawing actions commit and applying drawing inverses, including binding/layout repair and version handling. Figuro owns Storyboard schema/UI and the native adapter, rather than a parallel implementation of canvas history. Existing upstream history tests cover bindings, remote changes, empty stacks, and gesture interleaving, demonstrating the behavior being retained. They are source evidence of coverage, not test results from this session. [U3][U11]

**Cost/risks:** medium-to-high implementation effort with a constrained API, plus upstream discussion or ongoing pinned-patch maintenance. Extending only observed state and exposing two commands is not sufficient once redo, sidebar-only changes, compound edits, dirty state, and status are included. Upstream acceptance and release timing are unknown; closed transaction proposals establish no commitment to this design. A local patch to 0.18.1 avoids broad upgrading but would require backporting/adapting seams because its Store differs from `master`. [I3][U2][P2][P3]

**Persistence choice:** a Figuro envelope around ordinary `.excalidraw` content can keep metadata ownership independent of Excalidraw export APIs. That still cannot promise preservation when an unmodified external Excalidraw editor loads/resaves the root field: both inspected serializers construct their own fixed root objects. A first-party document-metadata feature would address compatibility more directly, at greater upstream scope. [I4][U6]

### B. Add a generic external-payload entry/history participant

Alternative narrower-than-full-rewrite contribution: allow a history entry to contain an Excalidraw drawing inverse plus an opaque host-state before/after payload, or a namespaced JSON delta. Metadata-only entries use the same chronological stack. Figuro serializes the payload independently.

This avoids teaching Excalidraw's persistence format about Storyboard. It needs an atomic host-state apply callback, meaningful-change reporting, replay suppression, entry labels/IDs, redo invalidation, reset semantics, and combined drawing/metadata grouping. It cannot be merely `onUndo`/`onRedo` callbacks after an unknown internal pop: current history may traverse multiple entries in one command. [I2][U3]

**Tradeoff:** likely medium-to-high effort; more flexible but a larger abstraction/API design than the observed-slot approach. Arbitrary asynchronous callbacks would make atomic undo failure substantially harder. An immutable JSON payload updated synchronously in the JS document model is a more bounded proposal than arbitrary host callbacks across WebKit. This option should be compared with A during upstream seam discussion, rather than automatically requesting an entire plugin system.

### C. Figuro-owned delta journal using durable drawing commits

One JS document controller owns the chronological journal. Drawing entries are captured from durable increments; Storyboard entries come from Figuro commands; compound entries contain both. The Excalidraw history must be disabled/replaced as an authority, and every document undo entry point must use Figuro's controller. Merely clearing internal history sometimes leaves independent capture/status machinery alive. [I2][U1][U8]

Current upstream's `onIncrement` and `applyDeltas` make this route more credible than 0.18.1's plain `onChange`. They still require supported packaging, completed-commit semantics, replay provenance, and a supported way to delegate internal undo requests/status. Backporting the increment seam or exposing the existing 0.18.1 capture emitter can be narrower than upgrading all of Excalidraw. [I1][I3][U1][U2][U4][U7]

Pitfalls/effort:

- **Capture boundaries:** append durable user commits, not every render, and distinguish selection-only increments, normalization, remote updates, and replay. Current upstream emits history replays as durable increments too. [U2][U3]
- **Inverse fidelity:** generic JSON patching of shapes does not automatically reproduce Excalidraw binding/layout repair, ordering, or new element versions on replay. `applyDeltas` helps reuse its behavior but returns state to install; deletion recovery and current-state reconciliation need tests. [U3][U7][U10][U11]
- **Compound actions:** deleting/duplicating shapes may change Storyboard references. A post-`onChange` cleanup can become a second entry or run again during undo. The controller needs an explicit compound operation/derived-state policy. Upstream `onDuplicate` supplies ID maps for that particular operation, not a general document transaction API. [U1][U5]
- **Resources:** retain image data independently of persisted live-element serialization; do not garbage-collect a file referenced by undo/redo. Increment payloads omit files. [E1][U2][U6]
- **Branching, limits, labels, clear/revert, save points:** Figuro becomes responsible for these global semantics. A scene-delta ID alone is not a saved-state identity. [U2][A1][A4]

**Estimate:** high effort for a product-quality controller plus adapter; potentially less history-storage work than snapshots, but only after the capture/replay seam is stable. Maintain API-level behavioral tests per pinned Excalidraw update. The browser experiments establish routing and current limitations, not an implementation duration; a seam prototype is still needed.

### D. Figuro-owned snapshots using 0.18.1 `onChange`

One history entry retains immutable before/after **document** snapshots: live/deleted elements as required for replay, selected persisted app-state keys, binary-resource references, Storyboard data, and optional view restoration context. Replay installs the result through `updateScene` with no internal capture and suppresses recording until installation is acknowledged. [I1][I3][E1]; these controller behaviors are proposals.

The storage format is straightforward; **transaction discovery remains the expensive part**:

| Pitfall | Why it matters |
| --- | --- |
| One `onChange` is not one action | It fires for rendering/view state and gesture intermediates. The host currently uses interaction tracking and debouncing for persistence; a debounce cannot distinguish two rapid commands from one long drag. [F5][U12] |
| DOM event heuristics are incomplete | Pointer boundaries alone miss keyboard repeats, text/IME edits, property-slider drags, paste/drop with asynchronous images, library operations, and compound generated geometry. Excalidraw already guards/coordinates such workflows internally. [I2][U2][U11] |
| Baseline normalization | Load/restore and later layout/font normalization can change scene fields without a user action; Figuro already rebases until a detected real edit. History must not create bogus entries or silently overwrite the original save baseline. [F5] |
| Mutability and version churn | Snapshots must detach nested mutable state. Installed snapshots deep-copy changed elements, and history excludes version counters from its inverse semantics; upstream replay intentionally creates new element versions. Reinstalling stale version counters can be ignored by version-based observation or conflict with reconciliation. [I3][U2][U3] |
| Serializable file is not runtime snapshot | Installed local serialization strips deleted content and unreferenced image files. `AppState` also has transient editor objects. Saving JSON is not a lossless capture of all runtime state needed to undo deletion/text/binding operations. [I4][E1] |
| Replay completion | `updateScene` applies state through editor render/update paths; reading immediately can be premature. Releasing a recording-suppression flag on a timer rather than an operation acknowledgment can record replay or drop a later edit. [F5][U1][U7] |
| Memory/performance | Inference: naive storage is roughly O(history length × document size), and cloning/serialization can repeat O(scene size) work. Share immutable resources/elements and impose measured retention limits; avoid embedding the same image data in every snapshot. |
| View continuity | Restoring all app state steals focus/zoom or revives an in-progress editor; restoring only saved bytes can leave selection/editor state pointing at removed shapes. Decide what view context accompanies document undo. [I2][I3][A1] |

**Estimate:** very high integration/validation effort on unchanged 0.18.1 if exact drawing granularity is required. Snapshots are attractive for correctness of the owned Storyboard model, but are not evidence that replacing drawing history is simpler than a narrow upstream seam. A commit hook makes snapshots substantially safer; storage choice should follow authority and transaction design.

### E. Two unsynchronized stacks

Counterexample (inference from the requirement):

1. Draw shape A (`drawing D1`).
2. Insert an empty pause card (`Storyboard S1`).
3. Move shape A (`drawing D2`).
4. Undo repeatedly.

Required order is **D2 → S1 → D1**. Choosing a stack based on focused panel can undo S1 before D2 or skip it; always undoing drawing first yields D2 → D1 → S1. After undoing D2, a new card edit must also discard redo D2. Independent branch rules cannot guarantee this, and dependent shape/card cleanup makes the problem worse. Apple explicitly cautions against partial document undo because it breaks document/history consistency. [A1][A4]

A synchronized global ledger dispatching into two engines could work in principle, but is itself a unified history coordinator. It requires exact internal entry IDs, commit boundaries, replay results, multi-entry skipping, and coordinated branch truncation. Those seams are not available in the installed public API; timestamps or DOM button enabled state do not establish them. [I1][I2]

### Comparison

Relative effort below is architectural judgment, not measured implementation time. Every viable option still requires the native work in section 4.

| Option | Independent cards | Drawing granularity | Single chronology / atomic compound edits | Main cost | Assessment |
| --- | --- | --- | --- | --- | --- |
| Upgrade using documented stable APIs only | External persistence possible | Internal history retained | Missing metadata/controller seams | Low upgrade benefit; requirement still unmet | Insufficient. [R1][E1] |
| A: observed metadata + history/commit/status seam | Yes | Retains editor boundaries | Yes, if redo/meaningful-change/grouping fixes included | Medium–high patch/API work + maintenance | First candidate to evaluate. |
| B: opaque payload participant in same history | Yes | Retains editor boundaries | Yes, with synchronous atomic participation | Medium–high API design | Compare when metadata persistence should stay entirely in Figuro. |
| C: Figuro delta journal + durable capture seam | Yes | Can reuse captured boundaries | Figuro owns both | High journal/replay integration | Strong fallback if Excalidraw will expose commits but not external metadata. |
| D: Figuro snapshots + unchanged 0.18.1 callbacks | Yes | Must infer/rebuild | Possible, with extensive interaction policy | Very high granularity/replay validation | Last resort for the full requirement; not the default recommendation. |
| E: independent unsynchronized stacks | Yes in isolation | Internal drawing only | No | Small initial work; semantic failure | Reject for the agreed requirement. |

## 4. macOS integration is required whichever history wins

### Active document and first-responder routing

Apple expects Undo/Redo at the top of Edit with **⌘Z** and **⇧⌘Z**. Nil-target menu actions are resolved through the responder chain; AppKit undo-manager lookup follows that chain, with per-document managers supporting the focal document. [A0][A1][A2][A3]

Proposed integration:

- Route commands to the key document's editor/controller, not a process-global JS API reference. Capture document/session identity when issuing a request so a later completion cannot affect another window.
- Prefer responder-aware handling. Native text controls should retain their normal text editing undo, rather than a hardwired app-delegate target undoing the canvas behind a save sheet/search field.
- Web content has a second focus boundary: `WKWebView` is the native responder while a canvas, Excalidraw text textarea, or Storyboard title input is the DOM editor. Native responder routing alone cannot determine which document/text operation JS should handle.
- Define the distinction between **uncommitted draft text** and **committed document text edits**. Once a title/shape text edit is committed, it must appear in full document chronology. While actively editing, a text-local undo session can be appropriate, but it must not duplicate document entries or leave committed title changes outside global history.

Apple documents default native text-field undo while the field is first responder. Installed Excalidraw deliberately bails out of its shortcut handler for writable DOM targets, leaving ordinary input handling alone; its drawing-history action separately blocks while editing a text element. Neither source establishes how native Undo menu commands will behave for these DOM controls in Figuro's WKWebView. **This is macOS unverified.** [A1][I2][I6]

Test title fields, role fields, Excalidraw text, native text fields/sheets, IME composition, blur/commit, then canvas undo. Do not use synthetic browser key events as evidence that native text undo or responder routing works.

### Status sync and menu validation

AppKit automatic menu validation locates an action target and calls `validateMenuItem` or `validateUserInterfaceItem` synchronously. `validateMenuItem` can also update a title. Manually setting `isEnabled` while automatic enabling remains active can be overridden by AppKit. [A2]

Proposed bridge status: `{documentSession, stateRevision, canUndo, canRedo, canExecuteNow, undoLabel?, redoLabel?, editingContext, pendingRequest?}`. Push it from the authoritative history, including initial empty status and clear/reset, and cache it natively. Menu validation reads that cache; it does not wait for a JS query. Revalidate on focus/window changes as well as history messages. Older session/revision messages must not overwrite newer state. Command execution must recheck state because cached validation can be stale. [A2][A5]; protocol details are proposals.

Treat **stack nonempty** and **command currently executable** separately. Excalidraw's internal guards can make a nonempty history temporarily unavailable during a gesture/text edit. An unsupported DOM query against the footer's `disabled` attribute cannot provide all of this lifecycle/status information. [I2][U8]

### Async JavaScript versus native `UndoManager`

Apple's `registerUndo(withTarget:handler:)` takes a synchronous, Void-returning closure. Redo registration normally happens **during** undo execution. `WKWebView.callAsyncJavaScript` executes asynchronously and waits for Promise resolution before completing; it can fail. Launching JS from a native undo closure and registering the inverse only in its later completion is therefore not equivalent to the documented UndoManager pattern. [A3][A5][A6]

Viable architectures to assess:

1. **JS authoritative history; native commands/status facade.** Native menu actions submit serialized, identified requests to JS. JS applies/acknowledges undo and sends committed document bytes plus new status. Native dirty-state tracking is explicit. This avoids a second native document stack, but gives up automatic NSDocument undo-notification bookkeeping and needs full save-point integration. [A1][A4][A7]
2. **Native authoritative model/history.** Capture completed document transactions natively; native undo changes cached document state synchronously and registers its inverse synchronously, then renders that state in JS. This aligns better with UndoManager, but native needs a sufficiently authoritative document representation and must coordinate any pending JS edit. Excalidraw must not continue changing its own cursor independently. [F6][A1][A3]
3. **Mirrored native token stack over JS history.** Possible only with a proved one-to-one committed-entry protocol, synchronous inverse registration while UndoManager is undoing, serialized JS execution, and a defined failure/recovery policy. Without this, native thinks undo completed before JS does, and a failed/ignored JS command leaves the stacks apart. Current `onChange`/history API cannot support that protocol alone. [I1][A3][A5][A6]

Research preference: keep history operations in the JS document controller when retaining Excalidraw history (A/B), and expose native actions/status with explicit NSDocument bookkeeping. Use native UndoManager as document authority only if native model ownership is a deliberate broader choice. Do not block the main thread waiting for WebKit to make an asynchronous call look synchronous. These are architecture judgments, not validated implementations.

Rapid repeats, undo while a gesture is pending, command failure, web-process reload, close/revert during a request, and switching documents between issue/acknowledgment need a serialized command policy. Acknowledgment must mean the editor and native save cache reached the reported revision, not merely that an async function returned before editor state committed. [F5][F6][U1][A5]

### NSDocument dirty state, save points, and autosave

Apple's document architecture normally watches its UndoManager to maintain edited state automatically; manual `updateChangeCount` is for integrations not using that default support. `changeDone`, `changeUndone`, and `changeRedone` represent different transitions. Save/revert clear appropriate change state. Apple provides save-operation change-count tokens so edits made during an asynchronous save remain represented; `isDocumentEdited` and `hasUnautosavedChanges` are distinct properties. [A1][A4][A7][A8]

Current Figuro reports every changed serialized scene as `.changeDone`. **Inference:** after adding unified undo, continuing that behavior would count undo as another forward edit and cannot establish clean-at-saved-revision behavior. Conversely, adding native UndoManager registrations while still manually counting the same changes risks double counting. [F6][A1][A7]

Required design and validation:

- Choose automatic native UndoManager bookkeeping or explicit history-aware bookkeeping; have one authoritative persisted-state revision and saved-state identity.
- Count document transactions, not per-render updates, selection changes, or debounce batches. Storyboard-only title/pause/order edits are genuine persisted changes.
- Confirm edit → undo to loaded/saved content becomes clean; undo away from saved content becomes dirty; redo back becomes clean. A new branch at the same numeric cursor must not impersonate the old saved state: retain revision/branch identity or compare the canonical persisted projection.
- Track the **revision actually written**, only after successful save. During autosave, later edits/undos must remain unsaved; failed save must not move the save point. Preserve NSDocument's change-count-token contract if overriding asynchronous saving. [A8]
- Flush/publish acknowledged committed bytes before explicit Save, close-save, and autosave snapshots. The present 250 ms JS timer can otherwise leave the native cache behind a recent command. [F5][F6]
- Revert/load starts a new document session, resets both history/status and pending operations, and suppresses undo registration for reading. Apple explicitly advises disabling undo registration while reading. [A4]
- Preserve the original clean baseline through load-only normalization and preview actions. Drawing undo version churn and canonical-byte differences require a defined semantic persisted comparison; compare Storyboard too. [F5][U3]

## 5. Evidence needed before a design decision

### Runtime evidence

An isolated React harness mounted the **real installed Excalidraw 0.18.1**, without importing Figuro's editor component or modifying application files. It exposed the public API, recorded `onChange`, and invoked real browser Ctrl+Z / Ctrl+Shift+Z events and pointer drags using Playwright 1.58.2. Chromium was headless on Linux; this is not a macOS test. The production and development bundles both reproduced the metadata and routing findings; the final production pass additionally verified the app-state-only redo-branch behavior. All final assertions passed, including assertions reproducing the limitations below; no uncaught browser page errors occurred. [B1]

| Experiment | Status / result |
| --- | --- |
| API/history surface | Actual `history` keys: **`["clear"]`**. No `onIncrement`, undo/redo methods, or history-status subscription on the returned API. |
| Late action replacement | After initialization, registered actions named `undo`/`redo` handled Ctrl+Z, Ctrl+Shift+Z, and a replacement footer button. The scene did not undergo built-in undo. A direct JS host-command callback reached the same replacement handler; this does not exercise a native menu or WebKit bridge. |
| Early registration | Registering inside `excalidrawAPI` was overwritten: the replacement handler received no command and built-in undo deleted the inserted rectangle. Confirms the constructor timing constraint. [I5] |
| Footer UI/status | The replacement `PanelComponent` replaced the default undo button. Its availability was entirely the replacement's responsibility; registration supplied no automatic external history status. |
| Gesture safety | An unguarded replacement **did execute while `selectedElementsAreBeingDragged` was true**. Built-in history guards are not automatically inherited. |
| Focused input | A focused sibling title input did not dispatch drawing undo. This does not prove native text undo, Excalidraw text-session handling, or global keyboard routing. |
| Command palette | **Not runtime-validated.** Setting `openDialog` to `commandPalette` did not mount it in this embedding. Installed source resolves undo/redo through `actionManager.actions`; that remains source evidence only. [I5] |
| First annotation / last-field removal | **Defect reproduced:** undo of a first `customData` annotation left it present even though the history entry was consumed. Forward removal using `newElementWith(..., {customData: undefined}, true)` succeeded; undo restored the annotation, but redo left it present instead of removing it. |
| Explicit empty-object baseline | Starting with `customData: {}`, setting an annotation, undoing to `{}`, and redoing worked. Clearing back to `{}` also worked in both directions. This is an observed workaround, not an application fix made here. |
| Same-value nested metadata | Two updates with equal JSON but newly allocated nested metadata created a redundant undo stop. One undo left the effective value unchanged; a second restored the preceding state. Host semantic no-op detection is necessary; Figuro's current known-field editor already does that. [F5] |
| Persistence | `serializeAsJSON` emitted exactly `type`, `version`, `source`, `elements`, `appState`, `files`. `restore` returned only `elements`, `appState`, `files`; injected root metadata and unknown `appState.customData` were absent. Element annotation survived. |
| Unknown live app-state metadata | `updateScene` could place unknown metadata in live state, but it did not create an independent undo entry or survive the normal restore/serialization path. The next undo instead consumed a preceding element-metadata entry. |
| Drag granularity | A rectangle moved from **(200, 200) to (260, 224)** over 12 pointer moves: **14 `onChange` callbacks, 13 distinct positions**. One built-in undo restored (200, 200); one redo restored the endpoint. |
| History clear notification | With no pending render, `api.history.clear()` produced **zero `onChange` callbacks**. Menu status cannot be inferred from `onChange` alone. |
| App-state-only redo branch | Undo an annotation, then change observed `viewBackgroundColor`: redo remained enabled and reapplied the old annotation. This matches the source's intentional app-state-only redo preservation. A document-metadata extension must deliberately invalidate redo for new persisted Storyboard edits. [I2] |

A successful action-replacement experiment proves a routing escape hatch for this exact build. It does not by itself prove drawing commit capture, native menu status, text routing, saved-state management, or future compatibility.

#### Reproduced optional-value issue

The relevant installed implementation is `newElementWith`: it ignores `undefined` values when deciding whether anything changed. History's `ElementsChange.applyDelta` invokes it without `force`. Thus an inverse whose only replacement is `customData: undefined` can return the original element; the command still moves its history entry. Figuro forces the **forward** removal, but that does not force the later history inverse. Current pinned upstream retains the same undefined check in `newElementWith`; a fix for this path is not established simply by upgrading. [I3][I7][F5][U13][B1]

A generic document slot should use an explicit empty/reset value and compare semantic contents before recording. If per-element annotations continue using absent properties, repair/test the inverse application too. Empty-object normalization must preserve unrelated custom data and keep disk omission separate from runtime state. These are recommendations, not changes applied in this session.

#### Recommended first spike

Limit the first prototype to a rectangle and a document-level array of empty titled cards—no full Storyboard UI. Extend the existing store/history with an immutable host-metadata slot and minimal public commands/status. Prove this sequence before broadening:

1. Draw rectangle → add pause → move rectangle → rename pause.
2. Undo and redo in exact chronological order, including the metadata-only stops.
3. Undo a drawing change, then edit a card: all redo is discarded. Selection alone preserves redo.
4. Delete the rectangle and remove its target references as one operation; undo restores both. A card without targets survives.
5. Empty scene → add/title a pause → save/reopen preserves it.
6. Clear/load/revert emits empty history status; source normalization creates no user entries.
7. Route macOS menu and keyboard to these same commands, then verify focused text and clean/dirty transitions on the Mac runner.

**Go/no-go:** proceed with the retained-history approach only if these contracts can be exposed in a bounded, version-pinned change without reconstructing drawing gesture boundaries. If not, evaluate the durable-increment-fed Figuro journal. This is the next validation step; the patch itself was not implemented or timed during research.

### Narrow seam proof obligations (future work, not implemented here)

Before choosing A/B over C, establish these end-to-end behaviors:

1. Empty scene: insert pause, rename, reorder, undo/redo; save/reopen retains the cards.
2. Draw A → pause → move A: global undo/redo follows the exact chronology.
3. Undo drawing → edit a card: drawing redo is invalidated, while selection/preview does not discard it.
4. Shape deletion/duplicate and Storyboard target policy: compound changes undo atomically; deleting all shapes does not delete independent cards.
5. Sidebar-only change stops one undo command rather than being skipped to an earlier drawing edit.
6. Drag/text/slider and async image operations have intentional boundaries; normalization and replay create no extra entries.
7. Native and canvas commands agree on revision/status and never apply twice; reset/clear emits correct empty status.
8. Full persisted settings and image data recover after undo; resources remain available through save and branch changes.

For macOS, additionally validate two documents/tabs, native and DOM text/IME focus, menu labels/enabled state before/after focus changes, rapid shortcuts, save/autosave/revert, undo across the save point, failed JS commands, and web-process reload. Browser-only experiments cannot settle these points. [A0][A1][A2][A5][A8]

### Decision gate

The evidence currently supports **a bounded upstream/patch seam investigation, not immediate adoption of a custom snapshot engine**. Prefer A if an observed generic metadata slot plus redo/meaningful-change/commit/status contracts stays contained and maintainable. Prefer B if Figuro-only persistence is important and a same-stack payload contract is simpler. If neither is acceptable but durable commits and undo delegation can be exposed, choose C. Choose D only with an explicit willingness to own drawing transaction semantics and their validation.

The user already settled deletion cleanup/restoration and duplication/same-drawing versus cross-drawing paste behavior; their atomic implementation and ID remapping still need validation. Remaining interaction details include title-edit grouping, draft-text behavior, persisted grid/settings coverage, and history retention across save/revert. Upstream willingness, released API availability, and native runtime behavior are unresolved. This note records recommendations and evidence; it does not choose a dependency patch or history architecture.

## Sources

All external sources were accessed on 2026-10-23. Source links use immutable upstream revisions where applicable. Installed-source line ranges refer to the package actually installed in this workspace; links below are relative to this note. The initial research added this note; follow-up added the clearly marked prototype beside the editor host and a task-runner command. Temporary original experiments and native source overlays are outside the repository.

### Figuro and installed package

- **[F1]** [Glossary](../GLOSSARY.md); [domain documentation instructions](agents/domain.md).
- **[F2]** [Current user guide](SPEC.md), especially lines 23–25, 49–57, 84–110.
- **[F3]** [AGENTS.md](../AGENTS.md); [issue tracker](agents/issue-tracker.md); [triage labels](agents/triage-labels.md). Markdown filename inventory inspected with the file glob tool.
- **[F4]** [Editor host package](../packages/editor-host/package.json), dependency line 13.
- **[F5]** [Editor host App.tsx](../packages/editor-host/src/App.tsx): signature/serialization 181–212; interaction/load normalization 227–324; dirty persistence debounce 242–257; versioned metadata edits 134–173 and 508–526; load/reset 587–610; editable inputs 765–824. Working-tree source inspected, not assumed committed.
- **[F6]** [Native Document.swift](../apps/macos/Sources/Figuro/Document.swift), cached contents/save/read 20–68, change handling 118–123; [EditorViewController.swift](../apps/macos/Sources/Figuro/EditorViewController.swift), async bridge 113–148.
- **[F7]** [Native MainMenu.swift](../apps/macos/Sources/Figuro/MainMenu.swift), omitted undo/redo explanation 3–8 and Edit menu 91–102.
- **[I0]** [Installed package.json](../packages/editor-host/node_modules/@excalidraw/excalidraw/package.json), version/exports lines 1–21.
- **[I1]** [Installed types.d.ts](../packages/editor-host/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts), imperative API lines 603–635. Reproducible tagged source: [0.18.1 types.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/types.ts).
- **[I2]** [Installed dev index.js](../packages/editor-host/node_modules/@excalidraw/excalidraw/dist/dev/index.js), history 13583–13710; built-in history actions 13728–13820. [Tagged history.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/history.ts); [tagged actionHistory.tsx](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/actions/actionHistory.tsx).
- **[I3]** [Installed dev chunk-4FTI6OG3.js](../packages/editor-host/node_modules/@excalidraw/excalidraw/dist/dev/chunk-4FTI6OG3.js), element delta calculation 16217–16276, exclusions 16617–16619; observed selector/store/snapshot 16708–16966. [Tagged store.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/store.ts); [tagged change.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/change.ts).
- **[I4]** Same installed chunk: storage allowlist/filter 598 and 647–659; serializer/file filtering 17920–17940; `customData` restore 20484–20485; app-state/root restore 20793–20850; live-element filtering/export clearing 24606–24614. [Tagged data/json.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/data/json.ts); [tagged data/restore.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/data/restore.ts); [tagged appState.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/appState.ts).
- **[I5]** Installed dev index: action-manager registration 13906–13910; exposed API and later built-in registration 29419–29471; `onChange` emission 30538. [Tagged actions/manager.tsx](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/actions/manager.tsx); [tagged components/App.tsx](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/components/App.tsx).
- **[I6]** [Tagged components/App.tsx](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/components/App.tsx#L4238-L4256), writable DOM target shortcut guard.
- **[I7]** Installed `chunk-4FTI6OG3.js`, `newElementWith` lines 22848–22869 and `ElementsChange.applyDelta` lines 16394–16428. [Tagged mutateElement.ts](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/element/mutateElement.ts).
- **[B1]** Session browser experiment. Temporary harness: `/tmp/opencode/figuro-undo-research/{index.html,main.jsx,run.mjs,server.mjs}`. Commands from the workspace: `node /tmp/opencode/figuro-undo-research/server.mjs` (production package bundle) and `EXCALIDRAW_MODE=dev node /tmp/opencode/figuro-undo-research/server.mjs` (development bundle). Runner opens port 5197 on loopback, asserts each reported behavior, prints JSON evidence, closes Chromium and the Vite server. Node 22.22.1, Playwright 1.58.2/Chromium build 1208, React/React DOM 19.2.8; no StrictMode in the isolated harness. The results and reproduction details are retained in this note; temporary files are not a committed regression suite.
- **[B2]** [Retained-history prototype source and instructions](../packages/editor-host/prototypes/unified-history/README.md); [bundle transforms](../packages/editor-host/prototypes/unified-history/patch-excalidraw.mjs); [host](../packages/editor-host/prototypes/unified-history/main.jsx); [experiment assertions](../packages/editor-host/prototypes/unified-history/verify.mjs); [native snapshot submitter](../packages/editor-host/prototypes/unified-history/submit-native.py). Same installed Excalidraw/React/Playwright versions as B1, on 2026-10-23. macOS queue request/status/logs under `.ui-tests/jobs/<job-id>/` are ignored session artifacts.

### Excalidraw first-party docs, releases, and current source

- **[E1]** [Public imperative API guide](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api), history, captureUpdate, onChange, addFiles/getFiles.
- **[R1]** [npm package metadata](https://registry.npmjs.org/@excalidraw%2Fexcalidraw). Live metadata queried with `npm view @excalidraw/excalidraw dist-tags --json`; relevant returned values recorded in section 2. No `next` package was installed or tested.
- **[R2]** [0.18.1 release](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.1); [0.18.0 release](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.0). Latest release metadata checked via GitHub API, including `published_at`.
- **[U0]** [Pinned upstream commit](https://github.com/excalidraw/excalidraw/commit/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384), returned by `gh api repos/excalidraw/excalidraw/commits/master`.
- **[U1]** [Current types.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/types.ts): observed state, props, `SceneData`, lifecycle event map, imperative API (lines 1384–1496).
- **[U2]** [Current element/store.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/store.ts): micro-actions, commit/emission, `StoreChange`, increments, `StoreDelta`, snapshot/version tracking, fixed observed-state selector.
- **[U3]** [Current history.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/history.ts): `HistoryDelta.applyTo`, `record`, `clear`, `perform`.
- **[U4]** [Merged increment API PR #9450](https://github.com/excalidraw/excalidraw/pull/9450); GitHub API confirms `merged: true`, `merged_at: 2025-05-06T17:23:02Z`. Author summary used for API intent; implemented behavior checked against [U1]–[U3].
- **[U5]** [Current CHANGELOG.md](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/CHANGELOG.md), Unreleased API/provider/lifecycle, onDuplicate, viewport and export changes.
- **[U6]** [Current data/json.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/data/json.ts); [current appState.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/appState.ts), persistence allowlist, especially grid settings and name.
- **[U7]** [Current components/App.tsx](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/components/App.tsx), plugin scope 2850–2858, reset 3541–3546, increment subscriptions 3847–3855, updateScene 4974–5018, applyDeltas 5049–5068.
- **[U8]** [Current actionHistory.tsx](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/actions/actionHistory.tsx); [current actions/manager.tsx](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/actions/manager.tsx).
- **[U9]** [Open next-version docs issue #9458](https://github.com/excalidraw/excalidraw/issues/9458).
- **[U10]** [Current element/delta.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/delta.ts), standalone projection 931–962; meaningful/visible element comparison 1784–1874; binding and layout application elsewhere in the same module.
- **[U11]** [Current history tests](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/tests/history.test.tsx), app-state redo preservation 285/339, element branch invalidation 419, bindings, stack status, multiplayer/gesture cases.
- **[U12]** [Current event callback tests](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/tests/packages/events.test.tsx), `onChange` on render. Test source inspected; not executed here.
- **[U13]** [Current mutateElement.ts](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/mutateElement.ts), `newElementWith` undefined-value detection. Inspected source, not an upstream runtime reproduction.
- **[P1]** [Open/unmerged executeAction PR #5983](https://github.com/excalidraw/excalidraw/pull/5983).
- **[P2]** [Closed/unmerged transaction PR #11310](https://github.com/excalidraw/excalidraw/pull/11310).
- **[P3]** [Closed/unmerged editor transaction PR #11545](https://github.com/excalidraw/excalidraw/pull/11545), author-stated scope and known limitations. Closure is not evidence of a specific maintainer rejection rationale.
- **[P4]** [Store-emitter issue #7925](https://github.com/excalidraw/excalidraw/issues/7925).

### Apple first-party documentation

- **[A0]** [Human Interface Guidelines: Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo), fetched through its [first-party Markdown view](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo.md): Edit menu placement, standard shortcuts, predictable results, grouping, visible feedback.
- **[A1]** [Using Undo in AppKit-Based Applications](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/UndoArchitecture/Articles/AppKitUndo.html): responder lookup, text undo, per-document manager, automatic edited-state notifications, complete model-layer undo.
- **[A2]** [Enabling Menu Items](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MenuList/Articles/EnablingMenuItems.html): automatic validation, nil target, synchronous Boolean validation, manual-state caveat.
- **[A3]** [Registering Undo Operations](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/UndoArchitecture/Articles/RegisteringUndo.html); [Performing Undo and Redo](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/UndoArchitecture/Articles/PerformingUndo.html): inverse registration during undo, grouping and redo.
- **[A4]** [Document-Based App Programming Guide: Core App Behaviors](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/StandardBehaviors/StandardBehaviors.html): reading, full/partial undo, change counts, autosave, asynchronous snapshots.
- **[A5]** [WKWebView.callAsyncJavaScript](https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:in:completionhandler:)), current symbol content retrieved via [Apple JSON](https://developer.apple.com/tutorials/data/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:in:completionhandler:).json): async execution, Promise resolution, failure completion.
- **[A6]** [UndoManager.registerUndo(withTarget:handler:)](https://developer.apple.com/documentation/foundation/undomanager/registerundo(withtarget:handler:)), current declaration retrieved via [Apple JSON](https://developer.apple.com/tutorials/data/documentation/foundation/undomanager/registerundo(withtarget:handler:).json): synchronous closure signature, main-actor execution.
- **[A7]** [NSDocument.updateChangeCount](https://developer.apple.com/documentation/appkit/nsdocument/updatechangecount(_:)); [NSDocument.ChangeType](https://developer.apple.com/documentation/appkit/nsdocument/changetype), current contents retrieved through Apple JSON endpoints: automatic/default versus explicit counting, distinct done/undone/redone/autosaved/cleared values.
- **[A8]** [NSDocument.changeCountToken(for:)](https://developer.apple.com/documentation/appkit/nsdocument/changecounttoken(for:)); [updateChangeCount(withToken:for:)](https://developer.apple.com/documentation/appkit/nsdocument/updatechangecount(withtoken:for:)), current contents retrieved through Apple JSON endpoints: captured save state, edits during save, updated edited/unautosaved properties.

[F1]: ../GLOSSARY.md
[F2]: SPEC.md
[F3]: ../AGENTS.md
[F4]: ../packages/editor-host/package.json
[F5]: ../packages/editor-host/src/App.tsx
[F6]: ../apps/macos/Sources/Figuro/Document.swift
[F7]: ../apps/macos/Sources/Figuro/MainMenu.swift
[I0]: ../packages/editor-host/node_modules/@excalidraw/excalidraw/package.json
[I1]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/types.ts
[I2]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/history.ts
[I3]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/store.ts
[I4]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/data/json.ts
[I5]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/components/App.tsx
[I6]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/components/App.tsx#L4238-L4256
[I7]: https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/element/mutateElement.ts
[B1]: #runtime-evidence
[B2]: #follow-up-retained-history-prototype
[E1]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api
[R1]: https://registry.npmjs.org/@excalidraw%2Fexcalidraw
[R2]: https://github.com/excalidraw/excalidraw/releases/tag/v0.18.1
[U0]: https://github.com/excalidraw/excalidraw/commit/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384
[U1]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/types.ts
[U2]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/store.ts
[U3]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/history.ts
[U4]: https://github.com/excalidraw/excalidraw/pull/9450
[U5]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/CHANGELOG.md
[U6]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/data/json.ts
[U7]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/components/App.tsx
[U8]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/actions/actionHistory.tsx
[U9]: https://github.com/excalidraw/excalidraw/issues/9458
[U10]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/delta.ts
[U11]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/tests/history.test.tsx
[U12]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/excalidraw/tests/packages/events.test.tsx
[U13]: https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/packages/element/src/mutateElement.ts
[P1]: https://github.com/excalidraw/excalidraw/pull/5983
[P2]: https://github.com/excalidraw/excalidraw/pull/11310
[P3]: https://github.com/excalidraw/excalidraw/pull/11545
[P4]: https://github.com/excalidraw/excalidraw/issues/7925
[A0]: https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
[A1]: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/UndoArchitecture/Articles/AppKitUndo.html
[A2]: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MenuList/Articles/EnablingMenuItems.html
[A3]: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/UndoArchitecture/Articles/RegisteringUndo.html
[A4]: https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/StandardBehaviors/StandardBehaviors.html
[A5]: https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:in:completionhandler:)
[A6]: https://developer.apple.com/documentation/foundation/undomanager/registerundo(withtarget:handler:)
[A7]: https://developer.apple.com/documentation/appkit/nsdocument/updatechangecount(_:)
[A8]: https://developer.apple.com/documentation/appkit/nsdocument/changecounttoken(for:)
