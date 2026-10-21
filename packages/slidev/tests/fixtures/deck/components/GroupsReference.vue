<script setup lang="ts">
import { onMounted, ref } from "vue";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import drawing from "../drawings/groups.excalidraw?raw";
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
  markup.value = new XMLSerializer().serializeToString(svg);
});
</script>

<template>
  <div class="groups-reference" v-html="markup" />
</template>
