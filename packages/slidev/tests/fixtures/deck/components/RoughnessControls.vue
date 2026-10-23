<script setup lang="ts">
import { ref } from "vue";

const layout = ref<"original" | "tidy" | "structured">("original");
const roughness = ref<"" | "original" | "smooth" | "sketchy" | "rough">("");
</script>

<template>
  <div class="roughness-controls">
    <select v-model="layout" aria-label="Layout">
      <option>original</option>
      <option>tidy</option>
      <option>structured</option>
    </select>
    <select v-model="roughness" aria-label="Roughness">
      <option value="">Layout default</option>
      <option>original</option>
      <option>smooth</option>
      <option>sketchy</option>
      <option>rough</option>
    </select>
    <FiguroDiagram src="./drawings/roughness.excalidraw" :layout="layout" :roughness="roughness || undefined" stylesheet="./styles/roughness.css" />
  </div>
</template>
