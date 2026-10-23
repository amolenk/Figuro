import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const addon = resolve(".");

test("missing and unreadable selected stylesheets show path-specific development errors", async ({ page }) => {
  const path = resolve("tests/fixtures/stylesheet-errors/selected.css");
  try {
    for (const kind of ["missing", "unreadable"]) {
      if (kind === "unreadable") await mkdir(path);
      const failedSlide = page.waitForEvent("console", { predicate: message => message.type() === "error" && message.text().includes("slide failed to load") });
      await page.goto(`/1?case=${kind}`);
      await failedSlide;
      // Ensure Vite's overlay client is ready after the cold dependency crawl.
      await page.reload();
      const message = page.locator("vite-error-overlay .message");
      await expect(message).toContainText('[Figuro] Stylesheet "./selected.css"');
      await expect(message).toContainText(path);
      await expect(message).toContainText(kind === "missing" ? "ENOENT" : "EISDIR");
    }
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("production builds fail with the path of a missing or unreadable selected stylesheet", async () => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(join(addon, "tests/fixtures/stylesheet-build-errors-"));
  const source = "./selected.css";
  const path = join(directory, source);
  const deck = join(directory, "slides.md");
  const build = async (options = {}) => {
    const cli = pathToFileURL(resolve("node_modules/@slidev/cli/bin/slidev.mjs"));
    const result = await exec("node", [cli.pathname, "build", deck, "--out", join(directory, "dist")], options)
      .then(() => ({ failed: false, output: "" }), error => ({ failed: true, output: `${error.stdout}\n${error.stderr}` }));
    expect(result.failed).toBe(true);
    expect(result.output).toContain(`[Figuro] Stylesheet "${source}"`);
    expect(result.output).toContain(path);
    return result.output;
  };
  try {
    await writeFile(join(directory, "drawing.excalidraw"), await readFile("tests/fixtures/deck/drawings/ordinary.excalidraw"));
    await writeFile(deck, `---\ntheme: default\naddons:\n  - ${JSON.stringify(addon)}\nfonts:\n  provider: none\n---\n\n<FiguroDiagram src="./drawing.excalidraw" stylesheet="${source}" />\n`);
    expect(await build()).toContain("ENOENT");
    await mkdir(path);
    expect(await build()).toContain("EISDIR");

    // Exercise actual permission denial even when Docker runs as root.
    if (process.platform === "linux" && process.getuid?.() === 0) {
      await rm(path, { recursive: true });
      await rm(join(directory, "node_modules"), { recursive: true, force: true });
      await chmod(directory, 0o777);
      await writeFile(path, "svg text { fill: red; }");
      await chmod(path, 0o000);
      expect(await build({ uid: 65534, gid: 65534 })).toContain("EACCES");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
