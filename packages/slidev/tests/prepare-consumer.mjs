import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const slidevVersion = process.env.SLIDEV_VERSION || "53.0.0";
const publishedVersion = process.env.FIGURO_PACKAGE_VERSION;
if (publishedVersion && !/^\d+\.\d+\.\d+$/.test(publishedVersion)) {
  throw new Error("FIGURO_PACKAGE_VERSION must be an exact release version, such as 0.1.0.");
}
const directory = await mkdtemp(join(tmpdir(), "figuro-slidev-consumer-"));
try {
  let addon = publishedVersion;
  if (!addon) {
    execFileSync("pnpm", ["pack", "--pack-destination", directory], { stdio: "inherit" });
    const archive = (await readdir(directory)).find(file => file.endsWith(".tgz"));
    assert.ok(archive, "pnpm pack must produce an addon tarball");
    addon = `file:./${archive}`;
  }
  await cp("tests/fixtures/deck", directory, {
    recursive: true,
    filter: path => basename(path) !== "node_modules",
  });
  await writeFile(`${directory}/package.json`, JSON.stringify({
    name: "figuro-slidev-consumer", private: true, type: "module",
    dependencies: {
      "@figuro/slidev": addon,
      "@slidev/cli": slidevVersion,
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
  const manifest = addonRequire("./package.json");
  assert.equal(manifest.name, "@figuro/slidev");
  assert.equal(manifest.dependencies["@excalidraw/excalidraw"], "0.18.1");
  assert.equal(manifest.peerDependencies["@slidev/cli"], ">=53.0.0 <54.0.0");
  assert.match(require("@slidev/cli/package.json").version, /^53\./);
  if (publishedVersion) assert.equal(manifest.version, publishedVersion);
  for (const component of ["BoundTextReference", "FramesReference", "GroupsReference"]) {
    const referencePath = `${directory}/components/${component}.vue`;
    const reference = await readFile(referencePath, "utf8");
    await writeFile(referencePath, reference.replace('"@excalidraw/excalidraw"', JSON.stringify(addonRequire.resolve("@excalidraw/excalidraw"))));
  }
  execFileSync("pnpm", ["exec", "slidev", "build", "slides.md", "--base", "/fixture/", "--out", resolve("dist/consumer")], { cwd: directory, stdio: "inherit" });
} finally {
  await rm(directory, { recursive: true, force: true });
}
