import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

const drawing = new URL("./fixtures/deck/drawings/frames.excalidraw", import.meta.url);

// Rasterize the displayed SVG so clipping and opacity are checked through
// painted pixels, rather than assuming a particular exporter's node structure.
async function paint(svg: Locator, displayed = false) {
  const screenshot = displayed ? (await svg.screenshot()).toString("base64") : null;
  return svg.evaluate(async (node, screenshot) => {
    const copy = node.cloneNode(true) as SVGSVGElement;
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      for (const style of root.querySelectorAll("style")) copy.append(style.cloneNode(true));
    }
    const image = new Image();
    image.src = screenshot ? `data:image/png;base64,${screenshot}`
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors: Record<string, { count: number; left: number; top: number; right: number; bottom: number }> = {};
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        const color = Array.from(pixels.slice(offset, offset + 3)).join(",");
        const bounds = colors[color] ??= { count: 0, left: x, top: y, right: x, bottom: y };
        bounds.count++;
        bounds.left = Math.min(bounds.left, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.right = Math.max(bounds.right, x);
        bounds.bottom = Math.max(bounds.bottom, y);
      }
    }
    return { colors, data: canvas.toDataURL(), width: canvas.width };
  }, screenshot);
}

async function geometry(svg: Locator) {
  return svg.evaluate(node => ({ viewBox: node.getAttribute("viewBox"), bounds: node.getBoundingClientRect().toJSON() }));
}

async function frameStructure(svg: Locator) {
  return svg.locator('rect[fill="none"], text').evaluateAll(nodes => nodes.map(node => ({
    label: node.textContent, bounds: node.getBoundingClientRect().toJSON(),
    stroke: getComputedStyle(node).stroke, fill: getComputedStyle(node).fill,
    opacity: getComputedStyle(node).opacity,
  })));
}

async function expectState(svg: Locator, visible: string[]) {
  const output = await paint(svg);
  // Observe the live deck too: fragment IDs can resolve to other reveal SVGs
  // in the same document, an interaction isolated rasterization cannot catch.
  const displayed = await paint(svg, true);
  const scale = displayed.width / await svg.evaluate(node => (node as SVGSVGElement).viewBox.baseVal.width);
  // The known scene clips the first two 140px rectangles to 80px, and the
  // second frame clips a 200x100px child to 160x50px. Its 70% opacity is retained.
  for (const [color, width, height] of [
    ["224,49,49", 80, 60], ["47,158,68", 80, 60],
    ["94,155,212", 160, 50], ["240,140,0", 120, 80],
  ] as const) {
    const bounds = output.colors[color];
    if (!visible.includes(color)) expect(bounds).toBeUndefined();
    else {
      expect(bounds, `painted ${color}`).toBeDefined();
      // Ignore at most two edge pixels covered by antialiasing/frame outlines.
      expect(bounds.right - bounds.left + 1).toBeGreaterThanOrEqual(width - 2);
      expect(bounds.right - bounds.left + 1).toBeLessThanOrEqual(width);
      expect(bounds.bottom - bounds.top + 1).toBeGreaterThanOrEqual(height - 2);
      expect(bounds.bottom - bounds.top + 1).toBeLessThanOrEqual(height);
      const liveBounds = displayed.colors[color];
      expect(liveBounds, `displayed ${color}`).toBeDefined();
      expect(liveBounds.right - liveBounds.left + 1).toBeGreaterThanOrEqual((width - 2) * scale - 2);
      expect(liveBounds.right - liveBounds.left + 1).toBeLessThanOrEqual(width * scale + 2);
      expect(liveBounds.bottom - liveBounds.top + 1).toBeGreaterThanOrEqual((height - 2) * scale - 2);
      expect(liveBounds.bottom - liveBounds.top + 1).toBeLessThanOrEqual(height * scale + 2);
    }
  }
  for (const name of ["First frame", "Second frame", "Empty frame"]) {
    expect(await isPainted(svg.locator("text").filter({ hasText: new RegExp(`^${name}$`) }))).toBe(true);
  }
  return output;
}

test("frames stay present while clipped children reveal within one slide", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("25");
  const svg = page.locator(".slidev-page-25 .figuro-diagram svg:visible");
  await expect(svg).toHaveCount(1);
  const initial = await expectState(svg, ["224,49,49"]);
  const originalGeometry = await geometry(svg);
  const originalStructure = await frameStructure(svg);
  await expect(svg.locator('rect[fill="none"]')).toHaveCount(3);
  expect(await isPainted(svg.locator('rect[fill="none"]'))).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/25\?clicks=1$/);
  const middle = await expectState(svg, ["224,49,49", "47,158,68", "240,140,0"]);
  expect(await geometry(svg)).toEqual(originalGeometry);
  expect(await frameStructure(svg)).toEqual(originalStructure);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/25\?clicks=2$/);
  const final = await expectState(svg, ["224,49,49", "47,158,68", "94,155,212", "240,140,0"]);
  expect(await geometry(svg)).toEqual(originalGeometry);
  expect(await frameStructure(svg)).toEqual(originalStructure);
  for (const state of [middle, initial]) {
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await paint(svg)).data).toBe(state.data);
    expect(await geometry(svg)).toEqual(originalGeometry);
    await expectState(svg, state === middle ? ["224,49,49", "47,158,68", "240,140,0"] : ["224,49,49"]);
  }
  for (let click = 0; click < 3; click++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/26$/);
  const reference = page.locator(".slidev-page-26 .frames-reference svg");
  await expect(reference).toHaveCount(1);
  expect(final.data).toBe((await paint(reference)).data);
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("roles on frames and children warn and retain original clipped appearance", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("27");
  const svg = page.locator(".slidev-page-27 .figuro-diagram svg:visible");
  await expect(svg).toHaveCount(1);
  const initial = await expectState(svg, ["224,49,49"]);
  const originalGeometry = await geometry(svg);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/27\?clicks=1$/);
  const middle = await expectState(svg, ["224,49,49", "47,158,68", "240,140,0"]);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/27\?clicks=2$/);
  const final = await expectState(svg, ["224,49,49", "47,158,68", "94,155,212", "240,140,0"]);
  expect(await geometry(svg)).toEqual(originalGeometry);
  for (const [id, role] of [
    ["first-frame", "frame"], ["second-frame", "frame"],
    ["later-child", "child"], ["second-child", "child"],
  ]) {
    expect(warnings.some(message => message.includes("frames.excalidraw") && message.includes(`element "${id}"`)
      && message.includes(`role "${role}"`) && message.includes("retaining original appearance"))).toBe(true);
  }
  for (const state of [middle, initial]) {
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await paint(svg)).data).toBe(state.data);
    await expectState(svg, state === middle ? ["224,49,49", "47,158,68", "240,140,0"] : ["224,49,49"]);
  }
  for (let click = 0; click < 3; click++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/28$/);
  await page.goto("26");
  const reference = page.locator(".slidev-page-26 .frames-reference svg");
  await expect(reference).toHaveCount(1);
  expect(final.data).toBe((await paint(reference)).data);
  expect(await readFile(drawing, "utf8")).toBe(before);
});
