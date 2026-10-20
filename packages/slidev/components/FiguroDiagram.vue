<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
function revealStep(element: ExcalidrawElement): number {
  const metadata = element.customData?.figuro;
  return metadata?.v === 1 && Number.isInteger(metadata.step) && metadata.step >= 0
    ? metadata.step : 0;
}

// Slot names must be available synchronously: Slidev captures v-switch slots
// when it mounts, before the asynchronous SVG exports have finished.
const steps = computed(() => [0, ...new Set((props.drawing?.elements ?? [])
  .filter(element => !element.isDeleted)
  .map(revealStep).filter(step => step > 0))].sort((left, right) => left - right));
const markup = ref<string[]>([]);
const error = ref("");

watch(() => props.drawing, async (_, __, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  markup.value = [];
  error.value = "";
  try {
    window.EXCALIDRAW_ASSET_PATH = new URL(assetPath, document.baseURI).href;
    if (!props.drawing) throw new Error("Drawing was not loaded by the Figuro addon.");
    const elements = restoreElements(props.drawing.elements, null).filter(element => !element.isDeleted);
    const stages: string[] = [];
    for (const step of steps.value) {
      const svg = await exportToSvg({
        // Keep the complete scene in every export so its bounds and coordinates
        // are identical. Change only copies' opacity, never the source drawing.
        elements: elements.map(element => revealStep(element) > step ? { ...element, opacity: 0 } : element),
        appState: {
          exportBackground: true,
          viewBackgroundColor: props.drawing.appState?.viewBackgroundColor ?? "#ffffff",
          exportWithDarkMode: false,
        },
        files: props.drawing.files ?? {},
      });
      if (!current) return;
      stages.push(new XMLSerializer().serializeToString(svg));
    }
    markup.value = stages;
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
    <template v-else>
      <v-switch v-if="steps.length > 1" :key="steps.join(',')">
        <template v-for="(step, index) in steps" :key="step" #[index]>
          <div class="figuro-svg" v-html="markup[index] ?? ''" />
        </template>
      </v-switch>
      <div v-else class="figuro-svg" v-html="markup[0] ?? ''" />
      <div v-if="!markup.length" role="status">Loading drawing…</div>
    </template>
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
