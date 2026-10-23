<script setup>
import { onMounted, ref } from "vue";
import {
  exportToSvg,
  getCommonBounds,
  restoreElements,
} from "@excalidraw/excalidraw";

const props = defineProps({
  src: { type: String, required: true },
  stylesheet: { type: String, default: null },
});

const stages = ref([]);
const sourceUnchanged = ref(null);
const loadStatus = ref("Loading fixture…");
const sceneBounds = ref("checking");

const hashText = async (text) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const readSvgFrame = (svg) => ({
  width: svg.getAttribute("width"),
  height: svg.getAttribute("height"),
  viewBox: svg.getAttribute("viewBox"),
});

const isFrameEqual = (left, right) =>
  left.width === right.width &&
  left.height === right.height &&
  left.viewBox === right.viewBox;

const tagRoleGroups = (svg, elements) => {
  const renderedNodes = [...svg.children].filter(
    (node) => !["metadata", "defs"].includes(node.localName),
  );
  let tagged = 0;

  for (const [index, element] of elements.entries()) {
    const role = element.customData?.figuro?.role;
    const node = renderedNodes[index];
    if (role && node) {
      if (node.localName === "g") {
        node.setAttribute("data-figuro-role", role);
      } else {
        const group = svg.ownerDocument.createElementNS(
          "http://www.w3.org/2000/svg",
          "g",
        );
        group.setAttribute("data-figuro-role", role);
        node.before(group);
        group.append(node);
      }
      tagged += 1;
    }
  }

  return tagged;
};

const hideElementsAfterStep = (svg, elements, step) => {
  const renderedNodes = [...svg.children].filter(
    (node) => !["metadata", "defs"].includes(node.localName),
  );

  for (const [index, element] of elements.entries()) {
    const elementStep = element.customData?.figuro?.step ?? 0;
    if (elementStep > step) renderedNodes[index]?.setAttribute("visibility", "hidden");
  }
};

onMounted(async () => {
  if (props.stylesheet) {
    const stylesheetResponse = await fetch(props.stylesheet, { cache: "no-store" });
    const stylesheet = document.createElement("style");
    stylesheet.dataset.figuroPrototype = "stylesheet";
    stylesheet.textContent = await stylesheetResponse.text();
    document.head.append(stylesheet);
  }

  const response = await fetch(props.src, { cache: "no-store" });
  const sourceText = await response.text();
  const sourceDigest = await hashText(sourceText);
  const scene = JSON.parse(sourceText);
  const elements = restoreElements(scene.elements, null).filter(
    (element) => !element.isDeleted,
  );
  sceneBounds.value = JSON.stringify(getCommonBounds(elements));
  const steps = [
    0,
    ...new Set(
      elements
        .map((element) => element.customData?.figuro?.step ?? 0)
        .filter((step) => step > 0),
    ),
  ].sort((a, b) => a - b);
  const exportOptions = {
    exportBackground: false,
    viewBackgroundColor: "transparent",
    exportScale: 1,
  };
  for (const step of steps) {
    const svg = await exportToSvg({
      elements,
      appState: exportOptions,
      files: scene.files ?? {},
      exportPadding: 20,
    });
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.add("figuro-svg");

    const roleNodesTagged = tagRoleGroups(svg, elements);
    hideElementsAfterStep(svg, elements, step);
    const baseElementNode = [...svg.children].find(
      (node) => !["metadata", "defs"].includes(node.localName),
    );
    stages.value.push({
      step,
      elementCount: elements.filter(
        (element) => (element.customData?.figuro?.step ?? 0) <= step,
      ).length,
      newlyRevealedCount: elements.filter(
        (element) => (element.customData?.figuro?.step ?? 0) === step,
      ).length,
      markup: new XMLSerializer().serializeToString(svg),
      frame: readSvgFrame(svg),
      roleNodesTagged,
      baseElementSignature: baseElementNode?.outerHTML,
    });
  }

  const verifyResponse = await fetch(props.src, { cache: "no-store" });
  sourceUnchanged.value = sourceDigest === (await hashText(await verifyResponse.text()));
  loadStatus.value = "Exports ready";
});

const allFramesMatch = () =>
  stages.value.every((stage) => isFrameEqual(stage.frame, stages.value[0]?.frame));
const baseElementIsStable = () =>
  stages.value.every(
    (stage) => stage.baseElementSignature === stages.value[0]?.baseElementSignature,
  );
</script>

<template>
  <div class="figuro-prototype">
    <div class="figuro-diagram">
      <v-switch tag="div" child-tag="div" :unmount="false">
        <template #0>
          <div class="svg-stage" v-html="stages[0]?.markup ?? ''" />
        </template>
        <template #1>
          <div class="svg-stage" v-html="stages[1]?.markup ?? ''" />
        </template>
        <template #2>
          <div class="svg-stage" v-html="stages[2]?.markup ?? ''" />
        </template>
      </v-switch>
      <div v-if="stages.length === 0" class="figuro-loading">{{ loadStatus }}</div>
    </div>

    <div class="figuro-status">
      <div>
        Distinct reveal states:
        <code>{{ stages.map((stage) => stage.step).join(" → ") || "…" }}</code>
        · New elements at step 1:
        <code>{{ stages.find((stage) => stage.step === 1)?.newlyRevealedCount ?? "…" }}</code>
        · Source unchanged:
        <code>{{ sourceUnchanged === null ? "checking" : sourceUnchanged ? "yes" : "NO" }}</code>
      </div>
      <div>
        Common SVG frame:
        <code>{{ stages.length ? allFramesMatch() && baseElementIsStable() : "checking" }}</code>
        · frame values:
        <code>{{ stages.map((stage) => `${stage.frame.width}×${stage.frame.height} ${stage.frame.viewBox}`).join(" | ") || "…" }}</code>
      </div>
      <div>Restored scene bounds: <code>{{ sceneBounds }}</code></div>
      <div>
        Matched SVG nodes with a semantic role:
        <code>{{ stages.reduce((count, stage) => count + stage.roleNodesTagged, 0) }}</code>
      </div>
    </div>
  </div>
</template>

<style>
.figuro-diagram {
  position: relative;
  width: min(70vw, 640px);
  aspect-ratio: 2 / 1;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #c9c3b8;
  background: #fffdf8;
}

.figuro-diagram .svg-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.figuro-diagram svg {
  display: block;
  width: 100%;
  height: 100%;
}

.figuro-status {
  width: min(70vw, 640px);
  margin: 0.6em auto 0;
  color: #48545a;
  font-size: 0.48em;
  line-height: 1.4;
}

.figuro-status code {
  color: #202426;
}

.figuro-loading {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: #48545a;
  font-size: 0.7em;
}
</style>
