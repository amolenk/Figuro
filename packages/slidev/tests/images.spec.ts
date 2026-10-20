import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";

const drawing = new URL("./fixtures/deck/drawings/images.excalidraw", import.meta.url);
const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];
const yellow = [255, 255, 0, 255];
const white = [255, 255, 255, 255];
const initialPixels = {
  initialTopLeft: red, initialTopRight: green, initialBottomLeft: blue, initialBottomRight: yellow,
  croppedTop: white, croppedBottom: white, outsideCrop: white,
  transformedTopLeft: white, transformedTopRight: white, transformedBottomLeft: white, transformedBottomRight: white,
};
const croppedPixels = { ...initialPixels, croppedTop: green, croppedBottom: yellow };
// Horizontal flip followed by a clockwise quarter turn: yellow/green, blue/red.
const finalPixels = {
  ...croppedPixels, transformedTopLeft: yellow, transformedTopRight: green,
  transformedBottomLeft: blue, transformedBottomRight: red,
};

// Sample the painted SVG, including embedded image bytes and presentation CSS.
// Coordinates are in the exported scene, with Excalidraw's 10px export padding.
async function pixels(diagram: Locator) {
  return diagram.locator("svg:visible").evaluate(async node => {
    const svg = node.cloneNode(true) as SVGSVGElement;
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      for (const style of root.querySelectorAll("style")) svg.append(style.cloneNode(true));
    }
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const samples = {
      initialTopLeft: [20, 20], initialTopRight: [60, 20], initialBottomLeft: [20, 60], initialBottomRight: [60, 60],
      croppedTop: [140, 20], croppedBottom: [140, 60], outsideCrop: [180, 20],
      transformedTopLeft: [260, 20], transformedTopRight: [300, 20], transformedBottomLeft: [260, 60], transformedBottomRight: [300, 60],
    };
    return Object.fromEntries(Object.entries(samples).map(([name, [x, y]]) =>
      [name, Array.from(context.getImageData(x + 10, y + 10, 1, 1).data)]));
  });
}

test("embedded images keep their crop, flip, rotation, and independent reveal timing", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
  await page.goto("18");
  const diagram = page.locator(".slidev-page-18 .figuro-diagram");
  await expect(diagram.locator("svg:visible")).toHaveCount(1);
  await expect.poll(() => pixels(diagram)).toEqual(initialPixels);
  const frame = await diagram.locator("svg:visible").evaluate(svg => ({
    viewBox: svg.getAttribute("viewBox"), bounds: svg.getBoundingClientRect().toJSON(),
  }));
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/18\?clicks=1$/);
  await expect.poll(() => pixels(diagram)).toEqual(croppedPixels);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/18\?clicks=2$/);
  await expect.poll(() => pixels(diagram)).toEqual(finalPixels);
  expect(await diagram.locator("svg:visible").evaluate(svg => ({
    viewBox: svg.getAttribute("viewBox"), bounds: svg.getBoundingClientRect().toJSON(),
  }))).toEqual(frame);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => pixels(diagram)).toEqual(croppedPixels);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => pixels(diagram)).toEqual(initialPixels);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/19$/);
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("general CSS styles image output while unsupported image roles warn and keep original appearance", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("19");
  const styled = page.locator(".slidev-page-19 .figuro-diagram");
  await expect(styled.locator("svg:visible")).toHaveCount(1);
  await expect.poll(async () => (await pixels(styled)).initialTopLeft).toEqual([54, 54, 54, 255]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await pixels(styled)).croppedTop).toEqual([182, 182, 182, 255]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await pixels(styled)).transformedTopLeft).toEqual([237, 237, 237, 255]);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await pixels(styled)).transformedTopLeft).toEqual(white);
  await page.goto("20");
  const fallback = page.locator(".slidev-page-20 .figuro-diagram");
  await expect(fallback.locator("svg:visible")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pixels(fallback)).toEqual(finalPixels);
  expect(warnings.some(message => message.includes("images.excalidraw") && message.includes("transformed-image")
    && message.includes('role "photo"') && message.includes("retaining original appearance"))).toBe(true);
  expect(await readFile(drawing, "utf8")).toBe(before);
});
