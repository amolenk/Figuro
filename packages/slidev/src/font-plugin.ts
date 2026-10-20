import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const assetDirectory = "figuro-excalidraw/";
const fonts = join(dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")), "fonts");

/** Keep Excalidraw's original fonts available locally in dev and built decks. */
export function fontPlugin(): Plugin {
  let base = "/";
  return {
    name: "figuro:fonts",
    configResolved(config) { base = config.base; },
    resolveId(id) {
      if (id === "virtual:figuro-fonts") return "\0virtual:figuro-fonts";
    },
    load(id) {
      if (id === "\0virtual:figuro-fonts") {
        return `export default import.meta.env.BASE_URL + ${JSON.stringify(assetDirectory)};`;
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const prefix = `${base}${assetDirectory}fonts/`;
        if (!request.url?.startsWith(prefix)) return next();
        const path = resolve(fonts, decodeURIComponent(request.url.slice(prefix.length).split("?")[0]));
        if (!path.startsWith(fonts + sep) || !path.endsWith(".woff2")) return next();
        try {
          const content = await readFile(path);
          response.setHeader("Content-Type", "font/woff2");
          response.end(content);
        } catch { next(); }
      });
    },
    async generateBundle() {
      for (const file of await readdir(fonts, { recursive: true })) {
        if (!file.endsWith(".woff2")) continue;
        const path = join(fonts, file);
        this.emitFile({
          type: "asset",
          fileName: `${assetDirectory}fonts/${relative(fonts, path).split(sep).join("/")}`,
          source: await readFile(path),
        });
      }
    },
  };
}
