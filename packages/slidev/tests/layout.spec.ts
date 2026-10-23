import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

test("opt-in main/subtext fits a bound label and stays fixed through Structured reveals", async ({ page }) => {
  const drawing = new URL("./fixtures/deck/drawings/layout.excalidraw", import.meta.url);
  const before = await readFile(drawing, "utf8");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("42");
  const diagram = page.locator(".slidev-page-42 .figuro-diagram");
  const svg = diagram.locator("svg:visible");
  await expect(svg).toHaveCount(1);
  const main = svg.locator('[data-figuro-text-part="main"]');
  const sub = svg.locator('[data-figuro-text-part="sub"]');
  await expect(main).toHaveText(["A long title that", "wraps"]);
  await expect(sub).toHaveText("realm city picks");
  const label = svg.locator('[data-figuro-label="label"]');
  const placement = await label.boundingBox();
  const viewBox = await svg.getAttribute("viewBox");
  expect(await main.first().evaluate(node => getComputedStyle(node).fontWeight)).toBe("700");
  const sizes = await svg.evaluate(node => ["main", "sub"].map(part => parseFloat(getComputedStyle(node.querySelector(`[data-figuro-text-part="${part}"]`)!).fontSize)));
  expect(sizes[1]).toBeCloseTo(sizes[0] * .78);
  const bounds = await svg.evaluate(node => {
    const label = node.querySelector('[data-figuro-label="label"]')!.getBoundingClientRect();
    const shape = node.querySelector('[fill="#e7f5ff"]')!.getBoundingClientRect();
    return { label: label.toJSON(), shape: shape.toJSON() };
  });
  expect(bounds.label.left).toBeGreaterThan(bounds.shape.left);
  expect(bounds.label.right).toBeLessThan(bounds.shape.right);
  expect(bounds.label.top).toBeGreaterThan(bounds.shape.top);
  expect(bounds.label.bottom).toBeLessThan(bounds.shape.bottom);
  const later = svg.locator('text').filter({ hasText: /^Later$/ });
  expect(await isPainted(later)).toBe(false);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => isPainted(diagram.locator("svg:visible text").filter({ hasText: /^Later$/ }))).toBe(true);
  expect(await diagram.locator("svg:visible").getAttribute("viewBox")).toBe(viewBox);
  expect(await diagram.locator('svg:visible [data-figuro-label="label"]').boundingBox()).toEqual(placement);
  await page.keyboard.press("ArrowLeft");
  expect(await diagram.locator('svg:visible [data-figuro-label="label"]').boundingBox()).toEqual(placement);
  expect(errors).toEqual([]);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("text sections are independent of Layout, honor CSS, and preserve literal markers by default", async ({ page }) => {
  await page.goto("43");
  const svg = page.locator(".slidev-page-43 .figuro-diagram svg:visible");
  const main = svg.locator('[data-figuro-text-part="main"]');
  const sub = svg.locator('[data-figuro-text-part="sub"]');
  await expect(main.first()).toBeAttached();
  expect((await main.allTextContents()).join(" ")).toBe("A long title that wraps");
  expect((await sub.allTextContents()).join(" ")).toBe("realm city picks");
  expect(await sub.first().evaluate(node => getComputedStyle(node).fill)).toBe("rgb(104, 115, 133)");
  const bounds = await svg.evaluate(node => {
    const label = node.querySelector('[data-figuro-label="label"]')!.getBoundingClientRect();
    const shape = node.querySelector('[fill="#e7f5ff"]')!.getBoundingClientRect();
    return { label: label.toJSON(), shape: shape.toJSON() };
  });
  expect(bounds.label.top).toBeGreaterThan(bounds.shape.top);
  expect(bounds.label.bottom).toBeLessThan(bounds.shape.bottom);
  expect(bounds.label.left).toBeGreaterThan(bounds.shape.left);
  expect(bounds.label.right).toBeLessThan(bounds.shape.right);
  expect((bounds.label.top + bounds.label.bottom) / 2).toBeCloseTo((bounds.shape.top + bounds.shape.bottom) / 2, 0);
  expect(await svg.locator('a[href*="figuro.invalid"]').count()).toBe(0);
  await page.goto("44");
  const original = page.locator(".slidev-page-44 .figuro-diagram svg:visible");
  await expect(original.locator("text").filter({ hasText: /^— realm city picks$/ })).toHaveCount(1);
  await expect(original.locator("[data-figuro-text-part]")).toHaveCount(0);
});

test("horizontal and vertical arrow sections stay readable with masks, links, and reveals", async ({ page }) => {
  await page.goto("45");
  const diagram = page.locator(".slidev-page-45 .figuro-diagram");
  const svg = diagram.locator("svg:visible");
  await expect(svg.locator('[data-figuro-label="horizontal-label"] [data-figuro-text-part="main"]')).toHaveText("Connect");
  const horizontal = svg.locator('[data-figuro-label="horizontal-label"]');
  expect((await horizontal.boundingBox())!.height).toBeGreaterThan(20);
  const opacities = await horizontal.locator("text").evaluateAll(nodes => nodes.map(node => {
    let opacity = parseFloat(getComputedStyle(node).fillOpacity);
    for (let ancestor: Element | null = node; ancestor && ancestor.localName !== "svg"; ancestor = ancestor.parentElement) opacity *= parseFloat(getComputedStyle(ancestor).opacity);
    return opacity;
  }));
  expect(opacities).toEqual([.5, .375]);
  await expect(svg.locator('a[href="https://example.com/label"]')).toHaveCount(1);
  await expect(svg.locator('a[href*="figuro.invalid"]')).toHaveCount(0);
  const vertical = svg.locator('[data-figuro-label="vertical-label"]');
  expect(await isPainted(vertical.locator("text"))).toBe(false);
  const masks = await svg.locator("mask").count();
  expect(masks).toBe(2);
  const geometry = await svg.getAttribute("viewBox");
  await page.keyboard.press("ArrowRight");
  const revealed = diagram.locator('svg:visible [data-figuro-label="vertical-label"]');
  await expect(revealed.locator('[data-figuro-text-part="main"]')).toHaveText("Vertical");
  expect(await isPainted(revealed.locator("text"))).toBe(true);
  expect((await revealed.boundingBox())!.height).toBeGreaterThan(20);
  expect(await diagram.locator("svg:visible").getAttribute("viewBox")).toBe(geometry);
  const diamond = diagram.locator('svg:visible [data-figuro-label="diamond-label"]');
  const placement = await diamond.evaluate(node => {
    const text = node.getBoundingClientRect();
    const bounds = node.closest("svg")!.querySelector('[fill="#e7f5ff"]')!.getBoundingClientRect();
    return { text: text.toJSON(), shape: bounds.toJSON() };
  });
  expect(placement.text.left).toBeGreaterThan(placement.shape.left + placement.shape.width / 4);
  expect(placement.text.top).toBeGreaterThan(placement.shape.top + placement.shape.height / 4);
  await expect(diagram.locator('svg:visible [data-figuro-label="protected-label"]')).toHaveCount(0);
  await expect(diagram.locator("svg:visible text").filter({ hasText: /^Keep placement$/ })).toHaveCount(1);
});

test("Tidy aligns the rendered row and leaves its plain bound labels intact", async ({ page }) => {
  await page.goto("41?clicks=1");
  const svg = page.locator(".slidev-page-41 .figuro-diagram svg:visible");
  await expect(svg).toHaveCount(1);
  const centers = await svg.evaluate(node => ["#e7f5ff", "#d3f9d8"].map(fill => {
    const bounds = node.querySelector(`[fill="${fill}"]`)!.getBoundingClientRect();
    return bounds.top + bounds.height / 2;
  }));
  expect(centers[0]).toBeCloseTo(centers[1], 5);
  await expect(svg.locator("text").filter({ hasText: /^— realm city picks$/ })).toHaveCount(1);
});

test("Structured renders a straight parallel arrow beside an unbound annotation through reveals", async ({ page }) => {
  await page.goto("46");
  const diagram = page.locator(".slidev-page-46 .figuro-diagram");
  const svg = diagram.locator("svg:visible");
  await expect(svg).toHaveCount(1);
  const geometry = await svg.getAttribute("viewBox");
  await page.keyboard.press("ArrowRight");
  const shafts = diagram.locator('svg:visible path[stroke="#13579b"]');
  await expect.poll(() => isPainted(shafts)).toBe(true);
  const deviation = await shafts.evaluateAll(nodes => {
    const paths = nodes as SVGPathElement[];
    const shaft = paths.sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
    const xs = Array.from({ length: 101 }, (_, index) => shaft.getPointAtLength(shaft.getTotalLength() * index / 100).x);
    return Math.max(...xs) - Math.min(...xs);
  });
  expect(deviation).toBeLessThan(1e-5);
  expect(await diagram.locator("svg:visible").getAttribute("viewBox")).toBe(geometry);
  await page.keyboard.press("ArrowLeft");
  expect(await diagram.locator("svg:visible").getAttribute("viewBox")).toBe(geometry);
});
