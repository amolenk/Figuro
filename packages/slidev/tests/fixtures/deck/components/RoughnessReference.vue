<script setup lang="ts">
import { onMounted, ref } from "vue";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import drawing from "../drawings/roughness.excalidraw?raw";

const states = ref<{ name: string; markup: string }[]>([]);
onMounted(async () => {
  const scene = JSON.parse(drawing);
  for (const roughness of [undefined, 0, 1, 2]) {
    const elements = restoreElements(scene.elements, null);
    const svg = await exportToSvg({
      elements: roughness === undefined ? elements : elements.map(element => ({ ...element, roughness })),
      appState: { exportBackground: true, viewBackgroundColor: scene.appState.viewBackgroundColor, exportWithDarkMode: false },
      files: scene.files,
    });
    states.value.push({ name: roughness === undefined ? "original" : String(roughness), markup: new XMLSerializer().serializeToString(svg) });
  }
});
</script>

<template>
  <div hidden>
    <div v-for="state in states" :key="state.name" :data-roughness-reference="state.name" v-html="state.markup" />
  </div>
</template>
