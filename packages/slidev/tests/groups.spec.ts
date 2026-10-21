import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

const drawing = new URL("./fixtures/deck/drawings/groups.excalidraw", import.meta.url);
const members = [
  '[stroke="#e03131"]', '[stroke="#9c36b5"]', '[fill="#b2f2bb"]',
  'text', '[fill="#ffec99"]', '[fill="#99e9f2"]',
];
const initial = [true, true, false, false, false, false];
const middle = [true, true, true, false, true, false];
const final = [true, true, true, true, true, true];

async function paintedMembers(svg: Locator) {
  return Promise.all(members.map(selector => isPainted(svg.locator(selector))));
}

async function geometry(svg: Locator) {
  return svg.evaluate(node => ({ viewBox: node.getAttribute("viewBox"), bounds: node.getBoundingClientRect().toJSON() }));
}

// Compare painted output with the public Excalidraw export, including native
// rough strokes, rotation, multiline text, and the member's original opacity.
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

async function verifyReveals(page: Page, svg: Locator, slide: number) {
  await expect(svg).toHaveCount(1);
  await expect.poll(() => paintedMembers(svg)).toEqual(initial);
  const originalGeometry = await geometry(svg);
  const paintings = [await paintedSvg(svg)];
  for (const [index, state] of [middle, final].entries()) {
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/${slide}\\?clicks=${index + 1}$`));
    await expect.poll(() => paintedMembers(svg)).toEqual(state);
    expect(await geometry(svg)).toEqual(originalGeometry);
    paintings.push(await paintedSvg(svg));
  }
  for (const [index, state] of [middle, initial].entries()) {
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => paintedMembers(svg)).toEqual(state);
    expect(await paintedSvg(svg)).toBe(paintings[1 - index]);
    expect(await geometry(svg)).toEqual(originalGeometry);
  }
  return paintings;
}

test("nested groups retain native visuals while members follow independent reveal steps", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("29");
  const svg = page.locator(".slidev-page-29 .figuro-diagram svg:visible");
  const paintings = await verifyReveals(page, svg, 29);
  await expect(svg.locator('a[href="https://example.com/group-member"]')).toHaveCount(1);
  for (let click = 0; click < 3; click++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/30$/);
  const reference = page.locator(".slidev-page-30 .groups-reference svg");
  await expect(reference).toHaveCount(1);
  expect(paintings[2]).toBe(await paintedSvg(reference));
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("grouped member roles warn and retain original appearance without role inheritance", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("31");
  const svg = page.locator(".slidev-page-31 .figuro-diagram svg:visible");
  const paintings = await verifyReveals(page, svg, 31);
  for (const [id, role] of [["early-member", "member"], ["late-member", "label"]]) {
    expect(warnings.some(message => message.includes("groups.excalidraw") && message.includes(`element "${id}"`)
      && message.includes(`role "${role}"`) && message.includes("retaining original appearance"))).toBe(true);
  }
  // Unannotated group peers must not receive inherited roles or diagnostics.
  expect(warnings.some(message => ["initial-member", "zero-member", "shared-step-member", "other-late-member"]
    .some(id => message.includes(`element "${id}"`)))).toBe(false);
  for (let click = 0; click < 3; click++) await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/32$/);
  // Every styled state must match the unstyled deck, including group peers with
  // no role. This catches both unsupported hooks and accidental inheritance.
  await page.goto("29");
  const original = page.locator(".slidev-page-29 .figuro-diagram svg:visible");
  await expect(original).toHaveCount(1);
  for (const [index, state] of [initial, middle, final].entries()) {
    if (index) await page.keyboard.press("ArrowRight");
    await expect.poll(() => paintedMembers(original)).toEqual(state);
    expect(await paintedSvg(original)).toBe(paintings[index]);
  }
  await page.keyboard.press("ArrowRight");
  const reference = page.locator(".slidev-page-30 .groups-reference svg");
  await expect(reference).toHaveCount(1);
  expect(await paintedSvg(reference)).toBe(paintings[2]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});
