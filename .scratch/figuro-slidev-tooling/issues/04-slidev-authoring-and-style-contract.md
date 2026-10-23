# Define the Slidev authoring and stylesheet contract

GitHub issue: [Define the Slidev authoring and stylesheet contract](https://github.com/amolenk/Figuro/issues/8)

Type: grilling
Assignee: OpenCode
Status: resolved
Blocked by: [Research Slidev integration capabilities](https://github.com/amolenk/Figuro/issues/2), [Define the Excalidraw presentation metadata contract](https://github.com/amolenk/Figuro/issues/7)
Depends on: [Research Slidev integration capabilities](02-slidev-integration-capabilities.md), [Define the Excalidraw presentation metadata contract](03-excalidraw-presentation-metadata-contract.md)

## Question

Given the Slidev capability findings and the chosen file metadata contract, how should a deck author include one `.excalidraw` file as one slide, advance its reveal steps through normal clicks, and select or provide a stylesheet? Decide the public authoring surface and how stylesheet rules interact with semantic roles and the drawing's original styles, while keeping presentation styling out of the source file.

## Answer

- A Slidev slide contains one registered `<FiguroDiagram>` component with a required `src` path and an optional `stylesheet` path, both resolved relative to the deck. One component renders one `.excalidraw` file as one slide; omitting `stylesheet` uses the drawing's original appearance.
- Step 0 is visible initially. Each normal Slidev click reveals all elements at the next distinct positive step in ascending order. Gaps in step numbers do not consume clicks; after the final reveal, normal Slidev navigation advances to the next slide.
- The stylesheet may contain general selectors scoped to the diagram, as well as semantic role selectors such as `[data-figuro-role="service"]`. General rules apply regardless of metadata, so they can style all diagram text without assigning roles. CSS declarations override only matching properties of the original appearance; unspecified properties retain their original styling. The normal CSS cascade (specificity and source order) resolves conflicts between stylesheet rules.
- Stylesheet effects are presentation-only and never modify the `.excalidraw` source file.
