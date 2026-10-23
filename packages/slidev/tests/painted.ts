import type { Locator } from "@playwright/test";

// Observe painted text/color regardless of how reveal states hide content.
export async function isPainted(content: Locator): Promise<boolean> {
  return content.evaluateAll(nodes => nodes.some(node => {
    if (!node.getBoundingClientRect().width) return false;
    for (let current: Element | null = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    const paint = getComputedStyle(node);
    return (paint.fill !== "none" && Number(paint.fillOpacity) > 0)
      || (paint.stroke !== "none" && Number(paint.strokeOpacity) > 0);
  }));
}
