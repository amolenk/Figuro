# @figuro/slidev

Excalidraw diagrams with click-driven reveals for **Slidev 53.x**, rendered in the browser using
Excalidraw **0.18.1** and its public `exportToSvg` API. The addon is versioned
independently of the native Figuro app. Reveal timing is supported for simple
shapes and unbound text.

## Use in a deck

The package is available in this workspace; registry publication is a separate
release step. Add a local dependency from your deck:

```sh
pnpm add @figuro/slidev@file:../Figuro/packages/slidev
```

Register the addon in the headmatter of `slides.md`:

```md
---
addons:
  - '@figuro/slidev'
layout: center
---

<FiguroDiagram src="./drawings/architecture.excalidraw" />
```

`src` is a required, literal local `.excalidraw` path relative to the directory
containing the deck's entry Markdown file. Assets do not need to be in `public/`.
One component renders the whole drawing as one diagram on the current
slide. Its original strokes, fills, text, and scene background are retained.
Fonts are served locally and included in built decks; SVG export also receives
the scene's `files` map. Rendering reads the source and never saves it.

## Presentation stylesheets

Select an optional stylesheet with a literal path relative to the deck's entry
Markdown directory:

```md
<FiguroDiagram
  src="./drawings/architecture.excalidraw"
  stylesheet="./styles/presentation.css"
/>
```

The CSS styles the exported inline SVG in every reveal state. For example:

```css
svg text {
  fill: #663399;
}

svg [stroke="#123456"] {
  stroke: #2255aa;
}
```

General selectors match the rendered SVG. Only matching properties are changed;
unspecified strokes, fills, text properties, and background retain their original
appearance. Normal CSS specificity, source order, and `!important` resolve
conflicts. Styled diagrams render inline SVG inside an open shadow root, so
selected stylesheets do not style neighboring diagrams or slide content. Vite
processes CSS imports and relative asset URLs for development and built decks.
Font-face declarations are registered at document level for browser compatibility;
use distinct family names when different diagrams define different fonts.
Omit `stylesheet` to keep the drawing's original appearance.
Rendering and styling never write to the source drawing.

Missing or unreadable selected stylesheets produce a development error overlay
and fail `slidev build` with both the selected and resolved filesystem paths.
Stylesheet files are watched during development and their CSS is included in the
built deck; they do not need to be in `public/`.

## Semantic style roles

Assign a role in Figuro's Presentation inspector, stored as
`customData.figuro: { "v": 1, "role": "service" }`, then target it in the
selected presentation stylesheet:

```css
[data-figuro-role="service"] [fill]:not([fill="none"]) {
  fill: #dd8800;
}

[data-figuro-role="note"] text {
  fill: #663399;
}
```

One role hook is present on each rendered element group. Use descendant selectors
as above to override stroke, fill, or font properties on painted SVG nodes; use
the group selector for element-wide effects such as opacity or filters. Roles
are case-sensitive, author-defined strings;
there is no built-in role palette. Absent, invalid, or unmatched roles keep the
original appearance unless a general stylesheet rule matches them.

Supported standalone elements are rectangles, diamonds, ellipses, lines, arrows,
freehand paths, and unbound text, including multiline text and linked elements.
Hooks remain associated with the same source element in every reveal state.
The adapter uses temporary links on export copies to identify output, then
restores original links or removes temporary wrappers before displaying the SVG.
It does not rely on SVG node order or change the source drawing.

Role hooks are omitted for images, bound text and its container, frames and their
children, and grouped elements. These cases warn and retain their original role
appearance; general CSS can still match their rendered output. If an export
cannot reliably associate supported content, it warns and omits that role hook.

## Reveal steps

Use Figuro's Presentation inspector to assign reveal steps, stored on each
element as `customData.figuro`:

```json
{ "v": 1, "step": 2 }
```

Unannotated elements, omitted steps, and step 0 are visible initially. Each normal
forward navigation action reveals the next distinct positive step in ascending
order. Elements at the same step appear together; steps 2 and 9 require two
clicks, with no extra clicks for the gaps. Backward navigation hides the most
recent reveal, and forward navigation after the final reveal advances the deck.
Deleted elements do not add reveal steps.

## Metadata warnings and fallbacks

The addon accepts unannotated drawings and `customData.figuro` objects with
`v: 1`, an optional non-negative safe-integer `step`, and an optional string
`role`. Unknown fields in v1 objects are ignored.

Malformed metadata produces a warning naming the drawing and affected element.
All metadata on that element is ignored: it stays visible from step 0 with its
original Excalidraw appearance unless a general stylesheet rule matches it.
Other valid elements continue to reveal and style normally.

A well-formed unsupported version (a positive integer other than 1) produces
one warning per drawing file, including when reused on another slide. Its fields
are treated opaquely. All presentation metadata for that drawing is
ignored, and the whole drawing is visible immediately in its original appearance
unless general stylesheet rules match it.
Malformed version declarations use the element-level fallback.

These fallbacks never save or rewrite the source drawing. An explicitly selected
stylesheet must still load successfully.

## Rendering and compatibility

Every reveal state keeps the complete drawing's SVG frame, position, and scale.
Click targets are registered while SVGs are still loading, so navigation does
not depend on export timing.

The addon validates selected files while Vite loads the deck. Missing or
unreadable files, malformed JSON, and invalid drawing data produce a development
error overlay and fail `slidev build` with both the selected path and its resolved
filesystem path. Changes to drawing files are watched during development.

The compatibility boundary is declared in `engines.slidev` and the CLI peer
range (`>=53.0.0 <54.0.0`); Excalidraw is pinned exactly to `0.18.1`.
The acceptance fixture pins Slidev `53.0.0`. It explicitly installs
`markdown-it@14.1.0` to satisfy the parser peer used by that version of Slidev.
Vue and React peers supply the runtime needed by Slidev and Excalidraw.

## Verify

From the repository root:

```sh
pnpm typecheck
pnpm --filter @figuro/slidev test:docker
```

The Docker command installs from the lockfile into a Linux Playwright image and
runs Chromium against a development fixture, a production build hosted under
`/fixture/`, a separate deck installed from the packed addon without addon dev
dependencies, and an invalid-input fixture. It checks visible text, original
colors/background, locally embedded fonts without external network access,
single-slide navigation, shared reveal steps, numeric gaps, forward/backward
navigation, stable framing, navigation during export, unchanged source bytes, development error messages,
stylesheet application and isolation, CSS cascade behavior, and path-specific
build failures (including actual Linux permission denial). Role fixtures verify
shape and text styles, unmatched-role fallback, original links, mixed scenes,
and forward/backward reveal states.
Metadata fixtures check element-level and file-wide warnings, original appearance
and opt-in general CSS, valid metadata alongside malformed values, immediate
visibility, retained links, file reuse, and unchanged source bytes.
The fixtures also exercise kebab-case component names, quoted Vue expressions,
and template-only wrapper components.

For a focused iteration after building the image:

```sh
docker run --rm --ipc=host figuro-slidev-tests pnpm test static.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test reveals.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test errors.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test stylesheets.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test stylesheet-errors.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test roles.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test metadata.spec.ts
```

`pnpm test` at the repository root runs the Python runner tests and this full
browser suite. Native document acceptance remains available through `make test`
on macOS or the shared macOS runner described in `docs/UI_TEST_RUNNER.md`.
