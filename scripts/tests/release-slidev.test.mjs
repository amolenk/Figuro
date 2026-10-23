import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const script = fileURLToPath(new URL("../release-slidev.mjs", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../../packages/slidev/package.json", import.meta.url), "utf8"));
const registry = "--registry=https://registry.npmjs.org/";

async function release(args, env = {}) {
  const directory = await mkdtemp(join(tmpdir(), "figuro-release-"));
  try {
    for (const command of ["pnpm", "npm"]) {
      const path = join(directory, command);
      await writeFile(path, `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.RELEASE_TEST_LOG, JSON.stringify({ command: ${JSON.stringify(command)}, args, cwd: process.cwd(), slidev: process.env.SLIDEV_VERSION, published: process.env.FIGURO_PACKAGE_VERSION }) + "\\n");
if (args[0] === "view" && args[1] === "@slidev/cli@53") console.log(JSON.stringify(process.env.RELEASE_TEST_LATEST || "53.0.0"));
if (args.includes(process.env.RELEASE_TEST_FAIL)) process.exit(1);
`);
      await chmod(path, 0o755);
    }
    const log = join(directory, "commands.jsonl");
    await writeFile(log, "");
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: directory,
      env: { ...process.env, ...env, PATH: directory, RELEASE_TEST_LOG: log },
      encoding: "utf8",
    });
    const calls = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    return { ...result, calls };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("prepare validates the checkout without publishing and tests both distinct Slidev boundaries", async () => {
  const result = await release(["prepare"], { RELEASE_TEST_LATEST: "53.1.0", FIGURO_PACKAGE_VERSION: "9.9.9" });
  assert.equal(result.status, 0, result.stderr);
  const browsers = result.calls.filter(call => call.args.includes("test:docker"));
  assert.deepEqual(browsers.map(call => [call.slidev, call.published]), [["53.0.0", ""], ["53.1.0", ""]]);
  assert.deepEqual(result.calls.filter(call => call.command === "npm").map(call => call.args), [["publish", "--dry-run", registry]]);
});

test("publish forwards an OTP and resolves the addon directory from outside the checkout", async () => {
  const result = await release(["publish", "--otp=123456"], { npm_config_registry: "https://example.invalid/" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(call => call.args), [["whoami", registry], ["publish", "--access", "public", registry, "--otp=123456"]]);
  assert.ok(result.calls.every(call => call.cwd === fileURLToPath(new URL("../../packages/slidev/", import.meta.url)).replace(/\/$/, "")));
});

test("verification uses the exact manifest release and deduplicates identical Slidev boundaries", async () => {
  const result = await release(["verify"], { FIGURO_PACKAGE_VERSION: "9.9.9", SLIDEV_VERSION: "54", npm_config_registry: "https://example.invalid/" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0].args, ["view", `@figuro/slidev@${version}`, "version", "dist.integrity", "--json", registry]);
  const browsers = result.calls.filter(call => call.args.includes("test:docker"));
  assert.deepEqual(browsers.map(call => [call.slidev, call.published]), [["53.0.0", version]]);
  assert.ok(!result.calls.some(call => call.args.includes("publish")));
});

test("failed checks and failed uploads stop the release without reporting success", async () => {
  const prepare = await release(["prepare"], { RELEASE_TEST_FAIL: "typecheck" });
  assert.equal(prepare.status, 1);
  assert.equal(prepare.calls.length, 1);
  const publish = await release(["publish"], { RELEASE_TEST_FAIL: "publish" });
  assert.equal(publish.status, 1);
  assert.doesNotMatch(publish.stdout, /Published @figuro/);
  assert.match(publish.stderr, /EOTP/);
});

test("invalid release arguments never invoke npm", async () => {
  const result = await release(["publish", "--tag=latest"]);
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, []);
});
