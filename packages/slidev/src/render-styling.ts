import type { LayoutMode } from "./scene-layout";

export const roughnessModes = ["original", "smooth", "sketchy", "rough"] as const;
export type RoughnessMode = typeof roughnessModes[number];

/** Roughness changes exported paths; Structured defaults to smooth strokes. */
export function resolveRenderRoughness(mode: RoughnessMode | undefined, layout: LayoutMode): number | undefined {
  const selected = mode ?? (layout === "structured" ? "smooth" : "original");
  switch (selected) {
    case "original": return undefined;
    case "smooth": return 0;
    case "sketchy": return 1;
    case "rough": return 2;
    default: throw new Error(`Unknown roughness "${selected}". Expected ${roughnessModes.join(", ")}.`);
  }
}
