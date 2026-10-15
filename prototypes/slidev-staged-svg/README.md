# Staged SVG prototype (throwaway)

This disposable Slidev 53 / Excalidraw 0.18.1 project probes whether separate SVG exports can support the agreed reveal and stylesheet behavior. It is not production integration code.

From this directory, run `npm install` once and then `npm run dev`. Open the first slide and use ordinary clicks (or the right arrow) to reveal steps 1 and 3. The static Slidev `v-switch` slots reserve the two reveal clicks before the async exports finish, avoiding late click-target registration. The second slide checks that navigation continues after the last reveal.

The fixture deliberately leaves a gap between positive steps, gives two elements the same step, and adds the first reveal above and left of the initial content. Each state exports the complete scene and hides unrevealed SVG nodes, keeping each SVG's intrinsic frame and element coordinates stable. The component fetches the source read-only and shows a digest check plus each export's frame in the slide.
