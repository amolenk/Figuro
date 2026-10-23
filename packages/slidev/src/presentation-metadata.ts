import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeStep(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Resolve metadata once, before Slidev captures synchronous click slots. */
export function preparePresentationMetadata(elements: ExcalidrawElement[]) {
  const active = elements.filter(element => !element.isDeleted);
  const warnings: string[] = [];
  const unsupportedElement = active.find(element => {
    const metadata: unknown = element.customData?.figuro;
    return isObject(metadata) && typeof metadata.v === "number"
      && Number.isInteger(metadata.v) && metadata.v > 0 && metadata.v !== 1;
  });
  const fileFallback = unsupportedElement !== undefined;
  if (fileFallback) {
    warnings.push(`unsupported presentation metadata version ${unsupportedElement.customData!.figuro.v}; ignoring all metadata and showing the whole drawing from step 0 with original appearance.`);
  }
  const prepared = active.map(element => {
    const metadata: unknown = element.customData?.figuro;
    if (!fileFallback && metadata === undefined) return element;
    if (!fileFallback && isObject(metadata) && metadata.v === 1
      && (!("step" in metadata) || isNonNegativeStep(metadata.step))
      && (!("role" in metadata) || typeof metadata.role === "string")) return element;
    if (!fileFallback) warnings.push(`malformed presentation metadata on element "${element.id}"; ignoring its metadata and showing it from step 0 with original appearance.`);
    const { figuro: _, ...customData } = element.customData ?? {};
    return { ...element, customData };
  });
  return { elements: prepared, warnings, fileFallback };
}

const warnedFiles = new Set<string>();

/** A file-wide fallback has one diagnostic even when reused on another slide. */
export function warnPresentationMetadata(source: string, presentation: ReturnType<typeof preparePresentationMetadata>) {
  if (presentation.fileFallback) {
    if (warnedFiles.has(source)) return;
    warnedFiles.add(source);
  }
  for (const warning of presentation.warnings) console.warn(`[Figuro] Drawing "${source}": ${warning}`);
}
