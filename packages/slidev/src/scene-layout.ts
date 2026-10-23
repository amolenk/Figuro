import type { ExcalidrawElement, ExcalidrawTextElement, ExcalidrawArrowElement } from "@excalidraw/excalidraw/element/types";

export type LayoutMode = "original" | "tidy" | "structured";
type Box = Extract<ExcalidrawElement, { type: "rectangle" | "diamond" | "ellipse" }>;
type Point = [number, number];
type Axis = "x" | "y";
const routeClearance = 4;
const size = (axis: Axis) => axis === "x" ? "width" : "height";
const center = (element: ExcalidrawElement, axis: Axis) => element[axis] + element[size(axis)] / 2;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const isBox = (element: ExcalidrawElement): element is Box =>
  element.type === "rectangle" || element.type === "diamond" || element.type === "ellipse";
const plain = (element: ExcalidrawElement) => !element.isDeleted && !element.locked && !element.angle && !element.frameId && !element.groupIds.length;
export const canLayoutBox = (element: ExcalidrawElement) => isBox(element) && plain(element);

/** Safe axis-aligned label region, centered inside curved/diagonal shapes. */
export function boundTextRegion(owner: ExcalidrawElement) {
  const factor = owner.type === "diamond" ? .5 : owner.type === "ellipse" ? Math.SQRT1_2 : 1;
  return { x: owner.x + owner.width * (1 - factor) / 2 + 8,
    y: owner.y + owner.height * (1 - factor) / 2 + 8,
    width: Math.max(1, owner.width * factor - 16), height: Math.max(1, owner.height * factor - 16), factor };
}
const overlaps = (a: ExcalidrawElement, b: ExcalidrawElement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const precise = (value: number) => Math.round(value * 1e9) / 1e9;
const contains = (a: ExcalidrawElement, b: ExcalidrawElement) =>
  a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height;
const supportedArrow = (element: ExcalidrawElement): element is ExcalidrawArrowElement =>
  element.type === "arrow" && plain(element) && element.points.length === 2 && !("elbowed" in element && element.elbowed);

/** Deterministic export-copy normalization. Original preserves every authored value. */
export function normalizeSceneLayout(
  elements: readonly ExcalidrawElement[],
  mode: LayoutMode = "original",
  minimumSizes: ReadonlyMap<string, { width: number; height: number }> = new Map(),
): ExcalidrawElement[] {
  if (!["original", "tidy", "structured"].includes(mode)) throw new Error(`Unknown layout "${mode}". Expected original, tidy, or structured.`);
  if (mode === "original") return [...elements];
  const originals = new Map(elements.map(element => [element.id, element]));
  const protectedIds = new Set<string>();
  for (const element of elements) {
    if (element.type === "arrow" && !supportedArrow(element)) {
      if (element.startBinding) protectedIds.add(element.startBinding.elementId);
      if (element.endBinding) protectedIds.add(element.endBinding.elementId);
    }
  }
  const boxes = elements.filter(isBox).filter(element => plain(element) && !protectedIds.has(element.id)
    && !elements.some(other => other.id !== element.id && !other.isDeleted
      && !(other.type === "text" && other.containerId === element.id)
      && (isBox(other) || other.type === "frame" || other.type === "magicframe")
      && (contains(element, other) || contains(other, element))));
  const adjusted = new Map<string, ExcalidrawElement>(elements.map(element => [element.id, { ...element }]));
  const guides = (axis: Axis, structured: boolean) => {
    const sorted = [...boxes].sort((a, b) => center(a, axis) - center(b, axis) || a.id.localeCompare(b.id));
    const clusters: Box[][] = [];
    for (const box of sorted) {
      const last = clusters.at(-1);
      const tolerance = structured ? Math.min(box[size(axis)], last?.[0][size(axis)] ?? Infinity) * .4 : 8;
      if (last && center(box, axis) - center(last[0], axis) <= tolerance) last.push(box);
      else clusters.push([box]);
    }
    return clusters;
  };
  for (const axis of ["x", "y"] as const) {
    const dimension = size(axis);
    const clusters = guides(axis, mode === "structured");
    if (mode === "tidy") {
      for (const cluster of clusters) {
        if (cluster.length < 2) continue;
        const target = median(cluster.map(box => center(box, axis)));
        for (const box of cluster) {
          const copy = adjusted.get(box.id)!;
          adjusted.set(box.id, { ...copy, [axis]: target - copy[dimension] / 2 });
        }
      }
      // Infer edge guides only where no center guide already won.
      for (const edge of [0, 1]) {
        const remaining = boxes.filter(box => adjusted.get(box.id)![axis] === box[axis]);
        const sorted = remaining.sort((a, b) => a[axis] + edge * a[dimension] - b[axis] - edge * b[dimension] || a.id.localeCompare(b.id));
        for (let index = 0; index < sorted.length;) {
          let end = index + 1;
          const value = (box: Box) => box[axis] + edge * box[dimension];
          while (end < sorted.length && value(sorted[end]) - value(sorted[index]) <= 8) end++;
          const cluster = sorted.slice(index, end);
          if (cluster.length > 1) {
            const target = median(cluster.map(value));
            for (const box of cluster) adjusted.set(box.id, { ...adjusted.get(box.id)!, [axis]: target - edge * box[dimension] });
          }
          index = end;
        }
      }
    } else {
      // Only similarly sized boxes of the same kind are comparable. Large
      // boundaries and intentionally small nodes do not inherit a global size.
      for (const type of ["rectangle", "diamond", "ellipse"]) {
        const comparable = boxes.filter(box => box.type === type).sort((a, b) => a[dimension] - b[dimension] || a.id.localeCompare(b.id));
        for (let index = 0; index < comparable.length;) {
          let end = index + 1;
          while (end < comparable.length && comparable[end][dimension] <= comparable[index][dimension] * 1.25) end++;
          const family = comparable.slice(index, end);
          const target = Math.max(...family.map(box => Math.max(box[dimension], minimumSizes.get(box.id)?.[dimension] ?? 0)));
          for (const box of family) adjusted.set(box.id, { ...adjusted.get(box.id)!, [dimension]: target });
          index = end;
        }
      }
      const widths = clusters.map(cluster => Math.max(...cluster.map(box => adjusted.get(box.id)![dimension])));
      const authoredCenters = clusters.map(cluster => median(cluster.map(box => center(box, axis))));
      const gaps = authoredCenters.slice(1).map((value, index) => value - authoredCenters[index] - (widths[index] + widths[index + 1]) / 2);
      const gap = Math.max(32, gaps.length ? median(gaps) : 32);
      let target = authoredCenters[0] ?? 0;
      for (const [index, cluster] of clusters.entries()) {
        if (index) target += (widths[index - 1] + widths[index]) / 2 + gap;
        for (const box of cluster) {
          const copy = adjusted.get(box.id)!;
          adjusted.set(box.id, { ...copy, [axis]: target - copy[dimension] / 2 });
        }
      }
    }
  }
  if (mode === "tidy") {
    // Smooth only already-comparable gaps in each inferred row/column.
    for (const axis of ["x", "y"] as const) {
      const other = axis === "x" ? "y" : "x";
      for (const cluster of guides(other, false)) {
        if (cluster.length < 3) continue;
        const ordered = cluster.map(box => adjusted.get(box.id)!).sort((a, b) => a[axis] - b[axis]);
        const gaps = ordered.slice(1).map((box, index) => box[axis] - ordered[index][axis] - ordered[index][size(axis)]);
        if (Math.min(...gaps) <= 0 || Math.max(...gaps) - Math.min(...gaps) > 8) continue;
        const gap = gaps.reduce((total, value) => total + value, 0) / gaps.length;
        let position = ordered[0][axis];
        const proposals = ordered.map(box => {
          const result = { ...box, [axis]: position };
          position += box[size(axis)] + gap;
          return result;
        });
        if (proposals.every(box => Math.abs(box[axis] - originals.get(box.id)![axis]) <= 8)) {
          for (const box of proposals) adjusted.set(box.id, box);
        }
      }
    }
  }
  // Reject conflicting constraints as one transaction: do not add overlaps with
  // images, annotations, groups, frames, or other stationary content either.
  const obstacles = elements.filter(element => !element.isDeleted && !["arrow", "line", "freedraw"].includes(element.type)
    && !(element.type === "text" && element.containerId));
  const conflict = boxes.some(box => obstacles.some(other => other.id !== box.id
    && !overlaps(box, other) && overlaps(adjusted.get(box.id)!, adjusted.get(other.id)!)));
  if (conflict) for (const box of boxes) adjusted.set(box.id, { ...box });

  const arrows = elements.filter(supportedArrow);
  const ports = new Map<string, number>();
  const portRanges = new Map<string, [number, number]>();
  if (mode === "structured") {
    const sides = new Map<string, { key: string; order: number }[]>();
    for (const arrow of arrows) {
      for (const end of ["start", "end"] as const) {
        const binding = end === "start" ? arrow.startBinding : arrow.endBinding;
        const owner = binding && adjusted.get(binding.elementId);
        if (!owner || !isBox(owner) || !plain(owner)) continue;
        const point = endpoint(arrow, end);
        const side = attachmentSide(originals.get(owner.id)!, point);
        const key = `${owner.id}:${side}`;
        const entries = sides.get(key) ?? [];
        entries.push({ key: `${arrow.id}:${end}`, order: side === "left" || side === "right" ? point[1] : point[0] });
        sides.set(key, entries);
      }
    }
    for (const entries of sides.values()) {
      entries.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
      entries.forEach((entry, index) => {
        ports.set(entry.key, (index + 1) / (entries.length + 1));
        // Each port owns a slot bounded by neighboring ports' midpoints.
        portRanges.set(entry.key, [index ? (index + .5) / (entries.length + 1) : .1,
          index < entries.length - 1 ? (index + 1.5) / (entries.length + 1) : .9]);
      });
    }
  }
  for (const arrow of arrows) {
    const bindings = [arrow.startBinding, arrow.endBinding];
    const owners = bindings.map(binding => binding && adjusted.get(binding.elementId));
    if (!owners.some(Boolean) || owners.some(owner => owner && (!isBox(owner) || !plain(owner)))) continue;
    const gaps = bindings.filter(binding => binding !== null).map(binding => binding.gap);
    const uniformGap = mode === "structured" ? 8 : Math.max(...gaps) - Math.min(...gaps) <= 8 ? median(gaps) : undefined;
    const ends = (["start", "end"] as const).map((end, index) => {
      const owner = owners[index];
      const point = endpoint(arrow, end);
      if (!owner || !isBox(owner)) return { point, outward: [0, 0] as Point };
      const original = originals.get(owner.id)!;
      const diagonal = Math.abs(arrow.points[1][0]) > 8 && Math.abs(arrow.points[1][1]) > 8;
      if (mode === "tidy" && diagonal) return { point: [point[0] + owner.x - original.x, point[1] + owner.y - original.y] as Point, outward: [0, 0] as Point };
      const side = attachmentSide(original, point);
      const gap = uniformGap ?? bindings[index]!.gap;
      let fraction = mode === "structured" ? ports.get(`${arrow.id}:${end}`) ?? .5
        : Math.max(0, Math.min(1, side === "left" || side === "right" ? (point[1] - original.y) / original.height : (point[0] - original.x) / original.width));
      if (mode === "tidy" && Math.abs(fraction - .5) * (side === "left" || side === "right" ? owner.height : owner.width) <= 8) fraction = .5;
      const attached = attach(owner, side, fraction, gap);
      const translated: Point = [point[0] + owner.x - original.x, point[1] + owner.y - original.y];
      if (mode === "tidy" && Math.hypot(attached.point[0] - translated[0], attached.point[1] - translated[1]) > 8) {
        return { ...attached, point: translated };
      }
      return attached;
    });
    let points = ends.map(end => end.point);
    const authoredDelta = [arrow.points[1][0], arrow.points[1][1]];
    if (mode === "tidy") {
      const horizontal = Math.abs(authoredDelta[1]) <= 8 && Math.abs(points[0][1] - points[1][1]) <= 8;
      const vertical = Math.abs(authoredDelta[0]) <= 8 && Math.abs(points[0][0] - points[1][0]) <= 8;
      if (horizontal || vertical) {
        const coordinate = horizontal ? 1 : 0;
        const target = (points[0][coordinate] + points[1][coordinate]) / 2;
        points = points.map(point => coordinate === 1 ? [point[0], target] : [target, point[1]]);
      }
      // Attachment and straightening can each be small but exceed the tolerance
      // together. Check the final endpoints, not just the intermediate ports.
      points = points.map((point, index) => {
        const owner = owners[index];
        const original = owner && originals.get(owner.id)!;
        const authored = endpoint(arrow, index === 0 ? "start" : "end");
        const translated: Point = [authored[0] + (owner && original ? owner.x - original.x : 0), authored[1] + (owner && original ? owner.y - original.y : 0)];
        return Math.hypot(point[0] - translated[0], point[1] - translated[1]) <= 8 ? point : translated;
      });
    } else {
      const routeObstacles = obstacles
        .filter(box => box.type === "rectangle" || !owners.some(owner => owner?.id === box.id))
        .map(box => adjusted.get(box.id)!);
      const straight = straightPortRoute(ends, owners, (["start", "end"] as const).map(end => portRanges.get(`${arrow.id}:${end}`)), routeObstacles);
      const route = straight ?? orthogonalRoute(ends[0], ends[1], routeObstacles);
      // Even when an overlapping scene has no clear route, endpoints must
      // still follow normalized owners rather than their old positions.
      points = route ?? points;
    }
    const first = points[0];
    const local = points.map(point => [point[0] - first[0], point[1] - first[1]] as typeof arrow.points[number]);
    adjusted.set(arrow.id, { ...arrow, x: first[0], y: first[1],
      width: Math.max(...local.map(point => point[0])) - Math.min(...local.map(point => point[0])),
      height: Math.max(...local.map(point => point[1])) - Math.min(...local.map(point => point[1])),
      points: local, startBinding: arrow.startBinding && { ...arrow.startBinding, gap: uniformGap ?? arrow.startBinding.gap },
      endBinding: arrow.endBinding && { ...arrow.endBinding, gap: uniformGap ?? arrow.endBinding.gap } });
  }
  for (const element of elements) {
    if (element.type !== "text" || !element.containerId) continue;
    const owner = adjusted.get(element.containerId);
    const original = originals.get(element.containerId);
    if (!owner || !original || (owner.x === original.x && owner.y === original.y && owner.width === original.width && owner.height === original.height)) continue;
    adjusted.set(element.id, positionBoundText(element, owner));
  }
  return elements.map(element => {
    const copy = adjusted.get(element.id)!;
    if (copy.x === element.x && copy.y === element.y && copy.width === element.width && copy.height === element.height) return copy;
    return { ...copy, x: precise(copy.x), y: precise(copy.y), width: precise(copy.width), height: precise(copy.height) };
  });
}

/** Prefer a shared straight attachment line over a tiny obstacle-clearance dogleg. */
function straightPortRoute(
  ends: { point: Point; outward: Point }[],
  owners: (ExcalidrawElement | null | undefined)[],
  ranges: ([number, number] | undefined)[],
  obstacles: ExcalidrawElement[],
): Point[] | null {
  if (owners.some(owner => owner?.type !== "rectangle")) return null;
  const vertical = ends[0].outward[0] === 0 && ends[1].outward[0] === 0;
  const coordinate = vertical ? 0 : 1;
  const direction = 1 - coordinate;
  if (ends[0].outward[direction] !== -ends[1].outward[direction]
    || ends[0].point[coordinate] !== ends[1].point[coordinate]
    || (ends[1].point[direction] - ends[0].point[direction]) * ends[0].outward[direction] <= 0) return null;
  const target = ends[0].point[coordinate];
  const axis = vertical ? "x" : "y";
  const candidates = [...new Set([target, ...obstacles.flatMap(obstacle => [obstacle[axis] - routeClearance, obstacle[axis] + obstacle[size(axis)] + routeClearance])])]
    .filter(value => Math.abs(value - target) <= 8)
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  for (const value of candidates) {
    if (!owners.every((owner, index) => {
      const range = ranges[index];
      if (!owner || !range) return false;
      const fraction = (value - owner[axis]) / owner[size(axis)];
      return fraction > range[0] && fraction < range[1];
    })) continue;
    const points = ends.map(end => coordinate === 0 ? [value, end.point[1]] as Point : [end.point[0], value] as Point);
    if (clearRouteSegment(points[0], points[1], obstacles)) return points;
  }
  return null;
}

function clearRouteSegment(a: Point, b: Point, obstacles: ExcalidrawElement[]) {
  return !obstacles.some(box => a[0] === b[0]
    ? a[0] > box.x - routeClearance && a[0] < box.x + box.width + routeClearance
      && Math.max(a[1], b[1]) > box.y - routeClearance && Math.min(a[1], b[1]) < box.y + box.height + routeClearance
    : a[1] > box.y - routeClearance && a[1] < box.y + box.height + routeClearance
      && Math.max(a[0], b[0]) > box.x - routeClearance && Math.min(a[0], b[0]) < box.x + box.width + routeClearance);
}

export function positionBoundText(text: ExcalidrawTextElement, owner: ExcalidrawElement): ExcalidrawTextElement {
  if (owner.type === "arrow" || owner.type === "line") {
    const points = owner.points;
    const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
    let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2;
    for (const [index, length] of lengths.entries()) {
      if (remaining <= length) {
        const ratio = length ? remaining / length : 0;
        return { ...text, x: owner.x + points[index][0] + (points[index + 1][0] - points[index][0]) * ratio - text.width / 2,
          y: owner.y + points[index][1] + (points[index + 1][1] - points[index][1]) * ratio - text.height / 2 };
      }
      remaining -= length;
    }
  }
  const region = boundTextRegion(owner);
  return { ...text,
    x: text.textAlign === "left" ? region.x : text.textAlign === "right" ? region.x + region.width - text.width : center(owner, "x") - text.width / 2,
    y: text.verticalAlign === "top" ? region.y : text.verticalAlign === "bottom" ? region.y + region.height - text.height : center(owner, "y") - text.height / 2 };
}

const endpoint = (arrow: ExcalidrawArrowElement, end: "start" | "end"): Point => {
  const point = end === "start" ? arrow.points[0] : arrow.points.at(-1)!;
  return [arrow.x + point[0], arrow.y + point[1]];
};
type Side = "left" | "right" | "top" | "bottom";
function attachmentSide(box: ExcalidrawElement, point: Point): Side {
  const dx = (point[0] - center(box, "x")) / Math.max(1, box.width);
  const dy = (point[1] - center(box, "y")) / Math.max(1, box.height);
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "top" : "bottom";
}
function attach(box: Box, side: Side, fraction: number, gap: number) {
  const vertical = side === "left" || side === "right";
  const direction = side === "left" || side === "top" ? -1 : 1;
  const transverse = (fraction - .5) * 2;
  const extent = box.type === "diamond" ? 1 - Math.abs(transverse) : box.type === "ellipse" ? Math.sqrt(1 - transverse ** 2) : 1;
  return {
    point: vertical ? [center(box, "x") + direction * (box.width / 2 * extent + gap), box.y + box.height * fraction] as Point
      : [box.x + box.width * fraction, center(box, "y") + direction * (box.height / 2 * extent + gap)] as Point,
    outward: (vertical ? [direction, 0] : [0, direction]) as Point,
  };
}

/** Rectilinear visibility graph around inflated obstacles, with deterministic ties. */
function orthogonalRoute(start: { point: Point; outward: Point }, end: { point: Point; outward: Point }, boxes: ExcalidrawElement[]): Point[] | null {
  const clearance = routeClearance;
  const bounds = boxes.map(box => ({ left: box.x - clearance, right: box.x + box.width + clearance, top: box.y - clearance, bottom: box.y + box.height + clearance }));
  let from: Point = [start.point[0] + start.outward[0] * 12, start.point[1] + start.outward[1] * 12];
  let to: Point = [end.point[0] + end.outward[0] * 12, end.point[1] + end.outward[1] * 12];
  const visible = (a: Point, b: Point) => clearRouteSegment(a, b, boxes);
  // A narrow obstacle may lie between an endpoint and its lead. Start the graph
  // at that endpoint instead of accepting an unchecked lead through the obstacle.
  if (!visible(start.point, from)) from = start.point;
  if (!visible(end.point, to)) to = end.point;
  const xs = [...new Set([from[0], to[0], ...bounds.flatMap(box => [box.left, box.right])])].sort((a, b) => a - b);
  const ys = [...new Set([from[1], to[1], ...bounds.flatMap(box => [box.top, box.bottom])])].sort((a, b) => a - b);
  const free = (point: Point) => !bounds.some(box => point[0] > box.left && point[0] < box.right && point[1] > box.top && point[1] < box.bottom);
  const points: Point[] = [];
  const indices = new Map<string, number>();
  for (const x of xs) for (const y of ys) if (free([x, y])) { indices.set(`${x},${y}`, points.length); points.push([x, y]); }
  const first = indices.get(from.join(","));
  const last = indices.get(to.join(","));
  if (first === undefined || last === undefined) return null;
  const edges = points.map(() => [] as number[]);
  for (const coordinate of [0, 1]) {
    const rows = new Map<number, number[]>();
    points.forEach((point, index) => { const row = rows.get(point[coordinate]) ?? []; row.push(index); rows.set(point[coordinate], row); });
    for (const row of rows.values()) {
      row.sort((a, b) => points[a][1 - coordinate] - points[b][1 - coordinate]);
      for (let index = 1; index < row.length; index++) {
        const a = row[index - 1], b = row[index];
        if (visible(points[a], points[b])) { edges[a].push(b); edges[b].push(a); }
      }
    }
  }
  const distances = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  distances[first] = 0;
  while (visited.size < points.length) {
    let current = -1;
    for (let index = 0; index < points.length; index++) if (!visited.has(index) && Number.isFinite(distances[index]) && (current === -1 || distances[index] < distances[current])) current = index;
    if (current === -1 || current === last) break;
    visited.add(current);
    for (const next of edges[current]) {
      const distance = distances[current] + Math.abs(points[current][0] - points[next][0]) + Math.abs(points[current][1] - points[next][1]) + 1;
      if (distance < distances[next]) { distances[next] = distance; previous[next] = current; }
    }
  }
  if (!Number.isFinite(distances[last])) return null;
  const path: Point[] = [end.point];
  for (let current = last; current !== -1; current = previous[current]) path.unshift(points[current]);
  path.unshift(start.point);
  return path.filter((point, index) => {
    if (index && point[0] === path[index - 1][0] && point[1] === path[index - 1][1]) return false;
    const before = path[index - 1], after = path[index + 1];
    return !before || !after || !((before[0] === point[0] && point[0] === after[0]) || (before[1] === point[1] && point[1] === after[1]));
  });
}
