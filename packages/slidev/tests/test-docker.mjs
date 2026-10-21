import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

let slidevVersion = process.env.SLIDEV_VERSION || "53.0.0";
assert.ok(slidevVersion === "53" || /^53\.\d+\.\d+$/.test(slidevVersion), "SLIDEV_VERSION must be 53 or an exact supported 53.x release");
if (slidevVersion === "53") {
  // Resolve outside Docker so an unchanged range cannot reuse an older cached install.
  const versions = JSON.parse(execFileSync("pnpm", ["view", "@slidev/cli@53", "version", "--json"], { encoding: "utf8" }));
  slidevVersion = Array.isArray(versions) ? versions.at(-1) : versions;
  assert.match(slidevVersion, /^53\.\d+\.\d+$/);
}
console.log(`Running addon acceptance with Slidev ${slidevVersion}`);
execFileSync("docker", [
  "build", "--build-arg", `SLIDEV_VERSION=${slidevVersion}`,
  "--build-arg", "FIGURO_PACKAGE_VERSION",
  "-f", "Dockerfile", "-t", "figuro-slidev-tests", "../..",
], { stdio: "inherit" });
execFileSync("docker", [
  "run", "--rm", "--ipc=host", "figuro-slidev-tests", "pnpm", "test", ...process.argv.slice(2),
], { stdio: "inherit" });
