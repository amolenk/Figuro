import react from "@vitejs/plugin-react";
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);

/**
 * Excalidraw resolves fonts and locales at runtime against
 * `window.EXCALIDRAW_ASSET_PATH`, falling back to a CDN. Figuro must work with
 * no network at all, so the assets are copied into the build output and the
 * fallback is never reached.
 */
function copyExcalidrawAssets(): Plugin {
  return {
    name: "figuro:copy-excalidraw-assets",
    apply: "build",
    async closeBundle() {
      // The package's `exports` map hides its internals, so the asset
      // directory is derived from the resolved entry point instead.
      const distProd = dirname(require.resolve("@excalidraw/excalidraw"));
      const target = join(import.meta.dirname, "dist", "excalidraw-assets");
      for (const asset of ["fonts", "locales"]) {
        await cp(join(distProd, asset), join(target, asset), {
          recursive: true,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExcalidrawAssets()],
  // Assets are served by the app's custom URL scheme handler from the bundle
  // root, so every reference must be relative.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The host runs offline inside WKWebView; a source map costs nothing and
    // makes bridge debugging tractable.
    sourcemap: true,
  },
});
