# Prototype Figuro's presentation metadata inspector

GitHub issue: [Prototype Figuro’s presentation metadata inspector](https://github.com/amolenk/Figuro/issues/3)

Type: prototype
Assignee: OpenCode
Status: resolved
Blocked by: [Define the Excalidraw presentation metadata contract](https://github.com/amolenk/Figuro/issues/7)
Depends on: [Define the Excalidraw presentation metadata contract](03-excalidraw-presentation-metadata-contract.md)

## Question

What is the simplest effective interaction in Figuro's existing Excalidraw editor for assigning reveal steps and optional semantic style roles to selected elements? Prototype a concrete selection-based inspector flow, including assigning the same step to multiple selected elements and changing or clearing metadata, so the user can react to it. Base the prototype on the resolved metadata contract; do not implement the production feature.

## Prototype asset

 [Interactive metadata inspector alternatives](https://gist.github.com/amolenk/001abd5945b78a9b69f310014f2095c9) (workspace source: [HTML prototype](06-figuro-metadata-inspector-prototype.html))

## Answer

- Choose variant A: a persistent Presentation inspector sidebar beside the drawing. It summarizes the current selection, shows mixed values when selected elements differ, and applies shared step or role edits to the whole selection. Step, role, and all Figuro metadata can be cleared independently.
- The final editor must allow arrows to be selected as elements and edited through the same inspector, alone or in a multi-selection with other elements.
- The updated prototype makes arrows selectable alongside shapes and keeps all changes in memory.
