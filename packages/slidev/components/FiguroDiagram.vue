<script setup lang="ts">
import { ref, watch } from "vue";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import assetPath from "virtual:figuro-fonts";

const props = defineProps<{
  src: string;
  drawing?: {
    elements: ExcalidrawElement[];
    appState?: { viewBackgroundColor?: string };
    files?: BinaryFiles;
  };
}>();
const markup = ref("");
const error = ref("");

watch(() => props.drawing, async (_, __, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  markup.value = "";
  error.value = "";
  try {
    window.EXCALIDRAW_ASSET_PATH = new URL(assetPath, document.baseURI).href;
    if (!props.drawing) throw new Error("Drawing was not loaded by the Figuro addon.");
    const svg = await exportToSvg({
      elements: restoreElements(props.drawing.elements, null),
      appState: {
        exportBackground: true,
        viewBackgroundColor: props.drawing.appState?.viewBackgroundColor ?? "#ffffff",
        exportWithDarkMode: false,
      },
      files: props.drawing.files ?? {},
    });
    if (current) markup.value = new XMLSerializer().serializeToString(svg);
  } catch (cause) {
    if (!current) return;
    error.value = `[Figuro] Drawing "${props.src}": ${cause instanceof Error ? cause.message : String(cause)}`;
    console.error(error.value);
  }
}, { immediate: true });
</script>

<template>
  <div class="figuro-diagram">
    <div v-if="error" role="alert">{{ error }}</div>
    <div v-else-if="markup" class="figuro-svg" v-html="markup" />
    <div v-else role="status">Loading drawing…</div>
  </div>
</template>

<style scoped>
.figuro-diagram {
  width: 100%;
  height: 100%;
}
.figuro-svg :deep(svg) {
  display: block;
  max-width: 100%;
  max-height: 100%;
}
</style>
