import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const drawing = new URL("./fixtures/deck/drawings/roles.excalidraw", import.meta.url);

test("semantic roles style matching shapes and unbound text without changing other properties or source", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  await page.goto("9");
  const diagram = page.locator(".slidev-page-9 .figuro-diagram");
  await expect(diagram.locator('svg:visible [fill="#aabbcc"]')).toHaveCSS("fill", "rgb(221, 136, 0)");
  for (const line of ["Important note", "Second line"]) {
    await expect(diagram.locator("svg:visible text").filter({ hasText: line })).toHaveCSS("fill", "rgb(102, 51, 153)");
  }
  for (const label of ["No role", "Unmatched role", "Unrecognized role"]) {
    await expect(diagram.locator("svg:visible text").filter({ hasText: label })).toHaveCSS("fill", "rgb(18, 52, 86)");
  }
  await expect(diagram.locator('svg [stroke="#123456"]').first()).toHaveCSS("stroke", "rgb(18, 52, 86)");
  await expect(diagram.locator('svg:visible [fill="#fffdf8"]')).toHaveCSS("fill", "rgb(255, 253, 248)");
  const effectiveOpacity = await diagram.locator('svg:visible [fill="#aabbcc"]').evaluate(node => {
    let opacity = 1;
    for (let current: Element | null = node; current; current = current.parentElement) {
      opacity *= Number(getComputedStyle(current).opacity);
    }
    return opacity;
  });
  expect(effectiveOpacity).toBe(0.5);
  await page.goto("10");
  const original = page.locator(".slidev-page-10 .figuro-diagram");
  await expect(original.locator('svg:visible [fill="#aabbcc"]')).toHaveCSS("fill", "rgb(170, 187, 204)");
  await expect(original.locator("svg:visible text").filter({ hasText: "Important note" })).toHaveCSS("fill", "rgb(18, 52, 86)");
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("mixed scenes style standalone paths while bound and grouped content retain their appearance", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("9");
  const diagram = page.locator(".slidev-page-9 .figuro-diagram");
  await expect(diagram.locator('svg:visible [fill="#aabbcc"]')).toHaveCSS("fill", "rgb(221, 136, 0)");
  await expect(diagram.locator('svg:visible [fill="#bbccdd"]')).toHaveCSS("fill", "rgb(187, 204, 221)");
  await expect(diagram.locator('svg:visible [fill="#ccddee"]')).toHaveCSS("fill", "rgb(204, 221, 238)");
  await expect(diagram.locator("svg:visible text").filter({ hasText: "Bound label" })).toHaveCSS("fill", "rgb(18, 52, 86)");
  for (const color of ["#112233", "#223344"]) {
    await expect(diagram.locator(`svg:visible [stroke="${color}"]`).first()).toHaveCSS("stroke", "rgb(0, 136, 85)");
  }
  await expect(diagram.locator('svg:visible [fill="#334455"]')).toHaveCSS("fill", "rgb(102, 51, 153)");
  expect(warnings.some(message => message.includes("grouped-box") && message.includes("not supported"))).toBe(true);
  expect(warnings.some(message => message.includes("bound-box") && message.includes("not supported"))).toBe(true);
  expect(warnings.some(message => message.includes("bound-label") && message.includes("not supported"))).toBe(true);
});

test("role styling remains associated with each element through reveals, rotation, rough paths, and links", async ({ page }) => {
  const before = await readFile(drawing, "utf8");
  await page.goto("9");
  const diagram = page.locator(".slidev-page-9 .figuro-diagram");
  const text = (label: string) => diagram.locator("svg:visible text").filter({ hasText: label });
  const diamond = () => diagram.locator('svg:visible [fill="#ddaaff"]');
  const ellipse = () => diagram.locator('svg:visible [fill="#aaddbb"]');
  await expect(text("Important note")).toHaveCSS("fill", "rgb(102, 51, 153)");
  await expect(diamond()).toHaveCSS("fill", "rgb(221, 136, 0)");
  await expect(diamond()).toHaveCSS("fill-opacity", "0");
  await expect(ellipse()).toHaveCSS("fill-opacity", "0");
  const frame = await diagram.locator("svg:visible").getAttribute("viewBox");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/9\?clicks=1$/);
  await expect(diamond()).toHaveCSS("fill-opacity", "1");
  await expect(text("Revealed note")).toHaveCSS("fill", "rgb(102, 51, 153)");
  await expect(text("Revealed note")).toHaveCSS("fill-opacity", "1");
  await expect(ellipse()).toHaveCSS("fill-opacity", "0");
  const link = diagram.locator('svg:visible a[href="https://example.com/diamond"]');
  await expect(link).toHaveCount(1);
  await expect(link.locator('[fill="#ddaaff"]')).toHaveCSS("fill", "rgb(221, 136, 0)");
  await expect(diagram.locator('svg a[href*="figuro.invalid"]')).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/9\?clicks=2$/);
  await expect(ellipse()).toHaveCSS("fill-opacity", "1");
  await expect(ellipse()).toHaveCSS("fill", "rgb(170, 221, 187)");
  await expect(ellipse()).toHaveCSS("stroke", "rgb(0, 136, 85)");
  expect(await diagram.locator("svg:visible").getAttribute("viewBox")).toBe(frame);
  await page.keyboard.press("ArrowLeft");
  await expect(ellipse()).toHaveCSS("fill-opacity", "0");
  await expect(diamond()).toHaveCSS("fill", "rgb(221, 136, 0)");
  await page.keyboard.press("ArrowLeft");
  await expect(diamond()).toHaveCSS("fill-opacity", "0");
  await expect(text("Important note")).toHaveCSS("fill", "rgb(102, 51, 153)");
  expect(await readFile(drawing, "utf8")).toBe(before);
});
