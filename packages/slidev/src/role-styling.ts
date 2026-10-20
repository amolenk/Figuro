import { normalizeLink } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const roleEligibleTypes = new Set(["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text"]);

/** Associate supported elements through the public exporter's hyperlink output. */
export function prepareRoleStyling(elements: ExcalidrawElement[], source: string) {
  const markers = new Map<string, { element: ExcalidrawElement; role: string }>();
  const markedElements = elements.map(element => {
    const metadata = element.customData?.figuro;
    const role = metadata?.v === 1 && typeof metadata.role === "string" && metadata.role.trim()
      ? metadata.role : undefined;
    if (!role) return element;
    if (!roleEligibleTypes.has(element.type) || element.groupIds.length || element.frameId
      || (element.type === "text" && element.containerId)
      || element.boundElements?.some(bound => bound.type === "text")) {
      console.warn(`[Figuro] Drawing "${source}": role "${role}" on element "${element.id}" is not supported; retaining original appearance.`);
      return element;
    }
    // Use copies and unique, temporary links instead of SVG node order or
    // Excalidraw's test-only data-id attribute. Markers never reach the slide.
    const marker = `https://figuro.invalid/${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
    markers.set(marker, { element, role });
    return { ...element, link: marker };
  });
  return {
    elements: markedElements,
    apply(svg: SVGSVGElement) {
      for (const [marker, { element, role }] of markers) {
        const anchors = Array.from(svg.querySelectorAll("a"))
          .filter(anchor => anchor.getAttribute("href") === marker);
        const content = anchors.length === 1
          ? Array.from(anchors[0].children).filter(node => node.localName === "g") : [];
        if (content.length === 1) {
          // One hook per source element keeps opacity, transforms, and filters
          // from compounding. Use descendant selectors for strokes and fills.
          content[0].setAttribute("data-figuro-role", role);
        } else {
          console.warn(`[Figuro] Drawing "${source}": could not associate role "${role}" with element "${element.id}"; retaining original appearance.`);
        }
        for (const anchor of anchors) {
          if (element.link) anchor.setAttribute("href", normalizeLink(element.link));
          else anchor.replaceWith(...anchor.childNodes);
        }
      }
    },
  };
}
