import type { ResolvedSlidevOptions } from "@slidev/types";
import { drawingPlugin } from "../src/drawing-plugin";
import { fontPlugin } from "../src/font-plugin";

export default function setup(options: ResolvedSlidevOptions) {
  return [drawingPlugin(options.userRoot), fontPlugin()];
}
