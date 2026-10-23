import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const drawing = new URL("./fixtures/deck/drawings/ordinary.excalidraw", import.meta.url);

test("a deck-relative ordinary drawing keeps its appearance and source, and takes one slide", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // Slidev catches lazy slide imports, so module-loading failures reach the
  // console rather than pageerror (notably unbundled React's Fragment export).
  page.on("console", message => {
    if (message.type() === "error" && /slide failed to load|\[Figuro\]/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
  await page.goto("1");
  const diagram = page.locator(".slidev-page-1 .figuro-diagram");
  await expect(diagram.locator("svg")).toBeVisible();
  await expect(diagram.locator("svg text")).toHaveText("Ordinary drawing");
  await expect(diagram.locator('svg [fill="#aabbcc"]')).toBeVisible();
  await expect(diagram.locator('svg [stroke="#123456"]')).not.toHaveCount(0);
  await expect(diagram.locator('svg [fill="#fffdf8"]')).toBeVisible();
  await expect(diagram.locator("svg style")).toContainText("data:font/woff2;base64,");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/2$/);
  await expect(page.locator(".slidev-page-2 .figuro-diagram svg text")).toHaveText("Ordinary drawing");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/3$/);
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});
