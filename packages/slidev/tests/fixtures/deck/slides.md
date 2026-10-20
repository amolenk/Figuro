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
