import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Resolve atomic bound-text timing before Slidev captures its click slots. */
export function prepareRevealSteps(elements: ExcalidrawElement[]) {
  const steps = new Map(elements.map(element => {
    const metadata = element.customData?.figuro;
    const step = metadata?.v === 1 && Number.isInteger(metadata.step) && metadata.step >= 0
      ? metadata.step : 0;
    return [element.id, step] as const;
  }));
  for (const element of elements) {
    if (element.type !== "text" || !element.containerId || !steps.has(element.containerId)) continue;
    const step = Math.max(steps.get(element.id)!, steps.get(element.containerId)!);
    steps.set(element.id, step);
    steps.set(element.containerId, step);
  }
  return steps;
}
