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

async function expectInside(content: Locator, container: Locator) {
  // Slidev updates its presentation transform asynchronously on window resize.
  await expect(async () => {
    const bounds = await content.boundingBox();
    const available = await container.boundingBox();
    expect(bounds).not.toBeNull();
    expect(available).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(available!.x - 1);
    expect(bounds!.y).toBeGreaterThanOrEqual(available!.y - 1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(available!.x + available!.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(available!.y + available!.height + 1);
  }).toPass({ timeout: 15_000 });
}

for (const [slide, name, source] of [
  [33, "tall", "tall-reveals"],
  [34, "styled tall", "tall-reveals"],
  [35, "wide", "wide-reveals"],
  [36, "styled wide", "wide-reveals"],
] as const) {
  test(`${name} drawings fit the slide from the initial state through later reveals`, async ({ page }) => {
    const drawing = new URL(`./fixtures/deck/drawings/${source}.excalidraw`, import.meta.url);
    const before = await readFile(drawing, "utf8");
    await page.goto(String(slide));
    const layout = page.locator(`.slidev-page-${slide} .slidev-layout`);
    const diagram = layout.locator(".figuro-diagram");
    const svg = diagram.locator("svg:visible");
    const initial = svg.locator('[fill="#aabbcc"]');
    const middle = svg.locator('[fill="#aaddbb"]');
    const last = svg.locator('[fill="#ddaaff"]');
    await expect(svg).toBeVisible();
    await expect.poll(() => isPainted(initial)).toBe(true);
    expect(await isPainted(middle)).toBe(false);
    expect(await isPainted(last)).toBe(false);
    await expectInside(svg, diagram);
    await expectInside(svg, layout);

    const frame = await svgFrame(diagram);
    const initialBounds = await initial.boundingBox();
    for (const [click, revealed] of [[1, middle], [2, last]] as const) {
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(new RegExp(`/${slide}\\?clicks=${click}$`));
      await expect.poll(() => isPainted(revealed)).toBe(true);
      await expectInside(revealed, diagram);
      await expectInside(revealed, layout);
      expect(await svgFrame(diagram)).toEqual(frame);
      expect(await initial.boundingBox()).toEqual(initialBounds);
    }

    // Resizing the presentation still fits the complete scene with its original
    // proportions, rather than stretching shapes to match the slide's aspect.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(async () => (await svgFrame(diagram)).bounds.width).not.toBe(frame.bounds.width);
    await expectInside(svg, diagram);
    await expectInside(last, layout);
    const initialAfterResize = await initial.boundingBox();
    expect(initialAfterResize!.width / initialAfterResize!.height)
      .toBeCloseTo(initialBounds!.width / initialBounds!.height, 2);
    const resizedFrame = await svgFrame(diagram);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => isPainted(last)).toBe(false);
    expect(await svgFrame(diagram)).toEqual(resizedFrame);
    expect(await initial.boundingBox()).toEqual(initialAfterResize);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => isPainted(last)).toBe(true);
    await expectInside(last, layout);
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/${slide + 1}$`));
    expect(await readFile(drawing, "utf8")).toBe(before);
  });
}

for (const [slide, name] of [[37, "static"], [38, "styled static in an allocated area"]] as const) {
  test(`${name} tall drawings fit their available area`, async ({ page }) => {
    await page.goto(String(slide));
    const layout = page.locator(`.slidev-page-${slide} .slidev-layout`);
    const diagram = layout.locator(".figuro-diagram");
    const svg = diagram.locator("svg");
    await expect(svg).toBeVisible();
    await expect.poll(() => isPainted(svg.locator('[fill="#ddaaff"]'))).toBe(true);
    await expectInside(svg, diagram);
    await expectInside(svg, layout);
    if (slide === 38) await expectInside(svg, layout.locator(".diagram-area"));
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/${slide + 1}$`));
  });
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
