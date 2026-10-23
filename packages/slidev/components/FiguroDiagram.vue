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
import { resolveRenderRoughness } from "../src/render-styling";
import type { RoughnessMode } from "../src/render-styling";
import { normalizeSceneLayout } from "../src/scene-layout";
import type { LayoutMode } from "../src/scene-layout";
import { prepareTextLayout } from "../src/text-layout";

const props = defineProps<{
  src: string;
  stylesheet?: string;
  stylesheetCss?: string;
  layout?: LayoutMode;
  roughness?: RoughnessMode;
  textSections?: boolean;
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
const container = ref<HTMLDivElement>();

watch(() => [props.drawing, props.stylesheetCss, props.layout, props.roughness, props.textSections, container.value], async (_, __, onCleanup) => {
  if (!container.value) return;
  let current = true;
  onCleanup(() => { current = false; });
  markup.value = [];
  error.value = "";
  let disposeText = () => {};
  try {
    window.EXCALIDRAW_ASSET_PATH = new URL(assetPath, document.baseURI).href;
    if (!props.drawing) throw new Error("Drawing was not loaded by the Figuro addon.");
    const drawing = props.drawing;
    const prepared = presentation.value;
    warnPresentationMetadata(props.src, prepared);
    const elements = restoreElements(prepared.elements, null).filter(element => !element.isDeleted);
    const mode = props.layout ?? "original";
    const roughness = resolveRenderRoughness(props.roughness, mode);
    const labels = prepareTextLayout(elements, props.textSections ?? false, mode === "structured");
    disposeText = labels.dispose;
    const roles = prepareRoleStyling(labels.elements, props.src);
    const exportScene = (elements: ExcalidrawElement[]) => exportToSvg({
      elements,
      appState: {
        exportBackground: true,
        viewBackgroundColor: drawing.appState?.viewBackgroundColor ?? "#ffffff",
        exportWithDarkMode: false,
      },
      // Reuse embedded resources; transforms and cropping belong to the exporter.
      files: drawing.files ?? {},
    });
    if (props.textSections || mode === "structured") {
      // Measure bound labels with their selected typography before laying out
      // the complete scene and generating the final reveal states.
      const preview = await exportScene(roles.elements);
      if (!current) return;
      roles.apply(preview);
      await labels.measure(preview, props.stylesheetCss, container.value);
      if (!current) return;
    }
    const renderElements = labels.reflow(normalizeSceneLayout(roles.elements, mode, labels.minimumSizes))
      .map(element => roughness === undefined ? element : { ...element, roughness });
    const timing = revealSteps.value;
    const stages: string[] = [];
    for (const step of steps.value) {
      // Keep the complete scene in every export so its bounds and coordinates
      // are identical. Change only copies' opacity, never the source drawing.
      const svg = await exportScene(renderElements.map(element => (timing.get(element.id) ?? 0) > step ? { ...element, opacity: 0 } : element));
      if (!current) return;
      // Inline states share a document. Unique IDs prevent a visible state's
      // clipping from resolving to a hidden state or another diagram instance.
      const clipReferences = new Map<string, string>();
      const prefix = `figuro-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
      const clipPaths: NodeListOf<SVGElement> = svg.querySelectorAll("clipPath[id], mask[id]");
      for (const [index, path] of Array.from(clipPaths).entries()) {
        const id = `${prefix}-${index}`;
        clipReferences.set(`url(#${path.id})`, `url(#${id})`);
        path.id = id;
      }
      // Excalidraw 0.18.1 puts clip-path in the SVG namespace. Serialization
      // prefixes it, but inline SVG presentation attributes must be unqualified.
      for (const node of svg.querySelectorAll("*")) {
        const clip = node.getAttributeNS(svg.namespaceURI, "clip-path") ?? node.getAttribute("clip-path");
        if (clip !== null) {
          node.removeAttributeNS(svg.namespaceURI, "clip-path");
          node.setAttribute("clip-path", clipReferences.get(clip) ?? clip);
        }
        const mask = node.getAttribute("mask");
        if (mask !== null) node.setAttribute("mask", clipReferences.get(mask) ?? mask);
      }
      roles.apply(svg);
      labels.apply(svg);
      stages.push(new XMLSerializer().serializeToString(svg));
    }
    markup.value = stages;
  } catch (cause) {
    if (!current) return;
    error.value = `[Figuro] Drawing "${props.src}": ${cause instanceof Error ? cause.message : String(cause)}`;
    console.error(error.value, cause);
  } finally {
    disposeText();
  }
}, { immediate: true, flush: "post" });
</script>

<template>
  <div ref="container" class="figuro-diagram">
    <div v-if="error" role="alert">{{ error }}</div>
    <template v-else>
      <v-switch v-if="steps.length > 1" :key="steps.join(',')" class="figuro-reveals">
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

/* Slidev adds a wrapper around each state. Both wrapper levels must inherit
   the available height for the SVG's max-height to constrain tall drawings. */
.figuro-reveals,
.figuro-diagram :deep(.figuro-reveals > div) {
  height: 100%;
}
</style>
