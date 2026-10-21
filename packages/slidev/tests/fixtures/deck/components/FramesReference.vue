<script setup lang="ts">
import { onMounted, ref } from "vue";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import drawing from "../drawings/frames.excalidraw?raw";
import assetPath from "virtual:figuro-fonts";

const markup = ref("");
onMounted(async () => {
  window.EXCALIDRAW_ASSET_PATH = new URL(assetPath, document.baseURI).href;
  const scene = JSON.parse(drawing);
  const svg = await exportToSvg({
    elements: restoreElements(scene.elements, null),
    appState: { exportBackground: true, viewBackgroundColor: scene.appState.viewBackgroundColor, exportWithDarkMode: false },
    files: scene.files,
  });
  // Use CSS clipping in the independent export oracle to avoid the pinned
  // renderer's namespaced presentation attribute being lost on serialization.
  for (const node of svg.querySelectorAll<SVGElement>("*")) {
    const clip = node.getAttributeNS(svg.namespaceURI, "clip-path");
    if (clip !== null) node.style.clipPath = clip;
  }
  markup.value = new XMLSerializer().serializeToString(svg);
});
</script>

<template>
  <div class="frames-reference" v-html="markup" />
</template>
