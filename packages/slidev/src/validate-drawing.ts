function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const elementTypes = new Set([
  "rectangle", "diamond", "ellipse", "text", "line", "arrow", "freedraw",
  "image", "frame", "magicframe", "embeddable", "iframe",
]);

/** Validate the file envelope and rendering data before a deck can be published. */
export function validateDrawing(scene: unknown): void {
  if (!isObject(scene) || scene.type !== "excalidraw") {
    throw new Error("Expected an Excalidraw document with type \"excalidraw\".");
  }
  if (!Array.isArray(scene.elements)) throw new Error("Expected an elements array.");
  if (scene.appState !== undefined && !isObject(scene.appState)) {
    throw new Error("Expected appState to be an object.");
  }
  if (isObject(scene.appState) && scene.appState.viewBackgroundColor !== undefined
    && typeof scene.appState.viewBackgroundColor !== "string") {
    throw new Error("Expected appState.viewBackgroundColor to be a color string.");
  }
  if (scene.files !== undefined && !isObject(scene.files)) throw new Error("Expected files to be an object.");
  for (const [index, element] of scene.elements.entries()) {
    const fail = (detail: string): never => { throw new Error(`Invalid elements[${index}]: ${detail}`); };
    if (!isObject(element)) fail("expected an element object.");
    if (typeof element.id !== "string" || !element.id) fail("expected an id.");
    if (typeof element.type !== "string" || !elementTypes.has(element.type)) fail("unknown element type.");
    for (const field of ["x", "y", "width", "height"]) {
      if (typeof element[field] !== "number" || !Number.isFinite(element[field])) fail(`expected finite ${field}.`);
    }
    for (const field of ["angle", "strokeWidth", "roughness", "opacity", "seed", "fontSize", "fontFamily", "lineHeight"]) {
      if (element[field] !== undefined && (typeof element[field] !== "number" || !Number.isFinite(element[field]))) {
        fail(`expected finite ${field}.`);
      }
    }
    for (const field of ["strokeColor", "backgroundColor", "fillStyle", "strokeStyle"]) {
      if (element[field] !== undefined && typeof element[field] !== "string") fail(`expected string ${field}.`);
    }
    if (element.type === "text" && typeof element.text !== "string") fail("expected text.");
    if (element.type === "image" && !element.isDeleted) {
      if (typeof element.fileId !== "string" || !element.fileId) {
        fail(`image "${element.id}" requires a fileId and embedded image data.`);
      }
      const file = isObject(scene.files) && Object.hasOwn(scene.files, element.fileId)
        ? scene.files[element.fileId] : undefined;
      const resource = `image "${element.id}" requires embedded image data in file "${element.fileId}"`;
      if (!isObject(file)) return fail(`${resource}: missing file record.`);
      if (file.id !== element.fileId) fail(`${resource}: file record id does not match.`);
      if (typeof file.mimeType !== "string" || !/^image\/[\w.+-]+$/.test(file.mimeType)) {
        fail(`${resource}: expected an image MIME type.`);
      }
      const data = typeof file.dataURL === "string"
        ? /^data:([^;,]+)(?:;[^,]*)?,([\s\S]+)$/.exec(file.dataURL) : null;
      if (!data || data[1] !== file.mimeType || !data[2].trim()) {
        fail(`${resource}: expected a non-empty image data URL matching its MIME type.`);
      }
    }
    for (const field of ["link", "index", "frameId", "containerId", "originalText", "font", "name"]) {
      if (element[field] != null && typeof element[field] !== "string") fail(`expected nullable string ${field}.`);
    }
    for (const field of ["isDeleted", "locked", "autoResize", "elbowed", "simulatePressure"]) {
      if (element[field] !== undefined && typeof element[field] !== "boolean") fail(`expected boolean ${field}.`);
    }
    if (element.boundElementIds != null && (!Array.isArray(element.boundElementIds)
      || element.boundElementIds.some((value: unknown) => typeof value !== "string"))) fail("expected boundElementIds strings.");
    if (["line", "arrow", "freedraw"].includes(element.type)) {
      if (!Array.isArray(element.points) || element.points.some((point: unknown) =>
        !Array.isArray(point) || point.length !== 2 || point.some(value => typeof value !== "number" || !Number.isFinite(value)))) {
        fail("expected numeric points.");
      }
    }
    if (element.groupIds !== undefined && (!Array.isArray(element.groupIds)
      || element.groupIds.some((group: unknown) => typeof group !== "string"))) fail("expected groupIds strings.");
    if (element.boundElements != null && (!Array.isArray(element.boundElements)
      || element.boundElements.some((bound: unknown) => !isObject(bound) || typeof bound.id !== "string" || typeof bound.type !== "string"))) {
      fail("expected boundElements references.");
    }
  }
}
