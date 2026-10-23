import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

const drawing = new URL("./fixtures/deck/drawings/bound-text.excalidraw", import.meta.url);
const pairs = [
  { labels: ["Initial pair"], shape: '[fill="#e7f5ff"]' },
  { labels: ["Matching pair"], shape: '[fill="#d3f9d8"]' },
  { labels: ["Later", "label"], shape: '[fill="#fff3bf"]' },
  { labels: ["Later shape"], shape: '[fill="#ffdeeb"]' },
  { labels: ["Arrow label"], shape: '[stroke="#56789a"]' },
];

async function paintedPairs(diagram: Locator) {
  return Promise.all(pairs.map(async pair => ({
    shape: await isPainted(diagram.locator(`svg:visible ${pair.shape}`)),
    labels: await Promise.all(pair.labels.map(label => isPainted(
      diagram.locator("svg:visible text").filter({ hasText: new RegExp(`^${label}$`) }),
    ))),
  })));
}

const initial = [
  { shape: true, labels: [true] }, { shape: false, labels: [false] },
  { shape: false, labels: [false, false] }, { shape: false, labels: [false] },
  { shape: false, labels: [false] },
];
const matching = [initial[0], { shape: true, labels: [true] }, ...initial.slice(2)];
const laterLabel = [matching[0], matching[1], { shape: true, labels: [true, true] }, initial[3], { shape: true, labels: [true] }];
const final = [...laterLabel.slice(0, 3), { shape: true, labels: [true] }, laterLabel[4]];

async function geometry(diagram: Locator) {
  return diagram.locator("svg:visible").evaluate(svg => ({
    viewBox: svg.getAttribute("viewBox"), bounds: svg.getBoundingClientRect().toJSON(),
  }));
}

async function paintedLabelBounds(diagram: Locator) {
  const bounds: Record<string, number[]> = {};
  for (const label of pairs.flatMap(pair => pair.labels)) {
    const text = diagram.locator("svg:visible text").filter({ hasText: new RegExp(`^${label}$`) });
    if (!await isPainted(text)) continue;
    bounds[label] = await text.evaluateAll(nodes => {
      const rectangles = nodes.map(node => node.getBoundingClientRect());
      return [Math.min(...rectangles.map(rectangle => rectangle.left)), Math.min(...rectangles.map(rectangle => rectangle.top)),
        Math.max(...rectangles.map(rectangle => rectangle.right)), Math.max(...rectangles.map(rectangle => rectangle.bottom))];
    });
  }
  return bounds;
}

// Compare actual painted output to Excalidraw's public export, independent of
// Figuro's reveal and role adapters, including arrow label masks and rotation.
async function paintedSvg(svg: Locator) {
  return svg.evaluate(async node => {
    const copy = node.cloneNode(true) as SVGSVGElement;
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      for (const style of root.querySelectorAll("style")) copy.append(style.cloneNode(true));
    }
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL();
  });
}

test("bound text and containers reveal together at the later step with stable composition", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("22");
  const diagram = page.locator(".slidev-page-22 .figuro-diagram");
  await expect(diagram.locator("svg:visible")).toHaveCount(1);
  await expect.poll(() => paintedPairs(diagram)).toEqual(initial);
  const originalGeometry = await geometry(diagram);
  const placements = [await paintedLabelBounds(diagram)];
  for (const [index, state] of [matching, laterLabel, final].entries()) {
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/22\\?clicks=${index + 1}$`));
    await expect.poll(() => paintedPairs(diagram)).toEqual(state);
    expect(await geometry(diagram)).toEqual(originalGeometry);
    placements.push(await paintedLabelBounds(diagram));
  }
  const finalPlacement = placements[3];
  for (const placement of placements) {
    for (const [label, bounds] of Object.entries(placement)) expect(bounds).toEqual(finalPlacement[label]);
  }
  const finalPaint = await paintedSvg(diagram.locator("svg:visible"));
  for (const state of [laterLabel, matching, initial]) {
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => paintedPairs(diagram)).toEqual(state);
    expect(await geometry(diagram)).toEqual(originalGeometry);
    for (const [label, bounds] of Object.entries(await paintedLabelBounds(diagram))) expect(bounds).toEqual(finalPlacement[label]);
  }
  for (let click = 0; click < 4; click++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/23$/);
  await page.goto("24");
  const reference = page.locator(".slidev-page-24 .bound-text-reference svg");
  await expect(reference).toHaveCount(1);
  expect(finalPaint).toBe(await paintedSvg(reference));
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("roles on either member warn and keep the pair's original appearance through reveals", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("23");
  const diagram = page.locator(".slidev-page-23 .figuro-diagram");
  await expect(diagram.locator("svg:visible")).toHaveCount(1);
  await expect.poll(() => paintedPairs(diagram)).toEqual(initial);
  for (const state of [matching, laterLabel, final]) {
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => paintedPairs(diagram)).toEqual(state);
  }
  const finalPaint = await paintedSvg(diagram.locator("svg:visible"));
  for (const [id, role] of [
    ["matching-box", "service"], ["later-label", "note"], ["later-container", "service"],
    ["text-first", "note"], ["arrow-label", "note"],
  ]) {
    expect(warnings.some(message => message.includes("bound-text.excalidraw") && message.includes(`element "${id}"`)
      && message.includes(`role "${role}"`) && message.includes("retaining original appearance"))).toBe(true);
  }
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => paintedPairs(diagram)).toEqual(laterLabel);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => paintedPairs(diagram)).toEqual(final);
  expect(await paintedSvg(diagram.locator("svg:visible"))).toBe(finalPaint);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/24$/);
  const reference = page.locator(".slidev-page-24 .bound-text-reference svg");
  await expect(reference).toHaveCount(1);
  expect(finalPaint).toBe(await paintedSvg(reference));
  expect(await readFile(drawing, "utf8")).toBe(before);
});
