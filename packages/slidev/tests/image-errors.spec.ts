import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function expectImageBuildFailure(image: Record<string, unknown>, files: unknown, details: string[]) {
  const addon = resolve(".");
  const directory = await mkdtemp(join(addon, "tests/fixtures/image-errors-"));
  try {
    const scene = JSON.parse(await readFile("tests/fixtures/deck/drawings/ordinary.excalidraw", "utf8"));
    scene.elements = [{ ...scene.elements[0], type: "image", status: "saved", scale: [1, 1], crop: null, ...image }];
    scene.files = files;
    await writeFile(join(directory, "broken.excalidraw"), JSON.stringify(scene));
    await writeFile(join(directory, "slides.md"), `---\ntheme: default\naddons:\n  - ${JSON.stringify(addon)}\nfonts:\n  provider: none\n---\n\n<FiguroDiagram src="./broken.excalidraw" />\n`);
    const result = await exec("pnpm", ["exec", "slidev", "build", join(directory, "slides.md"), "--out", join(directory, "dist")])
      .then(() => ({ failed: false, output: "" }), error => ({ failed: true, output: `${error.stdout}\n${error.stderr}` }));
    expect(result.failed).toBe(true);
    for (const detail of ["[Figuro]", "./broken.excalidraw", join(directory, "broken.excalidraw"), ...details]) {
      expect(result.output).toContain(detail);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

for (const [kind, file] of Object.entries({
  "missing dataURL": { id: "required-file", mimeType: "image/png" },
  "empty dataURL": { id: "required-file", mimeType: "image/png", dataURL: "data:image/png;base64," },
  "external URL": { id: "required-file", mimeType: "image/png", dataURL: "https://example.com/image.png" },
  "missing MIME type": { id: "required-file", dataURL: "data:image/png;base64,aW1hZ2U=" },
  "mismatched MIME type": { id: "required-file", mimeType: "image/jpeg", dataURL: "data:image/png;base64,aW1hZ2U=" },
  "mismatched record id": { id: "other-file", mimeType: "image/png", dataURL: "data:image/png;base64,aW1hZ2U=" },
})) {
  test(`a production build rejects required image records with ${kind}`, async () => {
    await expectImageBuildFailure({ id: "required-image", fileId: "required-file" },
      { "required-file": file }, ["required-image", "required-file"]);
  });
}

test("a production build rejects a missing embedded image with drawing and resource diagnostics", async () => {
  await expectImageBuildFailure({ id: "missing-image", fileId: "missing-file" }, {}, ["missing-image", "missing-file"]);
});

for (const fileId of [null, ""]) {
  test(`a production build rejects an image with ${JSON.stringify(fileId)} fileId`, async () => {
    await expectImageBuildFailure({ id: "uninitialized-image", fileId, status: "pending" }, undefined,
      ["uninitialized-image", "fileId"]);
  });
}
