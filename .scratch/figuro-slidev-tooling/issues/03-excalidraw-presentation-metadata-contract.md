# Define the Excalidraw presentation metadata contract

GitHub issue: [Define the Excalidraw presentation metadata contract](https://github.com/amolenk/Figuro/issues/7)

Type: grilling
Assignee: OpenCode
Status: resolved
Blocked by: [Research Excalidraw metadata round-tripping](https://github.com/amolenk/Figuro/issues/5)
Depends on: [Research Excalidraw metadata round-tripping](01-excalidraw-metadata-roundtrip.md)

## Question

Given the Excalidraw persistence findings, what stable in-file contract should Figuro and the Slidev integration use for the already-agreed reveal step and optional semantic style role? Decide the metadata location and field/schema-version policy, defaults and unknown-field behavior, and what compatibility promise to make when a file is opened and saved by other Excalidraw tools. Preserve the agreed semantics: unannotated elements and step 0 are initially visible; positive steps reveal in order; elements may share a step.

## Answer

- Store presentation metadata on each annotated Excalidraw element under `customData.figuro`; do not use a sidecar or document-level field. The `figuro` object has a required `v` field; start at `v: 1` and increment the version only for incompatible contract changes. Additive optional fields remain on the same version. When updating Figuro metadata, preserve unrelated `customData` siblings.
- `step` is an optional non-negative integer. Unannotated elements and elements with step 0 are initially visible; positive steps reveal in order, and elements may share a step. An omitted step means step 0. `role` is optional; when absent or unrecognized, use the element's original Excalidraw styling.
- For recognized `v: 1` metadata, ignore unknown fields semantically but preserve them when saving, including when known fields are edited.
- If Figuro encounters an unrecognized schema version, treat its `figuro` object as opaque: do not interpret, coerce, or rewrite it, and preserve it unchanged. Slidev's user-facing handling of unsupported metadata is decided separately in [Define Slidev error and fallback behavior](09-slidev-error-and-fallback-behavior.md).
- Figuro guarantees metadata preservation through its own `.excalidraw` read/save path. Preservation by other Excalidraw tools is conditional on those tools retaining element `customData` through standard JSON load/save. The pinned Excalidraw 0.18.1 standard-app round-trip has been verified, but this is not a guarantee for every version or conversion/export path. PNG/SVG exports do not carry editable scene metadata unless scene embedding is enabled; metadata stripped by another tool cannot be recovered by Figuro.
