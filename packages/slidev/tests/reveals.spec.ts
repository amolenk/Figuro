import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

const drawing = new URL("./fixtures/deck/drawings/reveals.excalidraw", import.meta.url);

async function svgFrame(diagram: Locator) {
  return diagram.locator("svg:visible").evaluate(svg => ({
    width: svg.getAttribute("width"), height: svg.getAttribute("height"), viewBox: svg.getAttribute("viewBox"),
    bounds: svg.getBoundingClientRect().toJSON(),
  }));
}

test("ordinary elements reveal together at distinct steps without changing framing or source", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
  await page.goto("4");
  const diagram = page.locator(".slidev-page-4 .figuro-diagram");
  await expect(diagram.locator("svg").first()).toBeVisible();
  const text = (value: string) => diagram.locator("svg text").filter({ hasText: value });
  const initial = text("Initial text");
  const shared = text("Shared step");
  const box = diagram.locator('svg [fill="#aabbcc"]');
  const ellipse = diagram.locator('svg [fill="#aaddbb"]');
  const diamond = diagram.locator('svg [fill="#ddaaff"]');

  await expect.poll(() => isPainted(initial)).toBe(true);
  await expect.poll(() => isPainted(text("Omitted step"))).toBe(true);
  await expect.poll(() => isPainted(box)).toBe(true);
  expect(await isPainted(shared)).toBe(false);
  expect(await isPainted(ellipse)).toBe(false);
  expect(await isPainted(diamond)).toBe(false);

  const frame = await svgFrame(diagram);
  const initialBounds = await initial.locator("visible=true").boundingBox();

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => isPainted(shared)).toBe(true);
  await expect.poll(() => isPainted(ellipse)).toBe(true);
  await expect(page).toHaveURL(/\/4\?clicks=1$/);
  expect(await isPainted(diamond)).toBe(false);
  expect(await svgFrame(diagram)).toEqual(frame);
  expect(await initial.locator("visible=true").boundingBox()).toEqual(initialBounds);

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => isPainted(diamond)).toBe(true);
  await expect(page).toHaveURL(/\/4\?clicks=2$/);
  expect(await svgFrame(diagram)).toEqual(frame);
  expect(await initial.locator("visible=true").boundingBox()).toEqual(initialBounds);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => isPainted(diamond)).toBe(false);
  expect(await isPainted(shared)).toBe(true);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => isPainted(shared)).toBe(false);
  expect(await isPainted(ellipse)).toBe(false);
  expect(await isPainted(initial)).toBe(true);
  expect(await svgFrame(diagram)).toEqual(frame);

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => isPainted(shared)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => isPainted(diamond)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/5$/);
  await expect(page.getByRole("heading", { name: "After reveals" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/4\?clicks=2$/);
  await expect.poll(() => isPainted(diamond)).toBe(true);

  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("normal clicks register before asynchronous SVG export completes", async ({ page }) => {
  let releaseFonts: () => void = () => {};
  const fontsReady = new Promise<void>(resolve => { releaseFonts = resolve; });
  let fontRequested: () => void = () => {};
  const fontRequest = new Promise<void>(resolve => { fontRequested = resolve; });
  await page.route("**/*.woff2", async route => {
    fontRequested();
    await fontsReady;
    await route.continue();
  });
  try {
    await page.goto("4");
    await fontRequest;
    const diagram = page.locator(".slidev-page-4 .figuro-diagram");
    await expect(diagram.getByRole("status")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/4\?clicks=1$/);
    releaseFonts();
    const shared = diagram.locator("svg text").filter({ hasText: "Shared step" });
    await expect.poll(() => isPainted(shared)).toBe(true);
    expect(await isPainted(diagram.locator('svg [fill="#ddaaff"]'))).toBe(false);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => isPainted(shared)).toBe(false);
  } finally {
    releaseFonts();
  }
});
