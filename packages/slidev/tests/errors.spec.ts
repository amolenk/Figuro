import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const addon = resolve(".");
const run = (command: string, args: string[], options = {}) => exec(command, args, options)
  .then(() => ({ failed: false, output: "" }), error => ({ failed: true, output: `${error.stdout}\n${error.stderr}` }));

test("invalid Excalidraw input shows a path-specific development error", async ({ page }) => {
  await page.goto("/1");
  const overlay = page.locator("vite-error-overlay");
  await expect(overlay).toBeAttached();
  await expect(overlay.locator(".message")).toContainText("[Figuro]");
  await expect(overlay.locator(".message")).toContainText("drawings/invalid.excalidraw");
  await expect(overlay.locator(".message")).toContainText("elements");
});

test("a production build fails with the selected path for missing, unreadable, and invalid drawings", async () => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(join(addon, "tests/fixtures/build-errors-"));
  const source = "./broken.excalidraw";
  const path = join(directory, source);
  try {
    await writeFile(join(directory, "slides.md"), `---\ntheme: default\naddons:\n  - ${JSON.stringify(addon)}\nfonts:\n  provider: none\n---\n\n<FiguroDiagram src="${source}" />\n`);
    for (const kind of ["missing", "unreadable", "invalid-json", "invalid-scene", "invalid-element", "invalid-link"]) {
      await rm(path, { recursive: true, force: true });
      if (kind === "unreadable") await mkdir(path);
      if (kind === "invalid-json") await writeFile(path, "{broken");
      if (kind === "invalid-scene") await writeFile(path, '{"type":"excalidraw","elements":null}');
      if (kind === "invalid-element") await writeFile(path, '{"type":"excalidraw","elements":[{"id":"bad","type":"rectangle","x":"wrong"}]}');
      if (kind === "invalid-link") {
        const drawing = JSON.parse(await readFile("tests/fixtures/deck/drawings/ordinary.excalidraw", "utf8"));
        drawing.elements[0].link = 42;
        await writeFile(path, JSON.stringify(drawing));
      }
      const result = await run("pnpm", ["exec", "slidev", "build", join(directory, "slides.md"), "--out", join(directory, "dist")]);
      expect(result.failed, kind).toBe(true);
      expect(result.output, kind).toContain("[Figuro]");
      expect(result.output, kind).toContain(source);
      expect(result.output, kind).toContain(path);
    }

    // The Docker fixture runs as root by default. Check real OS permission denial
    // through an unprivileged build, in addition to an unreadable directory above.
    if (process.platform === "linux" && process.getuid?.() === 0) {
      await rm(path, { recursive: true, force: true });
      // Previous builds generated root-owned Slidev cache files. Let the
      // unprivileged build create its own cache so only the drawing is denied.
      await rm(join(directory, "node_modules"), { recursive: true, force: true });
      await chmod(directory, 0o777);
      await writeFile(path, '{"type":"excalidraw","elements":[]}');
      await chmod(path, 0o000);
      const cli = pathToFileURL(resolve("node_modules/@slidev/cli/bin/slidev.mjs"));
      const result = await run("node", [cli.pathname, "build", join(directory, "slides.md"), "--out", join(directory, "permission-dist")], { uid: 65534, gid: 65534 });
      expect(result.failed).toBe(true);
      expect(result.output).toContain("[Figuro]");
      expect(result.output).toContain("EACCES");
      expect(result.output).toContain(path);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
