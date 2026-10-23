import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

// Exercise the scene-normalization boundary without a browser or renderer globals.
const source = await readFile(new URL("../src/scene-layout.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { normalizeSceneLayout } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const box = (id, x, y, width = 180, height = 100) => ({
  id, type: "rectangle", x, y, width, height, angle: 0, groupIds: [], frameId: null,
  locked: false, isDeleted: false, boundElements: null,
});

test("Tidy aligns near columns, straightens bound arrows, and leaves the authored scene intact", () => {
  const scene = [box("top", 0, 0), box("bottom", 1.6, 200), {
    ...box("connector", 90, 108, .69, 84), type: "arrow", points: [[0, 0], [.69, 84]],
    startBinding: { elementId: "top", focus: 0, gap: 8 },
    endBinding: { elementId: "bottom", focus: 0, gap: 8 }, elbowed: false,
  }];
  const before = structuredClone(scene);
  const result = normalizeSceneLayout(scene, "tidy");
  assert.ok(Math.abs(result[0].x - .8) < 1e-9);
  assert.equal(result[1].x, result[0].x);
  assert.equal(result[0].width, 180);
  assert.equal(result[2].x, 90.8);
  assert.deepEqual(result[2].points, [[0, 0], [0, 84]]);
  assert.deepEqual(result[2].startBinding, scene[2].startBinding);
  assert.deepEqual(scene, before);
  assert.deepEqual(normalizeSceneLayout(scene, "tidy"), result);
  assert.deepEqual(normalizeSceneLayout(result, "tidy"), result);
  assert.deepEqual(normalizeSceneLayout(scene, "original"), scene);
});

test("Structured normalizes comparable sizes, preserves ordering, and routes around intervening boxes", () => {
  const scene = [box("left", 0, 0, 100, 80), box("obstacle", 170, 6, 110, 75), box("right", 340, -5, 105, 85), {
    ...box("connector", 108, 40, 224, 0), type: "arrow", points: [[0, 0], [224, 0]],
    startBinding: { elementId: "left", focus: 0, gap: 8 },
    endBinding: { elementId: "right", focus: 0, gap: 8 }, elbowed: false,
  }];
  const result = normalizeSceneLayout(scene, "structured", new Map([["right", { width: 120, height: 90 }]]));
  assert.deepEqual(result.slice(0, 3).map(box => [box.width, box.height]), [[120, 90], [120, 90], [120, 90]]);
  assert.equal(result[0].y, result[1].y);
  assert.equal(result[0].y, result[2].y);
  assert.equal(result[1].x - result[0].x - 120, result[2].x - result[1].x - 120);
  const arrow = result[3];
  assert.ok(arrow.points.length > 2);
  const points = arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y]);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    assert.ok(a[0] === b[0] || a[1] === b[1], "Every segment is orthogonal");
    const obstacle = result[1];
    assert.ok(!(a[0] === b[0]
      ? a[0] > obstacle.x && a[0] < obstacle.x + obstacle.width && Math.max(a[1], b[1]) > obstacle.y && Math.min(a[1], b[1]) < obstacle.y + obstacle.height
      : a[1] > obstacle.y && a[1] < obstacle.y + obstacle.height && Math.max(a[0], b[0]) > obstacle.x && Math.min(a[0], b[0]) < obstacle.x + obstacle.width));
  }
  assert.equal(points[0][0], result[0].x + 128);
  assert.equal(points.at(-1)[0], result[2].x - 8);
  assert.deepEqual(normalizeSceneLayout(scene, "structured", new Map([["right", { width: 120, height: 90 }]])), result);
});

test("layout protects containment, frames, groups, rotation, manual routes, and nearby annotations", () => {
  const scenes = [
    [{ ...box("a", 0, 0), groupIds: ["group"] }, box("b", 2, 200)],
    [{ ...box("a", 0, 0), angle: .2 }, box("b", 2, 200)],
    [{ ...box("a", 0, 0), frameId: "frame" }, box("b", 2, 200)],
    [box("outer", -50, -50, 300, 200), box("a", 0, 0), box("b", 2, 200)],
    [box("a", 0, 0), box("b", 2, 200), { ...box("manual", 90, 108, 4, 84), type: "arrow", points: [[0, 0], [20, 20], [4, 84]], startBinding: { elementId: "a", gap: 8 }, endBinding: { elementId: "b", gap: 8 } }],
  ];
  for (const scene of scenes) {
    const before = structuredClone(scene);
    for (const mode of ["tidy", "structured"]) {
      const result = normalizeSceneLayout(scene, mode);
      assert.deepEqual(result[0], scene[0]);
      assert.deepEqual(scene, before);
    }
  }
  const annotation = { ...box("note", 180, 10, 30, 20), type: "text", containerId: null };
  const conflict = [box("a", 0, 0), box("b", 6, 200), annotation];
  assert.deepEqual(normalizeSceneLayout(conflict, "tidy"), conflict, "An alignment must not push a box into an unbound annotation");
});

test("Structured distributes shared ports and moves bound labels with their owners", () => {
  const scene = [box("source", 0, 0, 100, 100), box("one", 250, -150, 100, 100), box("two", 250, 150, 100, 100), {
    ...box("label", 10, 40, 80, 20), type: "text", containerId: "source", textAlign: "center", verticalAlign: "middle",
  }, ...["one", "two"].map((id, index) => ({
    ...box(`arrow-${id}`, 108, 45 + index * 10, 134, index ? 140 : -140), type: "arrow",
    points: [[0, 0], [134, index ? 140 : -140]],
    startBinding: { elementId: "source", focus: 0, gap: 8 }, endBinding: { elementId: id, focus: 0, gap: 8 }, elbowed: false,
  }))];
  const result = normalizeSceneLayout(scene, "structured", new Map([["source", { width: 120, height: 120 }]]));
  assert.equal(result[4].y, result[0].y + 40);
  assert.equal(result[5].y, result[0].y + 80);
  assert.equal(result[3].x + 40, result[0].x + 60);
  assert.equal(result[3].y + 10, result[0].y + 60);
});

test("Tidy preserves deliberate near-edge ports on large boxes", () => {
  const scene = [box("left", 0, 0, 100, 1000), box("right", 200, 0, 100, 1000), {
    ...box("connector", 108, 10, 84, 0), type: "arrow", points: [[0, 0], [84, 0]],
    startBinding: { elementId: "left", focus: .98, gap: 8 }, endBinding: { elementId: "right", focus: -.98, gap: 8 }, elbowed: false,
  }];
  assert.equal(normalizeSceneLayout(scene, "tidy")[2].y, 10);
});

test("unknown layout names are rejected explicitly", () => {
  assert.throws(() => normalizeSceneLayout([box("a", 0, 0)], "ultra"), /Unknown layout.*ultra/);
});

test("Tidy caps the combined attachment and straightening correction", () => {
  const scene = [box("left", 0, 0, 100, 1000), box("right", 200, 8, 100, 1000),
    { ...box("annotation", 10, 1000, 40, 10), type: "text", containerId: null }, {
      ...box("connector", 108, 492, 84, 8), type: "arrow", points: [[0, 0], [84, 8]],
      startBinding: { elementId: "left", focus: 0, gap: 8 }, endBinding: { elementId: "right", focus: 0, gap: 8 }, elbowed: false,
    }];
  const result = normalizeSceneLayout(scene, "tidy");
  assert.equal(result[0].y, 0, "Stationary annotation forces alignment rollback");
  const arrow = result[3];
  assert.ok(Math.abs(arrow.y - 492) <= 8);
  assert.ok(Math.abs(arrow.y + arrow.points.at(-1)[1] - 500) <= 8);
});

test("Structured routes around images and narrow obstacles adjacent to an endpoint", () => {
  for (const obstacle of [{ ...box("obstacle", 130, 0, 40, 100), type: "image" }, { ...box("obstacle", 118, 0, 2, 100), locked: true }]) {
    const scene = [box("left", 0, 0, 100, 100), box("right", 250, 0, 100, 100), obstacle, {
      ...box("connector", 108, 50, 134, 0), type: "arrow", points: [[0, 0], [134, 0]],
      startBinding: { elementId: "left", focus: 0, gap: 8 }, endBinding: { elementId: "right", focus: 0, gap: 8 }, elbowed: false,
    }];
    const arrow = normalizeSceneLayout(scene, "structured")[3];
    assert.ok(arrow.points.length > 2);
    const points = arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y]);
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      assert.ok(a[0] === b[0] || a[1] === b[1]);
      assert.ok(!(a[0] === b[0]
        ? a[0] > obstacle.x && a[0] < obstacle.x + obstacle.width && Math.max(a[1], b[1]) > obstacle.y && Math.min(a[1], b[1]) < obstacle.y + obstacle.height
        : a[1] > obstacle.y && a[1] < obstacle.y + obstacle.height && Math.max(a[0], b[0]) > obstacle.x && Math.min(a[0], b[0]) < obstacle.x + obstacle.width));
    }
  }
});

test("Structured keeps parallel connectors straight when a nearby annotation only needs a small port adjustment", () => {
  const scene = [box("top", 0, 0, 180, 100), box("bottom", 0, 200, 180, 100), box("peer", 300, 0, 198, 100),
    { ...box("note", 0, 140, 54, 20), type: "text", containerId: null }, {
      ...box("up", 60, 192, 2, 84), type: "arrow", points: [[0, 0], [2, -84]],
      startBinding: { elementId: "bottom", focus: 0, gap: 8 }, endBinding: { elementId: "top", focus: 0, gap: 8 }, elbowed: false,
    }, {
      ...box("down", 120, 108, 2, 84), type: "arrow", points: [[0, 0], [-2, 84]],
      startBinding: { elementId: "top", focus: 0, gap: 8 }, endBinding: { elementId: "bottom", focus: 0, gap: 8 }, elbowed: false,
    }];
  for (const transpose of [false, true]) {
    const input = transpose ? scene.map(element => ({ ...element, x: element.y, y: element.x, width: element.height, height: element.width,
      ...(element.points ? { points: element.points.map(([x, y]) => [y, x]) } : {}) })) : scene;
    const result = normalizeSceneLayout(input, "structured");
    const arrow = result[4];
    assert.equal(arrow.points.length, 2, "Avoid a tiny dogleg by shifting both ports together");
    const coordinate = transpose ? 1 : 0;
    const position = transpose ? arrow.y : arrow.x;
    assert.equal(arrow.points[1][coordinate], 0);
    assert.equal(position, 58, "Clear the annotation's edge plus four units");
    assert.equal(transpose ? result[5].y : result[5].x, 123, "Keep the other connector's port separate");
    assert.deepEqual(normalizeSceneLayout(input, "structured"), result);
  }
});
