import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";

const drawing = new URL("./fixtures/deck/drawings/ordinary.excalidraw", import.meta.url);

const strokeGeometry = (svg: Locator) => svg.locator('path[stroke]:not([stroke="none"])')
  .evaluateAll(paths => paths.map(path => path.getAttribute("d")));

test("a deck-relative stylesheet uses the CSS cascade and only styles the selected diagram", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  await page.goto("6");
  const styled = page.locator(".slidev-page-6 .styled-example .figuro-diagram");
  const unstyled = page.locator(".slidev-page-6 .unstyled-example .figuro-diagram");
  await expect(styled.locator("svg text")).toHaveText("Ordinary drawing");
  await expect(styled.locator("svg text")).toHaveCSS("fill", "rgb(102, 51, 153)");
  await expect(unstyled.locator("svg text")).toHaveCSS("fill", "rgb(18, 52, 86)");
  const textSize = (diagram: typeof styled) => diagram.locator("svg text").evaluate(text => {
    const { width, height } = text.getBoundingClientRect();
    return { width, height };
  });
  const styledSize = await textSize(styled);
  const originalSize = await textSize(unstyled);
  expect(styledSize.width).toBeCloseTo(originalSize.width, 2);
  expect(styledSize.height).toBeCloseTo(originalSize.height, 2);
  for (const diagram of [styled, unstyled]) {
    await expect(diagram.locator('svg [fill="#aabbcc"]')).toHaveCSS("fill", "rgb(170, 187, 204)");
    await expect(diagram.locator('svg [stroke="#123456"]').first()).toHaveCSS("stroke", "rgb(18, 52, 86)");
    await expect(diagram.locator('svg [fill="#fffdf8"]')).toHaveCSS("fill", "rgb(255, 253, 248)");
  }
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("a selected stylesheet applies through forward and backward reveal navigation", async ({ page }) => {
  await page.goto("7");
  const diagram = page.locator(".slidev-page-7 .figuro-diagram");
  const initial = diagram.locator("svg:visible text").filter({ hasText: "Initial text" });
  await expect(initial).toHaveCSS("fill", "rgb(102, 51, 153)");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/7\?clicks=1$/);
  await expect(diagram.locator("svg:visible text").filter({ hasText: "Shared step" })).toHaveCSS("fill", "rgb(102, 51, 153)");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/7\?clicks=2$/);
  await expect(initial).toHaveCSS("fill", "rgb(102, 51, 153)");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/7\?clicks=1$/);
  await expect(initial).toHaveCSS("fill", "rgb(102, 51, 153)");
});

test("stylesheet-defined fonts load and style SVG text", async ({ page }) => {
  await page.goto("8");
  const text = page.locator(".slidev-page-8 .figuro-diagram svg text");
  await expect(text).toHaveText("Ordinary drawing");
  await expect(text).toHaveCSS("font-family", '"Presentation font", monospace');
  const loaded = await page.evaluate(async () => (await document.fonts.load('20px "Presentation font"')).length);
  expect(loaded).toBeGreaterThan(0);
  await expect(text).toHaveCSS("fill", "rgb(18, 52, 86)");
});

test("a roughness attribute changes exported geometry in every reveal alongside CSS without changing the drawing", async ({ page }) => {
  const source = new URL("./fixtures/deck/drawings/roughness.excalidraw", import.meta.url);
  const before = await readFile(source, "utf8");
  await page.goto("40");
  const styled = page.locator(".slidev-page-40 .roughness-styled svg");
  const original = page.locator(".slidev-page-40 .roughness-original svg");
  const colorsOnly = page.locator(".slidev-page-40 .roughness-colors-only svg");
  const smoothReference = page.locator('[data-roughness-reference="0"] svg');
  const originalReference = page.locator('[data-roughness-reference="original"] svg');
  await expect(smoothReference).toHaveCount(1);
  await expect(styled).toHaveCount(2);
  const smooth = await strokeGeometry(smoothReference);
  const sketchy = await strokeGeometry(originalReference);
  expect(smooth).not.toEqual(sketchy);
  for (let state = 0; state < 2; state++) {
    expect(await strokeGeometry(styled.nth(state))).toEqual(smooth);
    expect(await strokeGeometry(original.nth(state))).toEqual(sketchy);
    expect(await strokeGeometry(colorsOnly.nth(state))).toEqual(sketchy);
    await expect(styled.nth(state).locator('[stroke="#123456"]')).toHaveCSS("stroke", "rgb(34, 85, 170)");
  }
  const viewBox = await styled.first().getAttribute("viewBox");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/40\?clicks=1$/);
  expect(await strokeGeometry(styled.filter({ visible: true }))).toEqual(smooth);
  await expect(styled.filter({ visible: true })).toHaveAttribute("viewBox", viewBox!);
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/40(?:\?clicks=0)?$/);
  expect(await strokeGeometry(styled.filter({ visible: true }))).toEqual(smooth);
  expect(await readFile(source, "utf8")).toBe(before);
});

test("named roughness overrides layout defaults in every reveal", async ({ page }) => {
  await page.goto("40");
  const reference = (name: string) => page.locator(`.slidev-page-40 [data-roughness-reference="${name}"] svg`);
  await expect(reference("2")).toHaveCount(1);
  for (const [name, expected] of [
    ["tidy-default", "original"], ["structured-default", "0"],
    ["structured-original", "original"], ["tidy-smooth", "0"],
    ["original-sketchy", "1"], ["structured-rough", "2"],
  ]) {
    const states = page.locator(`.slidev-page-40 [data-roughness-case="${name}"] svg`);
    await expect(states).toHaveCount(2);
    const geometry = await strokeGeometry(reference(expected));
    for (let state = 0; state < 2; state++) expect(await strokeGeometry(states.nth(state)), name).toEqual(geometry);
  }
});

test("changing roughness and layout re-exports at the current reveal with explicit modes taking precedence", async ({ page }) => {
  await page.goto("47?clicks=1");
  const diagram = page.locator(".slidev-page-47 .roughness-controls");
  const reference = (name: string) => page.locator(`.slidev-page-47 [data-roughness-reference="${name}"] svg`);
  await expect(reference("2")).toHaveCount(1);
  const states = diagram.locator("svg");
  await expect(states).toHaveCount(2);
  const viewBox = await states.first().getAttribute("viewBox");
  for (const [layout, roughness, expected] of [
    ["original", "", "original"], ["tidy", "", "original"], ["structured", "", "0"],
    ["structured", "original", "original"], ["structured", "sketchy", "1"],
    ["original", "sketchy", "1"], ["tidy", "rough", "2"], ["tidy", "smooth", "0"],
    ["tidy", "", "original"], ["structured", "", "0"],
  ]) {
    await test.step(`${layout} layout, roughness ${roughness || "default"}`, async () => {
      await diagram.getByRole("combobox", { name: "Layout", exact: true }).selectOption(layout);
      await diagram.getByRole("combobox", { name: "Roughness", exact: true }).selectOption(roughness);
      await expect(states).toHaveCount(2);
      const geometry = await strokeGeometry(reference(expected));
      for (let state = 0; state < 2; state++) await expect.poll(() => strokeGeometry(states.nth(state))).toEqual(geometry);
      await expect(diagram.locator("svg:visible")).toHaveAttribute("viewBox", viewBox!);
      await expect(page).toHaveURL(/\/47\?clicks=1$/);
    });
  }
});
