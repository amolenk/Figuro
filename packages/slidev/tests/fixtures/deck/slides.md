---
theme: default
addons:
  - '@/../../../'
fonts:
  provider: none
wakeLock: false
layout: center
---

<figuro-diagram v-if="2 > 0" src="./drawings/ordinary.excalidraw" />

---

<WrapperDiagram />

---

# Next slide

---

<FiguroDiagram src="./drawings/reveals.excalidraw" />

---

# After reveals

---

<div class="styled-example">
  <FiguroDiagram src="./drawings/ordinary.excalidraw" stylesheet="./styles/presentation.css" />
</div>
<div class="unstyled-example">
  <FiguroDiagram src="./drawings/ordinary.excalidraw" />
</div>

---

<FiguroDiagram src="./drawings/reveals.excalidraw" stylesheet="./styles/presentation.css" />

---

<FiguroDiagram src="./drawings/ordinary.excalidraw" stylesheet="./styles/font.css" />

---

<FiguroDiagram src="./drawings/roles.excalidraw" stylesheet="./styles/roles.css" />

---

<FiguroDiagram src="./drawings/roles.excalidraw" />

---

<FiguroDiagram src="./drawings/malformed-metadata.excalidraw" stylesheet="./styles/metadata.css" />

---

# After malformed metadata

---

<FiguroDiagram src="./drawings/unknown-metadata.excalidraw" stylesheet="./styles/metadata.css" />

---

<FiguroDiagram src="./drawings/unknown-metadata.excalidraw" />

---

# After unknown metadata

---

<FiguroDiagram src="./drawings/malformed-metadata.excalidraw" />

---

<FiguroDiagram src="./drawings/malformed-values.excalidraw" stylesheet="./styles/roles.css" />

---

<FiguroDiagram src="./drawings/images.excalidraw" />

---

<FiguroDiagram src="./drawings/images.excalidraw" stylesheet="./styles/images.css" />

---

<FiguroDiagram src="./drawings/images.excalidraw" stylesheet="./styles/image-roles.css" />

---

# After images

---

<FiguroDiagram src="./drawings/bound-text.excalidraw" />

---

<FiguroDiagram src="./drawings/bound-text.excalidraw" stylesheet="./styles/bound-text-roles.css" />

---

# After bound text

<BoundTextReference />

---

<FiguroDiagram src="./drawings/frames.excalidraw" />

---

# After frames

<FramesReference />

---

<FiguroDiagram src="./drawings/frames.excalidraw" stylesheet="./styles/frame-roles.css" />

---

# After styled frames

---

<FiguroDiagram src="./drawings/groups.excalidraw" />

---

# After grouped reveals

<GroupsReference />

---

<FiguroDiagram src="./drawings/groups.excalidraw" stylesheet="./styles/group-roles.css" />

---

# After styled groups

---

<FiguroDiagram src="./drawings/tall-reveals.excalidraw" />

---

<FiguroDiagram src="./drawings/tall-reveals.excalidraw" stylesheet="./styles/presentation.css" />

---

<FiguroDiagram src="./drawings/wide-reveals.excalidraw" />

---

<FiguroDiagram src="./drawings/wide-reveals.excalidraw" stylesheet="./styles/presentation.css" />

---

<FiguroDiagram src="./drawings/tall-static.excalidraw" />

---

# Diagram with a title

<div class="diagram-area" style="width: 360px; height: 240px">
  <FiguroDiagram src="./drawings/tall-static.excalidraw" stylesheet="./styles/presentation.css" />
</div>

---

# After sizing examples

---

<div class="roughness-styled">
  <FiguroDiagram src="./drawings/roughness.excalidraw" roughness="smooth" stylesheet="./styles/roughness.css" />
</div>
<div class="roughness-original">
  <FiguroDiagram src="./drawings/roughness.excalidraw" />
</div>
<div class="roughness-colors-only">
  <FiguroDiagram src="./drawings/roughness.excalidraw" stylesheet="./styles/presentation.css" />
</div>

<RoughnessReference />

<div hidden class="roughness-variants">
  <div data-roughness-case="tidy-default"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="tidy" /></div>
  <div data-roughness-case="structured-default"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="structured" /></div>
  <div data-roughness-case="structured-original"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="structured" roughness="original" /></div>
  <div data-roughness-case="tidy-smooth"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="tidy" roughness="smooth" /></div>
  <div data-roughness-case="original-sketchy"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="original" roughness="sketchy" /></div>
  <div data-roughness-case="structured-rough"><FiguroDiagram src="./drawings/roughness.excalidraw" layout="structured" roughness="rough" /></div>
</div>

---

<FiguroDiagram src="./drawings/layout.excalidraw" layout="tidy" />

---

<FiguroDiagram src="./drawings/layout.excalidraw" layout="structured" text-sections />

---

<FiguroDiagram src="./drawings/layout.excalidraw" roughness="smooth" text-sections stylesheet="./styles/text-sections.css" />

---

<FiguroDiagram src="./drawings/layout.excalidraw" />

---

<FiguroDiagram src="./drawings/text-layout.excalidraw" layout="structured" text-sections />

---

<FiguroDiagram src="./drawings/parallel-connectors.excalidraw" layout="structured" />

---

<RoughnessControls />
<RoughnessReference />
