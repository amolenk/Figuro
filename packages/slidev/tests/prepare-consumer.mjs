import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const directory = "/tmp/figuro-slidev-consumer";
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
execFileSync("pnpm", ["pack", "--pack-destination", directory], { stdio: "inherit" });
await cp("tests/fixtures/deck", directory, { recursive: true });
await writeFile(`${directory}/package.json`, JSON.stringify({
  name: "figuro-slidev-consumer", private: true, type: "module",
  dependencies: {
    "@figuro/slidev": "file:./figuro-slidev-0.1.0.tgz",
    "@slidev/cli": "53.0.0",
    "@slidev/theme-default": "0.25.0",
    "markdown-it": "14.1.0",
    "vue": "3.5.44", "react": "19.2.8", "react-dom": "19.2.8",
  },
}));
const slides = await readFile(`${directory}/slides.md`, "utf8");
await writeFile(`${directory}/slides.md`, slides.replace("'@/../../../'", "'@figuro/slidev'"));
execFileSync("pnpm", ["install", "--ignore-scripts"], { cwd: directory, stdio: "inherit" });
// The independent export oracle uses the addon's pinned runtime dependency;
// the consumer still installs no extra renderer or addon dev dependencies.
const require = createRequire(`${directory}/package.json`);
const addonRequire = createRequire(require.resolve("@figuro/slidev/package.json"));
for (const component of ["BoundTextReference", "FramesReference"]) {
  const referencePath = `${directory}/components/${component}.vue`;
  const reference = await readFile(referencePath, "utf8");
  await writeFile(referencePath, reference.replace('"@excalidraw/excalidraw"', JSON.stringify(addonRequire.resolve("@excalidraw/excalidraw"))));
}
execFileSync("pnpm", ["exec", "slidev", "build", "slides.md", "--base", "/fixture/", "--out", resolve("dist/consumer")], { cwd: directory, stdio: "inherit" });
await rm(directory, { recursive: true, force: true });
