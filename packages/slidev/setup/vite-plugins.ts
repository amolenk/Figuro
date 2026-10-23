import type { ResolvedSlidevOptions } from "@slidev/types";
import type { Plugin } from "vite";
import { drawingPlugin } from "../src/drawing-plugin";
import { fontPlugin } from "../src/font-plugin";

export default function setup(options: ResolvedSlidevOptions) {
  const rendererDependencies: Plugin = {
    name: "figuro:renderer-dependencies",
    config() {
      // Slidev loads addon components lazily. Prebundle the renderer and all its
      // CommonJS dependencies (including React) before the first slide import.
      // The nested ID also resolves in pnpm consumers without a direct renderer dependency.
      return { optimizeDeps: { include: ["@figuro/slidev > @excalidraw/excalidraw"] } };
    },
  };
  return [rendererDependencies, drawingPlugin(options.userRoot), fontPlugin()];
}
