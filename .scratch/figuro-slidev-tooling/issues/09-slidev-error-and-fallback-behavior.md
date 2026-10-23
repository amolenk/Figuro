# Define Slidev error and fallback behavior

GitHub issue: [Define Slidev error and fallback behavior](https://github.com/amolenk/Figuro/issues/10)

Type: grilling
Blocked by: [Define the Excalidraw presentation metadata contract](https://github.com/amolenk/Figuro/issues/7), [Define the Slidev authoring and stylesheet contract](https://github.com/amolenk/Figuro/issues/8)
Depends on: [Define the Excalidraw presentation metadata contract](03-excalidraw-presentation-metadata-contract.md), [Define the Slidev authoring and stylesheet contract](04-slidev-authoring-and-style-contract.md)

## Question

What should the Slidev integration do when a referenced `.excalidraw` file is missing or invalid, presentation metadata is malformed or from an unknown schema version, or the selected stylesheet cannot be loaded? Decide which cases should fail the build, which may render a useful warning or fallback, and how unknown metadata is handled, using the settled file and rendering contracts.
