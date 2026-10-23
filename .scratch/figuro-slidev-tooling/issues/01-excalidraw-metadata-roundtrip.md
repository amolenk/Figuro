# Research Excalidraw metadata round-tripping

GitHub issue: [Research Excalidraw metadata round-tripping](https://github.com/amolenk/Figuro/issues/5)

Type: research
Status: resolved

## Question

What does the current Excalidraw file format and pinned editor version (`@excalidraw/excalidraw` 0.18.1) support for custom per-element metadata through serialization, loading, saving, export, and round-trips in the standard Excalidraw app? Establish the documented guarantees, version constraints, and any known loss or transformation of unknown fields. Report facts with primary-source links; do not choose Figuro's metadata contract.

## Answer

In the pinned `@excalidraw/excalidraw` 0.18.1, JSON-serializable element `customData` survives ordinary JSON scene serialization and restore/save in the standard app; unknown element fields are also retained by its restore path. This is not a guarantee for older versions or every conversion path. PNG/SVG exports omit editable scene metadata unless scene embedding is explicitly enabled.

Research asset: [Excalidraw element metadata round-tripping](https://github.com/amolenk/Figuro/blob/research/excalidraw-metadata-roundtrip/research/excalidraw-metadata-roundtrip.md) on the `research/excalidraw-metadata-roundtrip` branch.
