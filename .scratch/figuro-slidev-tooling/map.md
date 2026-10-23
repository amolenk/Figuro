# Figuro + Slidev Excalidraw tooling

Label: wayfinder:map

Canonical GitHub map: [Figuro + Slidev Excalidraw tooling](https://github.com/amolenk/Figuro/issues/1)

## Destination

An implementation-ready specification for extending Figuro, the native macOS Excalidraw editor, and adding a reusable Slidev integration for the same `.excalidraw` files. The specification will settle the authoring, file, rendering, styling, compatibility, and handoff contracts needed before implementation.

## Notes

- Domain: authoring and presenting Excalidraw drawings with Figuro and Slidev.
- Extend the existing Figuro app; Slidev is the presentation target for this effort. Reveal.js support and other presentation frameworks are out of scope.
- `.excalidraw` files are the shared source of truth, with presentation metadata stored in the files. One file represents one slide. Unannotated elements and step 0 are visible initially; later reveal steps advance by click, and multiple elements may share a step.
- Optional semantic style roles are part of the direction. A Slidev-provided stylesheet affects presentation rendering only and does not mutate the source drawing.
- The current `docs/SPEC.md` is a design starting point, not proof of Excalidraw or Slidev behavior. Reconcile its Reveal.js assumptions with this map before using its remaining proposals.
- HITL decisions and prototypes must be resolved with the user. Research tickets establish external facts before dependent choices are made.

## Decisions so far

<!-- Closed child tickets only; each decision's detail belongs in its ticket. -->

- [Research Excalidraw metadata round-tripping](https://github.com/amolenk/Figuro/issues/5) ([workspace note](issues/01-excalidraw-metadata-roundtrip.md)): The pinned Excalidraw version preserves JSON-serializable `customData` in standard JSON scene round-trips, with version and export caveats.
- [Research Slidev integration capabilities](https://github.com/amolenk/Figuro/issues/2) ([workspace note](issues/02-slidev-integration-capabilities.md)): Slidev and Excalidraw expose the building blocks, but the integration must define staged rendering, asset loading, and stylesheet behavior.
- [Define the Excalidraw presentation metadata contract](https://github.com/amolenk/Figuro/issues/7) ([workspace note](issues/03-excalidraw-presentation-metadata-contract.md)): Figuro metadata is versioned per element; defaults, preservation, and conditional third-party compatibility are settled.
- [Define the Slidev authoring and stylesheet contract](https://github.com/amolenk/Figuro/issues/8) ([workspace note](issues/04-slidev-authoring-and-style-contract.md)): One Slidev component renders each file as a slide; normal clicks reveal steps, and render-only CSS supports both general and role-specific styling.
- [Choose the Slidev plugin distribution policy](https://github.com/amolenk/Figuro/issues/4) ([workspace note](issues/05-slidev-plugin-distribution-policy.md)): Publish `@figuro/slidev` independently on npm, initially support tested Slidev 53.x, and support unannotated or Figuro metadata v1 files without app-release lockstep.
- [Prototype Figuro's presentation metadata inspector](https://github.com/amolenk/Figuro/issues/3) ([workspace note](issues/06-figuro-metadata-inspector-prototype.md)): Choose the persistent inspector sidebar; multi-selection edits apply to selected shapes and arrows, which must be selectable in the final editor.

## Not yet specified

- Renderer-fidelity boundaries for more complex Excalidraw scenes (for example, image resources, bound text, frames, and grouped content) may expose additional compatibility questions once the rendering API is chosen.

## Out of scope

- Reveal.js integration. The destination is a reusable Slidev integration; the Reveal.js proposal in `docs/SPEC.md` is not part of this effort.
- Presentation integrations for frameworks other than Slidev.
- An editor target other than the native macOS Figuro app.
