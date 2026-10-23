import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { patchExcalidraw } from "./patch-excalidraw.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, "../../../..");
const require = createRequire(resolve(here, "../../package.json"));
const { createServer, build } = await import(require.resolve("vite"));
const packageRoot = dirname(require.resolve("@excalidraw/excalidraw")).replace(/\/prod$/, "/dev");
const packageRequire = createRequire(`${packageRoot}/../../package.json`);
const packageDependencies = Object.keys(packageRequire("./package.json").dependencies);
if(packageRequire("./package.json").version!=="0.18.1")throw new Error("This prototype patches Excalidraw 0.18.1 only");
const patchVersion=createHash("sha256").update(await readFile(resolve(here,"patch-excalidraw.mjs"))).digest("hex").slice(0,12);
const dependencies = ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "@excalidraw/excalidraw", "@excalidraw/excalidraw/index.css"];
const config = {
  root: here, configFile: false, base: "./",
  cacheDir: `/tmp/opencode/figuro-unified-history-vite-${patchVersion}`,
  resolve: { alias: dependencies.map(name => ({
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement: name === "@excalidraw/excalidraw" ? `${packageRoot}/index.js` : name.endsWith("index.css") ? `${packageRoot}/index.css` : packageDependencies.includes(name) ? packageRequire.resolve(name) : require.resolve(name),
  })) },
  optimizeDeps: { include:dependencies.filter(name=>!name.endsWith(".css")), esbuildOptions:{plugins:[{
    name:"throwaway-history-prebundle",setup(build){build.onLoad({filter:/\/dist\/dev\/(index|chunk-4FTI6OG3)\.js$/},async({path})=>({contents:patchExcalidraw(await readFile(path,"utf8"),path).code,loader:"js"}));}
  }]} },
  plugins: [{ name: "throwaway-excalidraw-history-extension", enforce: "pre", transform: patchExcalidraw }],
  server: { host: "127.0.0.1", port: 5198, strictPort: true, fs: { allow: [workspace] } },
};
if (process.argv.includes("--build")) {
  await build({ ...config, build: { outDir: resolve(here, "dist"), emptyOutDir: true } });
  for(const asset of ["fonts","locales"])await cp(resolve(packageRoot,asset),resolve(here,"dist/excalidraw-assets",asset),{recursive:true});
} else {
  const server = await createServer(process.argv.includes("--built") ? {...config,root:resolve(here,"dist")} : config);
  await server.listen(); server.printUrls();
  if (process.argv.includes("--verify")) {
    try { await import("./verify.mjs"); } finally { await server.close(); }
  }
}
