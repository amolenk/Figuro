import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const drawing = new URL("./fixtures/deck/drawings/ordinary.excalidraw", import.meta.url);

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
