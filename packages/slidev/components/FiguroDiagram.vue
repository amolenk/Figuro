<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FiguroSvg from "./FiguroSvg.vue";
import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import assetPath from "virtual:figuro-fonts";
import { prepareRoleStyling } from "../src/role-styling";
import { preparePresentationMetadata, warnPresentationMetadata } from "../src/presentation-metadata";
import { prepareRevealSteps } from "../src/reveal-steps";

const props = defineProps<{
  src: string;
  stylesheet?: string;
  stylesheetCss?: string;
  drawing?: {
    elements: ExcalidrawElement[];
    appState?: { viewBackgroundColor?: string };
    files?: BinaryFiles;
  };
}>();
// Slot names must be available synchronously: Slidev captures v-switch slots
// when it mounts, before the asynchronous SVG exports have finished.
const presentation = computed(() => preparePresentationMetadata(props.drawing?.elements ?? []));
const revealSteps = computed(() => prepareRevealSteps(presentation.value.elements));
const steps = computed(() => [0, ...new Set([...revealSteps.value.values()]
  .filter(step => step > 0))].sort((left, right) => left - right));
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
    const prepared = presentation.value;
    warnPresentationMetadata(props.src, prepared);
    const elements = restoreElements(prepared.elements, null).filter(element => !element.isDeleted);
    const roles = prepareRoleStyling(elements, props.src);
    const timing = revealSteps.value;
    const stages: string[] = [];
    for (const step of steps.value) {
      const svg = await exportToSvg({
        // Keep the complete scene in every export so its bounds and coordinates
        // are identical. Change only copies' opacity, never the source drawing.
        elements: roles.elements.map(element => (timing.get(element.id) ?? 0) > step ? { ...element, opacity: 0 } : element),
        appState: {
          exportBackground: true,
          viewBackgroundColor: props.drawing.appState?.viewBackgroundColor ?? "#ffffff",
          exportWithDarkMode: false,
        },
        // Reuse the scene's embedded resources in every state. Image transforms
        // and cropping remain the exporter's responsibility, like other visuals.
        files: props.drawing.files ?? {},
      });
      if (!current) return;
      roles.apply(svg);
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
          <FiguroSvg :markup="markup[index] ?? ''" :stylesheet-css="stylesheetCss" />
        </template>
      </v-switch>
      <FiguroSvg v-else :markup="markup[0] ?? ''" :stylesheet-css="stylesheetCss" />
      <div v-if="!markup.length" role="status">Loading drawing…</div>
    </template>
  </div>
</template>

<style scoped>
.figuro-diagram {
  width: 100%;
  height: 100%;
}
</style>
