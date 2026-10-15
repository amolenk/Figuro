# Slidev integration capabilities for Excalidraw

**Context:** [Research Slidev integration capabilities](../.scratch/figuro-slidev-tooling/issues/02-slidev-integration-capabilities.md) asks which supported mechanisms are available; these findings do not choose the public authoring API.

**Fact check:** 2026-10-15. Slidev documentation identifies v53.0.0. The linked Slidev source is pinned to v53.0.0 where applicable.

## Findings

### Reusable extensions

- Slidev supports one theme and multiple addons. Addons may provide Vue components and styles and configure Vite. Deck headmatter can list addons; local addon paths are supported. Published Vue/TypeScript sources may be compiled by Slidev when used. [Theme and addons](https://sli.dev/guide/theme-addon) · [Writing addons](https://sli.dev/guide/write-addon)
- Addon packages conventionally use the `slidev-addon-` prefix and `slidev-addon` / `slidev` package keywords. Addons can declare a minimum Slidev version using `engines.slidev`; the v53 resolver checks the range. [Addon guide](https://sli.dev/guide/write-addon) · [Version requirement](https://sli.dev/guide/write-theme#require-slidev-version) · [v53 resolver](https://github.com/slidevjs/slidev/blob/v53.0.0/packages/slidev/node/integrations/addons.ts)

### Files and rendering

- An `.excalidraw` scene is JSON with `type`, `version`, `source`, `elements`, `appState`, and `files`; image elements may depend on `files`. Excalidraw documents per-element `customData` as an application-specific extension point. Its schema does not define reveal-step or stylesheet semantics. [JSON schema](https://docs.excalidraw.com/docs/codebase/json-schema#excalidraw-files) · [Custom element data](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props#storing-custom-data-on-excalidraw-elements)
- Slidev inherits Vite asset handling. Vite can import an asset as a string using `?raw`; files under a deck's `public/` directory are served from the root in development and copied to the production output. Slidev warns that relative paths passed as component props are not statically analyzed and can break after build; it recommends public assets referenced by root-absolute path for that case. [Vite assets](https://vite.dev/guide/assets.html#importing-asset-as-string) · [Vite public directory](https://vite.dev/guide/assets.html#the-public-directory) · [Slidev asset handling](https://sli.dev/guide/faq#assets-handling)
- Slidev supports Node-side Vite setup, including `setup/vite-plugins.ts`; the setup receives slide data. In v53 such setups are loaded from resolved roots, including addon roots. This is a build/dev-time hook, separate from browser code. [Vite configuration](https://sli.dev/custom/config-vite) · [v53 setup loader](https://github.com/slidevjs/slidev/blob/v53.0.0/packages/slidev/node/setups/vite-plugins.ts) · [v53 addon roots](https://github.com/slidevjs/slidev/blob/v53.0.0/packages/slidev/node/options.ts)
- Excalidraw's `exportToSvg` utility accepts an elements array, app state, and files, and returns an SVG. An integration can therefore pass selected scene elements to the export function; it must supply reveal-step interpretation itself. [SVG export utility](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export#exporttosvg)

### Clicks and CSS

- Slidev provides in-slide click steps through `v-click`, `v-after`, and related directives. Components can read reactive `$clicks` (the current slide's click count); `$nav.next()` advances to the next step. Per-slide `clicks` frontmatter can set the total number of steps. [Click animation](https://sli.dev/guide/animations#click-animation) · [Global context](https://sli.dev/guide/global-context#clicks) · [Frontmatter](https://sli.dev/custom/#frontmatter)
- Runtime markup inserted through Vue `v-html` is plain HTML: Vue does not compile template syntax or directives inside it. Writing `v-click` into generated SVG/HTML does not create a Slidev click target; staged output must be represented in compiled Vue content or updated by a component reacting to `$clicks`. [Vue `v-html`](https://vuejs.org/api/built-in-directives.html#v-html)
- Deck CSS can live in `style.css` or `styles/index.{css,js,ts}` and is injected at the app root. Markdown `<style>` blocks are scoped to the slide. Addons can provide styles, but Slidev advises against wildcard global addon styles because they can conflict with themes and other addons. [Directory structure](https://sli.dev/custom/directory-structure#style) · [Slide-scoped styles](https://sli.dev/features/slide-scope-style) · [Addon guidance](https://sli.dev/guide/write-addon#capability)
- Excalidraw documents CSS-variable overrides for its editor wrapper. The `.excalidraw` file schema has no stylesheet field, and Slidev does not automatically read CSS from such a file. Any diagram-specific stylesheet behavior and scope must be provided by the integration. [Excalidraw style customization](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/customizing-styles) · [JSON schema](https://docs.excalidraw.com/docs/codebase/json-schema#excalidraw-files)

### Runtime and distribution constraints

- Slidev renders in the browser; `slidev build` produces a static SPA. Local diagram data required at runtime must be bundled or copied into published assets. Browser click interaction is retained in the SPA. PDF/PNG/PPTX export uses browser rendering; click steps are not separate pages by default, while `--with-clicks` exports click steps. [Hosting/building](https://sli.dev/guide/hosting) · [Exporting](https://sli.dev/guide/exporting#export-clicks-steps)
- Slidev v53.0.0's CLI package requires Node.js `>=22.12.0`. [v53 package metadata](https://github.com/slidevjs/slidev/blob/v53.0.0/packages/slidev/package.json)
- The Excalidraw package is a React component, requires React dependencies, and does not support server-side rendering. Its SVG export utility is a separate integration surface. Excalidraw fonts are downloaded from a CDN by default; self-hosting requires copying fonts and configuring `window.EXCALIDRAW_ASSET_PATH`. [Installation](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation) · [Integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration) · [SVG export](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export#exporttosvg)

## Summary

Slidev offers supported addon, Vite, Vue, CSS, and click-navigation mechanisms. Excalidraw offers JSON scenes, per-element `customData`, and SVG export. Neither system defines the requested reveal metadata or a stylesheet field in `.excalidraw`; the integration must provide those behaviors. No single authoring API or package channel is implied by these facts.
