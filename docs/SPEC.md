# Figuro user guide

Figuro is a native macOS document application for local `.excalidraw` drawings.
The drawing is edited by Excalidraw inside the app, with its original appearance.
Presentation metadata is optional.

The canonical specification and delivery plan are in
[Implement Figuro presentation metadata and Slidev integration (#16)](https://github.com/amolenk/Figuro/issues/16).
This guide describes the native editor available today and the agreed Slidev
contract. Build and test instructions are in the [project overview](../README.md).

## Open, edit, and save a drawing

- Open an `.excalidraw` file from Finder or **File → Open…**. Use **File → New**
  to start a drawing.
- Use Excalidraw's drawing, selection, text, image, and library tools on the canvas.
  The editor and its fonts work offline.
- Save with **File → Save** or **⌘S**. The native document app also autosaves
  genuine edits in place and supports macOS Versions and revert.
- Export the drawing with **File → Export → SVG…** or **PNG…**. Export uses the
  drawing's appearance, without a presentation stylesheet.

Opening a drawing, changing its selection, panning, zooming, and switching tools
do not change the source file. Valid changes in the Presentation inspector apply
immediately and are saved like other document edits.

## Use the Presentation inspector

The **Presentation** inspector stays beside the canvas. It summarizes the current
selection and edits reveal timing and semantic style roles, using the editor's
controls and color theme. Hide it with its close button and show it again with
the **Presentation** toolbar button. **⌘B** toggles it on macOS, matching VS Code's
sidebar shortcut (**Ctrl+B** in the browser on other platforms). Hiding or showing
the inspector preserves the selection and does not edit the drawing.

### Select elements

Use Excalidraw's selection tool to click a shape, text, or arrow. Shift-click to
extend a selection, drag a selection box around several elements, or focus the
canvas and use **⌘A** to select all. Arrows can be edited alone or together with
other drawing elements.

The inspector displays the selection count. For each field it shows either a
shared current value or **Mixed steps** / **Mixed roles**. A mixed field has an
empty input with a **Mixed** placeholder, so it does not suggest one element's
value applies to the whole selection. An omitted step and an explicit step 0
are displayed distinctly even though both are initially visible.

### Assign a reveal step

Enter a non-negative whole number in **Reveal step**. Valid changes apply
immediately to every selected element.

- No step, or step **0**, means the element is visible when the slide first appears.
- Elements sharing a positive step appear together.
- Positive steps reveal in ascending order. Gaps such as 1, 3, and 8 do not add
  empty clicks.

Negative, fractional, and unrepresentable integer inputs cannot be applied.
Empty the field or click **Clear step** to remove only the step from every selected
element; roles and additional v1 metadata remain intact.

### Assign a semantic style role

Enter a label such as `primary`, `supporting`, or `connection` in **Semantic style
role**. Changes apply immediately to every selected element.
Role labels are free-form and are matched by a presentation stylesheet.

Setting a role does not change the drawing's colors, strokes, text, or geometry
in Figuro. Empty the field or click **Clear role** to remove only the role; reveal steps and
additional v1 metadata remain intact.

### Clear all presentation metadata

Click **Clear presentation metadata** to remove the selected elements' entire Figuro
annotation, including step, role, schema version, and additional v1 fields.
Custom data owned by other tools is retained. Elements without Figuro metadata
are left unchanged.

Clear buttons are enabled when at least one selected element has the corresponding
metadata. Reapplying the same value, or clearing an absent field, does not create
a document edit.

### Save and compatibility

Save normally, then reopen the `.excalidraw` file to continue editing. Figuro
stores annotations on each element:

```json
{
  "customData": {
    "anotherTool": { "keep": true },
    "figuro": { "v": 1, "step": 3, "role": "primary" }
  }
}
```

The version field `v: 1` is required on an annotation; `step` and `role` are
optional. A drawing without annotations is an ordinary Excalidraw document.
Step and role edits preserve unrelated `customData` and additional fields in
recognized v1 metadata.

Metadata that does not declare version 1 is preserved opaquely. If any selected
element contains such metadata, the inspector explains this and disables metadata
edits for the entire selection. Select supported elements separately to edit
them. Invalid step or role values inside recognized v1 metadata are labeled as
invalid and can be corrected or cleared. Ordinary drawing edits and saving still
preserve opaque metadata.
Other tools preserve annotations only if they retain Excalidraw `customData`
when loading and saving.

## Static drawings in Slidev

The workspace now includes the `@figuro/slidev` addon foundation for Slidev 53.x
and Excalidraw 0.18.1. Register it through Slidev's addon mechanism and place
`<FiguroDiagram src="./drawings/architecture.excalidraw" />` on a slide.
The literal drawing path is relative to the deck entry file's directory.
The component exports the whole drawing to SVG in the browser with its original
appearance, without modifying the source. Missing, unreadable, and invalid input
surfaces a development error and fails production builds with the drawing path.
See the [addon guide](../packages/slidev/README.md) for local installation and the
Linux Docker browser-acceptance fixture.

### Remaining presentation contract

The full presentation interface adds an optional `stylesheet` path alongside
the required `src`, both resolved relative to the deck. One drawing is one slide,
including when the drawing contains Excalidraw frames.

The addon will use normal Slidev forward/backward navigation for reveal states,
keep the SVG frame stable, and continue to the next slide after the final reveal.
Without a stylesheet, drawings retain their original appearance. CSS applies
only to rendered presentation output, overrides matching properties, and never
edits the source drawing. Reliable semantic role hooks use
`[data-figuro-role="primary"]` selectors.

Initial compatibility is Slidev 53.x and Excalidraw 0.18.1. Presentation support
will add Figuro metadata v1 independently of the app release. Complex scenes
have explicit rendering, reveal, and role-styling boundaries in
[#16](https://github.com/amolenk/Figuro/issues/16), including images, bound text,
frames/clipping, and grouped content. Assigning metadata in the editor does not
promise role styling for every complex structure in the renderer.
