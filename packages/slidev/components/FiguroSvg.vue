<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ markup: string; stylesheetCss?: string }>();
const host = ref<HTMLDivElement>();

function fontRules(rules: CSSRuleList): string {
  return Array.from(rules).map(rule => {
    if (rule.type === CSSRule.FONT_FACE_RULE) return rule.cssText;
    if ("cssRules" in rule) {
      const nested = fontRules((rule as CSSGroupingRule).cssRules);
      if (nested) return `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${nested}}`;
    }
    return "";
  }).join("\n");
}

watch(() => [host.value, props.markup, props.stylesheetCss], (_, __, onCleanup) => {
  if (!host.value || props.stylesheetCss === undefined) return;
  const root = host.value.shadowRoot ?? host.value.attachShadow({ mode: "open" });
  // The selected CSS stays an ordinary stylesheet; the shadow root provides
  // isolation without rewriting selectors, specificity, or top-level rules.
  root.innerHTML = props.markup;
  const layout = document.createElement("style");
  layout.textContent = "svg { display: block; max-width: 100%; max-height: 100%; }";
  const presentation = document.createElement("style");
  presentation.textContent = props.stylesheetCss;
  root.append(layout, presentation);
  // Chromium ignores @font-face inside shadow roots. Register only font rules
  // globally; all selectors remain inside the diagram's stylesheet.
  const fonts = document.createElement("style");
  fonts.textContent = fontRules(presentation.sheet!.cssRules);
  document.head.append(fonts);
  onCleanup(() => fonts.remove());
}, { flush: "post" });
</script>

<template>
  <div v-if="stylesheetCss !== undefined" ref="host" class="figuro-svg" />
  <div v-else class="figuro-svg" v-html="markup" />
</template>

<style scoped>
.figuro-svg :deep(svg) {
  display: block;
  max-width: 100%;
  max-height: 100%;
}
</style>
