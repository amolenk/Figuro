import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

test("the npm tarball exposes the public Slidev addon and its independent compatibility contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "figuro-package-"));
  try {
    execFileSync("pnpm", ["pack", "--pack-destination", directory], { stdio: "pipe" });
    const [archive] = await readdir(directory);
    const tarball = join(directory, archive);
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
    const files = execFileSync("tar", ["-tf", tarball], { encoding: "utf8" }).split("\n");

    assert.equal(manifest.name, "@figuro/slidev");
    assert.equal(manifest.publishConfig?.access, "public");
    assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
    assert.notEqual(manifest.private, true);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(manifest.peerDependencies["@slidev/cli"], ">=53.0.0 <54.0.0");
    assert.equal(manifest.engines.slidev, ">=53.0.0 <54.0.0");
    assert.equal(manifest.dependencies["@excalidraw/excalidraw"], "0.18.1");
    for (const file of ["components/FiguroDiagram.vue", "setup/vite-plugins.ts", "src/drawing-plugin.ts", "README.md", "LICENSE"]) {
      assert.ok(files.includes(`package/${file}`), `The published addon must include ${file}`);
    }
    assert.match(execFileSync("tar", ["-xOf", tarball, "package/LICENSE"], { encoding: "utf8" }), /MIT License/);
    assert.ok(!files.some(file => /^package\/(?:tests|node_modules|dist)\//.test(file)), "Development fixtures and dependencies must not ship");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
