import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isPainted } from "./painted";

test("malformed metadata falls back only for the affected elements while valid reveals and styles work", async ({ page }) => {
  const drawing = new URL("./fixtures/deck/drawings/malformed-metadata.excalidraw", import.meta.url);
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("11");
  const diagram = page.locator(".slidev-page-11 .figuro-diagram");
  const text = (label: string) => diagram.locator("svg:visible text").filter({ hasText: label });
  for (const label of ["Malformed step", "Malformed role"]) {
    await expect(text(label)).toHaveCSS("fill", "rgb(34, 85, 170)");
    await expect.poll(() => isPainted(text(label))).toBe(true);
  }
  await expect(text("Valid role")).toHaveCSS("fill", "rgb(102, 51, 153)");
  await expect(text("General styling")).toHaveCSS("fill", "rgb(34, 85, 170)");
  const box = () => diagram.locator('svg:visible [fill="#aabbcc"]');
  await expect.poll(() => isPainted(box())).toBe(false);
  const metadataWarnings = () => warnings.filter(message => message.includes("malformed-metadata.excalidraw"));
  expect(metadataWarnings()).toHaveLength(2);
  for (const id of ["bad-step", "bad-role"]) {
    expect(metadataWarnings().filter(message => message.includes(`element "${id}"`) && message.includes("malformed"))).toHaveLength(1);
  }
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/11\?clicks=1$/);
  await expect.poll(() => isPainted(box())).toBe(true);
  await expect(box()).toHaveCSS("fill", "rgb(221, 136, 0)");
  for (const label of ["Malformed step", "Malformed role"]) {
    await expect(text(label)).toHaveCSS("fill", "rgb(34, 85, 170)");
    await expect.poll(() => isPainted(text(label))).toBe(true);
  }
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => isPainted(box())).toBe(false);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/12$/);
  await expect(page.getByRole("heading", { name: "After malformed metadata" })).toBeVisible();
  expect(metadataWarnings()).toHaveLength(2);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("malformed elements retain original colors and usable links without a stylesheet", async ({ page }) => {
  await page.goto("16");
  const diagram = page.locator(".slidev-page-16 .figuro-diagram");
  for (const label of ["Malformed step", "Malformed role", "Valid role", "General styling"]) {
    const text = diagram.locator("svg:visible text").filter({ hasText: label });
    await expect(text).toHaveCSS("fill", "rgb(18, 52, 86)");
    await expect.poll(() => isPainted(text)).toBe(true);
  }
  const link = diagram.locator('svg:visible a[href="https://example.com/original"]');
  await expect(link).toHaveCount(1);
  await expect(link.locator("text")).toHaveText("Malformed step");
  await link.click({ trial: true });
});

test("unknown versions warn once per file and show the whole drawing immediately in its original appearance", async ({ page }) => {
  const drawing = new URL("./fixtures/deck/drawings/unknown-metadata.excalidraw", import.meta.url);
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("13");
  for (const slide of [13, 14]) {
    const diagram = page.locator(`.slidev-page-${slide} .figuro-diagram`);
    for (const label of ["Future version", "Another version", "Malformed v1", "No metadata"]) {
      const text = diagram.locator("svg:visible text").filter({ hasText: label });
      await expect(text).toHaveCSS("fill", slide === 13 ? "rgb(34, 85, 170)" : "rgb(18, 52, 86)");
      await expect.poll(() => isPainted(text)).toBe(true);
    }
    const box = diagram.locator('svg:visible [fill="#aabbcc"]');
    await expect(box).toHaveCSS("fill", "rgb(170, 187, 204)");
    await expect.poll(() => isPainted(box)).toBe(true);
    await expect(diagram.locator('svg:visible [fill="#fffdf8"]')).toHaveCSS("fill", "rgb(255, 253, 248)");
    const scopedWarnings = warnings.filter(message => message.includes("unknown-metadata.excalidraw"));
    expect(scopedWarnings).toHaveLength(1);
    expect(scopedWarnings[0]).toContain("unsupported presentation metadata version");
    expect(scopedWarnings[0]).toContain("original appearance");
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/${slide + 1}$`));
  }
  await expect(page.getByRole("heading", { name: "After unknown metadata" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/14$/);
  expect(warnings.filter(message => message.includes("unknown-metadata.excalidraw"))).toHaveLength(1);
  expect(await readFile(drawing, "utf8")).toBe(before);
});

test("malformed field types and version declarations stay local while additive v1 metadata works", async ({ page }) => {
  const drawing = new URL("./fixtures/deck/drawings/malformed-values.excalidraw", import.meta.url);
  const before = await readFile(drawing, "utf8");
  const warnings: string[] = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.goto("17");
  const diagram = page.locator(".slidev-page-17 .figuro-diagram");
  const text = (label: string) => diagram.locator("svg:visible text").filter({ hasText: label });
  const labels = ["Fractional step", "String step", "Null step", "Unsafe step", "Null role",
    "Null metadata", "Array metadata", "String metadata", "Missing version", "String version", "Fractional version"];
  for (const label of labels) {
    await expect(text(label)).toHaveCSS("fill", "rgb(18, 52, 86)");
    await expect.poll(() => isPainted(text(label))).toBe(true);
  }
  await expect.poll(() => isPainted(text("Valid additive metadata"))).toBe(false);
  const scopedWarnings = warnings.filter(message => message.includes("malformed-values.excalidraw"));
  expect(scopedWarnings).toHaveLength(labels.length);
  for (const id of ["fraction", "string-step", "null-step", "unsafe-step", "null-role", "null-metadata",
    "array-metadata", "string-metadata", "missing-version", "string-version", "fraction-version"]) {
    expect(scopedWarnings.filter(message => message.includes(`element "${id}"`))).toHaveLength(1);
  }
  expect(scopedWarnings.every(message => message.includes("malformed presentation metadata"))).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/17\?clicks=1$/);
  await expect.poll(() => isPainted(text("Valid additive metadata"))).toBe(true);
  await expect(text("Valid additive metadata")).toHaveCSS("fill", "rgb(102, 51, 153)");
  expect(await readFile(drawing, "utf8")).toBe(before);
});
