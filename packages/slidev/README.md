# @figuro/slidev

Excalidraw diagrams with click-driven reveals for **Slidev 53.x**, rendered in the browser using
Excalidraw **0.18.1** and its public `exportToSvg` API. The addon is versioned
independently of the native Figuro app. Reveal timing is supported for simple
shapes, unbound text, bound text with its container, embedded images, framed
children, and grouped members.

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

## Bound text

Bound text and its container reveal together at the later of their two steps.
For example, a shape at step 2 with a label at step 9 stays hidden until step 9;
step 2 consumes no click unless other content reveals then. Omitted steps and
step 0 count as initially visible when resolving the pair's timing.

Each export retains the complete pair, preserving Excalidraw's text placement,
rotation, multiline labels, and arrow label masks. Revealed content keeps its
original opacity, and all states keep the same scene frame and scale.
Role metadata on either member warns and receives no semantic role hook;
general stylesheet selectors can still match the exported output.
The source drawing and its assigned steps are never rewritten.

## Frames and clipping

Frame outlines, names, and child clipping are retained in every reveal state.
Frames (including magic frames and empty frames) are present from step 0, even
when assigned a positive reveal step; frame-only steps consume no clicks.
Children follow their own reveal steps, with bound text still revealing atomically
with its container. Frame structure and the whole drawing's scale stay stable
through forward and backward navigation.

One drawing file remains one Slidev slide. Use deck Markdown to define slide
boundaries rather than Excalidraw frames.

Role metadata on frames or their children warns and receives no role hook,
retaining original appearance unless a general stylesheet selector matches.
Frame and child opacity from the source drawing are preserved; presentation
reveal timing never hides a frame or changes the source file.

## Grouped content

Excalidraw's `groupIds` are editor relationships only. Members, including nested
groups, follow their own reveal steps; group membership adds no group-level
timing or role inheritance. Unannotated members and step-0 members stay visible
initially while other members reveal at their assigned steps. Bound text still
reveals atomically with its container, and frame structure stays present.

The complete scene is retained in each export, preserving member appearance,
rotation, original opacity, links, and a common frame and scale. Role metadata on
grouped members warns and receives no semantic role hook, retaining original
appearance unless a general stylesheet selector matches their rendered output.
Revealing or styling grouped content never rewrites the source drawing.

## Embedded images

Images render from the drawing's `files` records, preserving their appearance,
crop, flip, and rotation. Each image follows its own reveal step, including when
multiple images share the same file record. Image bytes are embedded in the
exported SVG and work offline in built decks.

Every nondeleted image must have a `fileId` matching a file record with the same
`id`, an image `mimeType`, and a non-empty matching `dataURL`. Missing or incomplete
required records fail `slidev build` and show a development error naming the
drawing, image element, and file. Deleted images and unused file records do not
require resource data.

General CSS can target exported image output. Excalidraw 0.18.1 reuses image
definitions through SVG `use` nodes; for example, this affects every displayed
image without changing its source bytes:

```css
svg use {
  filter: grayscale(1);
}
```

Image semantic roles warn and receive no role hook; their original appearance
is retained unless a general selector matches the exported output. Reveal timing
continues to work when an image has an unsupported role.

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
Image fixtures check painted pixels for embedded resources, crop, flip, rotation,
independent reveal timing, general CSS, and image-role fallback. Build fixtures
reject missing required records and incomplete image data.
Bound-text fixtures verify initial and matching steps, both differing-step orders,
shape and arrow labels, forward/backward navigation, and stable composition.
Painted output is compared with a direct Excalidraw export to check original
appearance and role fallback, including rotated and multiline text.
Frame fixtures check named, empty, and magic frames, live-deck screenshots and
isolated SVG pixels for child clipping and
opacity across reveal states, frame-only steps, shared steps inside and outside
frames, stable structure and scale, single-slide navigation, source immutability,
and role warnings with original appearance.
Group fixtures check independent steps within nested and separate groups,
initial members, shared steps, numeric gaps, forward/backward navigation, stable
framing, links, unchanged source bytes, and role warnings without inheritance.
Painted output is compared with direct Excalidraw export and unstyled reveal
states to verify native appearance and role fallback.
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
docker run --rm --ipc=host figuro-slidev-tests pnpm test images.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test image-errors.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test bound-text.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test frames.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test groups.spec.ts
```

`pnpm test` at the repository root runs the Python runner tests and this full
browser suite. Native document acceptance remains available through `make test`
on macOS or the shared macOS runner described in `docs/UI_TEST_RUNNER.md`.
