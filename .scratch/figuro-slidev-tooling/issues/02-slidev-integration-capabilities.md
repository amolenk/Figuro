# Research Slidev integration capabilities

GitHub issue: [Research Slidev integration capabilities](https://github.com/amolenk/Figuro/issues/2)

Type: research
Status: resolved

## Question

Which currently supported Slidev extension and rendering mechanisms can a reusable integration use to load local `.excalidraw` files, render a drawing progressively by reveal step within one slide, respond to normal click/step navigation, and accept deck- or diagram-provided CSS? Establish relevant packaging, build-time, browser/runtime, and version constraints from primary sources. Report facts and links; do not choose the final authoring API.

## Answer

Slidev v53 offers reusable addons, Node-side Vite setup, Vue components, deck/slide CSS, and reactive click state. Excalidraw provides scene JSON, per-element `customData`, and SVG export. Neither defines presentation reveals or a stylesheet field, so the integration must handle file bundling, staged rendering, click updates, and CSS scope explicitly. Slidev's `v-click` directives are not compiled inside runtime `v-html` markup.

Research asset: [Slidev integration capabilities for Excalidraw](https://github.com/amolenk/Figuro/blob/research/slidev-integration-capabilities/research/slidev-integration-capabilities.md) on the `research/slidev-integration-capabilities` branch.
