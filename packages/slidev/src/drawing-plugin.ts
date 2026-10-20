import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { validateDrawing } from "./validate-drawing";
import { baseParse, NodeTypes } from "@vue/compiler-dom";
import type { RootNode, TemplateChildNode } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";

const prefix = "virtual:figuro-drawing:";

/** Slidev's Markdown plugin supplies a Vue template before Vue compilation. */
export function drawingPlugin(deckRoot: string): Plugin {
  return {
    name: "figuro:drawings",
    enforce: "pre",
    resolveId(id) {
      if (id.startsWith(prefix)) return `\0${id}`;
    },
    async load(id) {
      if (!id.startsWith(`\0${prefix}`)) return;
      const src = decodeURIComponent(id.slice(prefix.length + 1));
      const path = resolve(deckRoot, src);
      this.addWatchFile(path);
      let scene: unknown;
      try {
        if (!src || !src.endsWith(".excalidraw") || /^(?:[a-z]+:|\/)/i.test(src)) {
          throw new Error("Expected a local .excalidraw path relative to the deck.");
        }
        scene = JSON.parse(await readFile(path, "utf8"));
        validateDrawing(scene);
      } catch (error) {
        this.error(`[Figuro] Drawing "${src}" (${path}): ${error instanceof Error ? error.message : String(error)}`);
      }
      return `export default ${JSON.stringify(scene)};`;
    },
    transform(code, id) {
      if (!/\.(md|vue)$/.test(id) || !/<(?:FiguroDiagram|figuro-diagram)\b/.test(code)) return;
      const { descriptor } = parse(code);
      if (!descriptor.template) return;
      const imports: string[] = [];
      const edits: { offset: number; content: string }[] = [];
      const visit = (node: RootNode | TemplateChildNode) => {
        if (node.type === NodeTypes.ELEMENT && ["FiguroDiagram", "figuro-diagram"].includes(node.tag)) {
          const dynamicSource = node.props.some(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === "bind"
            && (!prop.arg || prop.arg.type !== NodeTypes.SIMPLE_EXPRESSION || prop.arg.content === "src"));
          if (dynamicSource) this.error(`[Figuro] ${id}: FiguroDiagram requires a literal src path for build validation.`);
          const src = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === "src");
          if (!src || src.type !== NodeTypes.ATTRIBUTE || !src.value) {
            this.error(`[Figuro] ${id}: FiguroDiagram requires a literal src path.`);
          }
          const name = `__figuroDrawing${imports.length}`;
          imports.push(`import ${name} from ${JSON.stringify(prefix + encodeURIComponent(src.value.content))};`);
          const opening = node.loc.source.match(/^<(?:[^"'<>]|"[^"]*"|'[^']*')*>/)![0];
          const end = opening.endsWith("/>") ? opening.length - 2 : opening.length - 1;
          edits.push({ offset: descriptor.template!.loc.start.offset + node.loc.start.offset + end, content: ` :drawing="${name}"` });
        }
        if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) node.children.forEach(visit);
      };
      visit(baseParse(descriptor.template.content));
      if (!imports.length) return;
      // compiler-sfc omits empty script blocks; Slidev adds an empty setup block.
      const setupOpening = code.match(/<script\b[^>]*\bsetup\b[^>]*>/);
      if (setupOpening) {
        edits.push({ offset: setupOpening.index! + setupOpening[0].length, content: `\n${imports.join("\n")}\n` });
      } else {
        const lang = descriptor.script?.lang ? ` lang="${descriptor.script.lang}"` : "";
        edits.push({ offset: code.length, content: `\n<script setup${lang}>\n${imports.join("\n")}\n</script>\n` });
      }
      for (const edit of edits.sort((left, right) => right.offset - left.offset)) {
        code = code.slice(0, edit.offset) + edit.content + code.slice(edit.offset);
      }
      return code;
    },
  };
}
