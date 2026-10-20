# @figuro/slidev

Static Excalidraw diagrams for **Slidev 53.x**, rendered in the browser using
Excalidraw **0.18.1** and its public `exportToSvg` API. The addon is versioned
independently of the native Figuro app. This initial foundation renders ordinary
drawings; reveal timing and presentation stylesheets are subsequent work.

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
One component renders the whole drawing as one static diagram on the current
slide. Its original strokes, fills, text, and scene background are retained.
Fonts are served locally and included in built decks; SVG export also receives
the scene's `files` map. Rendering reads the source and never saves it.

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
single-slide navigation, unchanged source bytes, development error messages,
and path-specific build failures (including actual Linux permission denial).
The fixtures also exercise kebab-case component names, quoted Vue expressions,
and template-only wrapper components.

For a focused iteration after building the image:

```sh
docker run --rm --ipc=host figuro-slidev-tests pnpm test static.spec.ts
docker run --rm --ipc=host figuro-slidev-tests pnpm test errors.spec.ts
```

`pnpm test` at the repository root runs the Python runner tests and this full
browser suite. Native document acceptance remains available through `make test`
on macOS or the shared macOS runner described in `docs/UI_TEST_RUNNER.md`.
