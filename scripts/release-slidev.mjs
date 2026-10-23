import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const addon = fileURLToPath(new URL("../packages/slidev/", import.meta.url));
const { version } = JSON.parse(readFileSync(`${addon}/package.json`, "utf8"));
const registry = "--registry=https://registry.npmjs.org/";
const [action, ...args] = process.argv.slice(2);
const help = `Release @figuro/slidev@${version} from any working directory:

  pnpm release:slidev prepare                 Run checks and inspect the upload
  pnpm release:slidev publish [--otp=CODE]    Publish publicly to npm
  pnpm release:slidev verify                  Test the exact registry release

Run prepare before publish, then verify after npm accepts the upload.
See docs/SLIDEV_RELEASE.md for authentication and completion instructions.`;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? result.signal}).`);
  return result.stdout;
}

function browserAcceptance(publishedVersion) {
  const latestOutput = run("pnpm", ["view", "@slidev/cli@53", "version", "--json", registry], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const versions = JSON.parse(latestOutput);
  const latest = Array.isArray(versions) ? versions.at(-1) : versions;
  if (!/^53\.\d+\.\d+$/.test(latest)) throw new Error(`Unexpected Slidev 53.x registry version: ${latest}`);
  for (const slidevVersion of new Set(["53.0.0", latest])) {
    console.log(`Checking Slidev ${slidevVersion}${publishedVersion ? ` with npm release ${publishedVersion}` : " with the checkout tarball"}`);
    run("pnpm", ["--filter", "@figuro/slidev", "test:docker"], {
      env: { ...process.env, SLIDEV_VERSION: slidevVersion, FIGURO_PACKAGE_VERSION: publishedVersion ?? "" },
    });
  }
  if (latest === "53.0.0") console.log("Slidev 53.0.0 is both the minimum and latest supported release; one run covers both.");
}

try {
  if (!action || action === "help" || action === "--help") {
    console.log(help);
  } else if (!["prepare", "publish", "verify"].includes(action) ||
    (args.length && (action !== "publish" || args.length !== 1 || !/^--otp=\d{6}$/.test(args[0])))) {
    throw new Error(`Invalid release arguments.\n${help}`);
  } else if (action === "prepare") {
    run("pnpm", ["typecheck"]);
    run("pnpm", ["test:ui:runner:check"]);
    run("pnpm", ["test:release:slidev"]);
    run("pnpm", ["--filter", "@figuro/slidev", "test:package"]);
    browserAcceptance();
    run("npm", ["publish", "--dry-run", registry], { cwd: addon });
    console.log(`Release checks passed for ${version}. Next: pnpm release:slidev publish`);
  } else if (action === "publish") {
    run("npm", ["whoami", registry], { cwd: addon });
    run("npm", ["publish", "--access", "public", registry, ...args], { cwd: addon });
    console.log(`Published @figuro/slidev@${version}. Next: pnpm release:slidev verify`);
  } else {
    run("npm", ["view", `@figuro/slidev@${version}`, "version", "dist.integrity", "--json", registry]);
    browserAcceptance(version);
    console.log(`Registry-installed acceptance passed for @figuro/slidev@${version}. Record the results in #16 and #29 and remove the pending-publication notes.`);
  }
} catch (error) {
  console.error(error.message);
  if (action === "publish") console.error("If npm reports EOTP, retry with a fresh code: pnpm release:slidev publish --otp=123456 (replace 123456). See docs/SLIDEV_RELEASE.md.");
  process.exitCode = 1;
}
