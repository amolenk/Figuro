import { normalizeLink } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import { boundTextRegion, canLayoutBox, positionBoundText } from "./scene-layout";

type Typography = { family: string; size: number; weight: string; style: string; lineHeight: number; letterSpacing: number; fill: string; opacity: string };
type Line = { text: string; part: "main" | "sub"; typography: Typography; y: number };
type Label = { element: ExcalidrawTextElement; marker: string; main: string; sub?: string; mainStyle?: Typography; subStyle?: Typography };
const namespace = "http://www.w3.org/2000/svg";

function sections(text: string): { main: string; sub?: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const split = lines.findIndex(line => line.startsWith("— "));
  if (split <= 0) return { main: text };
  const sub = [lines[split].slice(2), ...lines.slice(split + 1)].join("\n");
  return sub.trim() ? { main: lines.slice(0, split).join("\n"), sub } : { main: text };
}

/** Bound-label identity comes from the public exporter's link wrappers. */
export function prepareTextLayout(elements: ExcalidrawElement[], textSections: boolean, structured: boolean) {
  const byId = new Map(elements.map(element => [element.id, element]));
  const labels = new Map<string, Label>();
  const marked = elements.map(element => {
    if (element.type !== "text" || !element.containerId) return element;
    const owner = byId.get(element.containerId);
    if (!owner || !["rectangle", "diamond", "ellipse", "arrow"].includes(owner.type)
      || !owner.boundElements?.some(bound => bound.id === element.id && bound.type === "text")) return element;
    const content = textSections ? sections(element.originalText || element.text) : { main: element.originalText || element.text };
    if (!structured && content.sub === undefined) return element;
    if (content.sub === undefined && (!canLayoutBox(owner) || element.locked || element.angle || element.frameId || element.groupIds.length)) return element;
    const marker = `https://figuro.invalid/text/${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
    const label: Label = { element, marker, ...content };
    labels.set(element.id, label);
    return { ...element, link: marker };
  });
  const measurements = new Map<string, { width: number; height: number; lines: Line[]; scale?: number }>();
  const minimumSizes = new Map<string, { width: number; height: number }>();
  const context = document.createElement("canvas").getContext("2d")!;
  let fontStyle: HTMLStyleElement | undefined;
  function measure(label: Label, maxWidth: number) {
    const lines: Line[] = [];
    let width = 0, height = 0;
    for (const part of ["main", "sub"] as const) {
      const text = label[part];
      const typography = part === "main" ? label.mainStyle : label.subStyle;
      if (text === undefined || !typography) continue;
      if (part === "sub") height += label.mainStyle!.size * .2;
      context.font = `${typography.style} ${typography.weight} ${typography.size}px ${typography.family}`;
      context.letterSpacing = `${typography.letterSpacing}px`;
      const wrapped: string[] = [];
      for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > maxWidth) { wrapped.push(line); line = ""; }
          // Long tokens still fit their box. Split by Unicode codepoint.
          for (const character of (line ? ` ${word}` : word)) {
            if (line && context.measureText(line + character).width > maxWidth) { wrapped.push(line); line = ""; }
            line += character;
          }
        }
        wrapped.push(line);
      }
      for (const text of wrapped) {
        const metrics = context.measureText(text || "M");
        const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || typography.size * .8;
        const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || typography.size * .2;
        lines.push({ text, part, typography, y: height + (typography.lineHeight - ascent - descent) / 2 + ascent });
        width = Math.max(width, context.measureText(text).width);
        height += typography.lineHeight;
      }
    }
    return { width, height, lines };
  }
  function contentWidth(owner: ExcalidrawElement, label: Label) {
    return owner.type === "arrow" ? Math.max(120, label.element.width) : boundTextRegion(owner).width;
  }
  function contentHeight(owner: ExcalidrawElement) {
    return owner.type === "arrow" ? Infinity : boundTextRegion(owner).height;
  }
  function textGroup(svg: SVGSVGElement, label: Label): SVGGElement | undefined {
    const anchor = Array.from(svg.querySelectorAll("a")).find(anchor => anchor.getAttribute("href") === label.marker);
    return anchor?.querySelector("text")?.parentElement as SVGGElement | undefined;
  }
  return {
    elements: marked,
    minimumSizes,
    dispose() { fontStyle?.remove(); },
    async measure(svg: SVGSVGElement, stylesheetCss: string | undefined, container: HTMLElement) {
      if (!labels.size) return;
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-100000px;visibility:hidden;pointer-events:none";
      host.className = "figuro-svg";
      const root = host.attachShadow({ mode: "open" });
      const css = document.createElement("style");
      css.textContent = stylesheetCss ?? "";
      root.append(svg, css);
      container.append(host);
      // Font faces in a shadow root aren't registered in Chromium. Keep the same
      // face declarations available while measuring, including exporter fonts.
      const fonts = document.createElement("style");
      fontStyle = fonts;
      const fontRules = (rules: CSSRuleList): string => Array.from(rules).map(rule => {
        if (rule.type === CSSRule.FONT_FACE_RULE) return rule.cssText;
        return "cssRules" in rule ? fontRules((rule as CSSGroupingRule).cssRules) : "";
      }).join("\n");
      fonts.textContent = (svg.querySelector(".style-fonts")?.textContent ?? "") + "\n" + fontRules(css.sheet!.cssRules);
      document.head.append(fonts);
      try {
        for (const label of labels.values()) {
          const group = textGroup(svg, label);
          const template = group?.querySelector("text");
          if (!group || !template) throw new Error(`Could not associate bound label "${label.element.id}" with exported text.`);
          group.setAttribute("data-figuro-label", label.element.id);
          for (const part of ["main", "sub"] as const) {
            if (label[part] === undefined) continue;
            const sample = template.cloneNode(true) as SVGTextElement;
            sample.textContent = label[part]!;
            // Measure section-relative opacity independently of the source
            // label/frame opacity, which the exporter applies to its group.
            sample.setAttribute("fill-opacity", "1");
            if (label.sub !== undefined) sample.setAttribute("data-figuro-text-part", part);
            if (label.sub !== undefined && part === "main") sample.setAttribute("font-weight", "700");
            if (part === "sub") {
              sample.setAttribute("font-size", `${label.element.fontSize * .78}px`);
              sample.setAttribute("fill-opacity", ".75");
            }
            group.append(sample);
            const style = getComputedStyle(sample);
            const size = parseFloat(style.fontSize);
            const typography: Typography = { family: style.fontFamily, size, weight: style.fontWeight, style: style.fontStyle,
              lineHeight: style.lineHeight === "normal" ? size * label.element.lineHeight : parseFloat(style.lineHeight),
              letterSpacing: parseFloat(style.letterSpacing) || 0, fill: style.fill, opacity: style.fillOpacity };
            if (part === "main") label.mainStyle = typography; else label.subStyle = typography;
            await document.fonts.load(`${typography.style} ${typography.weight} ${size}px ${typography.family}`, label[part]!);
            sample.remove();
          }
          const owner = byId.get(label.element.containerId!)!;
          const measurement = measure(label, contentWidth(owner, label));
          measurements.set(label.element.id, measurement);
          const factor = boundTextRegion(owner).factor;
          if (owner.type !== "arrow") minimumSizes.set(owner.id, { width: Math.max(owner.width, (measurement.width + 16) / factor), height: Math.max(owner.height, (measurement.height + 16) / factor) });
        }
      } finally { host.remove(); }
    },
    reflow(scene: ExcalidrawElement[]) {
      const owners = new Map(scene.map(element => [element.id, element]));
      return scene.map(element => {
        const label = labels.get(element.id);
        if (!label || element.type !== "text") return element;
        const owner = owners.get(element.containerId!)!;
        const original = byId.get(element.containerId!)!;
        if (label.sub === undefined && owner.x === original.x && owner.y === original.y && owner.width === original.width && owner.height === original.height) {
          labels.delete(element.id);
          return { ...element, link: label.element.link };
        }
        const measurement = measure(label, contentWidth(owner, label));
        // Original/Tidy retain authored shape sizes. Uniformly scale the whole
        // typographic block only if needed, preserving its hierarchy and gap.
        const scale = Math.min(1, contentWidth(owner, label) / Math.max(1, measurement.width), contentHeight(owner) / Math.max(1, measurement.height));
        measurements.set(element.id, { ...measurement, scale });
        return positionBoundText({ ...element, width: measurement.width * scale, height: measurement.height * scale, text: measurement.lines.map(line => line.text).join("\n") }, owner);
      });
    },
    apply(svg: SVGSVGElement) {
      for (const label of labels.values()) {
        const group = textGroup(svg, label);
        const measurement = measurements.get(label.element.id);
        if (!group || !measurement) throw new Error(`Could not render bound label "${label.element.id}".`);
        group.setAttribute("data-figuro-label", label.element.id);
        // Per-part fill-opacity must not override reveal/frame opacity inherited
        // from the exporter's text group. Apply that opacity to the whole group.
        const opacity = group.getAttribute("fill-opacity");
        if (opacity !== null) {
          group.setAttribute("opacity", opacity);
          group.removeAttribute("fill-opacity");
          group.removeAttribute("stroke-opacity");
        }
        for (const node of Array.from(group.querySelectorAll("text"))) node.remove();
        const block = document.createElementNS(namespace, "g");
        if (measurement.scale !== undefined && measurement.scale < 1) block.setAttribute("transform", `scale(${measurement.scale})`);
        group.append(block);
        for (const line of measurement.lines) {
          const node = document.createElementNS(namespace, "text");
          const { typography } = line;
          node.textContent = line.text;
          if (label.sub !== undefined) node.setAttribute("data-figuro-text-part", line.part);
          node.setAttribute("x", `${label.element.textAlign === "center" ? measurement.width / 2 : label.element.textAlign === "right" ? measurement.width : 0}`);
          node.setAttribute("y", `${line.y}`);
          node.setAttribute("text-anchor", label.element.textAlign === "center" ? "middle" : label.element.textAlign === "right" ? "end" : "start");
          node.setAttribute("font-family", typography.family);
          node.setAttribute("font-size", `${typography.size}px`);
          node.setAttribute("font-weight", typography.weight);
          node.setAttribute("font-style", typography.style);
          node.setAttribute("letter-spacing", `${typography.letterSpacing}px`);
          node.setAttribute("fill", typography.fill);
          node.setAttribute("fill-opacity", typography.opacity);
          node.setAttribute("style", "white-space: pre;");
          block.append(node);
        }
        const anchor = group.closest("a")!;
        if (label.element.link) anchor.setAttribute("href", normalizeLink(label.element.link));
        else anchor.replaceWith(...anchor.childNodes);
      }
    },
  };
}
