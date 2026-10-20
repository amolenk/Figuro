import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "static", testMatch: "static.spec.ts", use: { baseURL: "http://localhost:3030" } },
    { name: "built", testMatch: "static.spec.ts", use: { baseURL: "http://localhost:3032/fixture/" } },
    { name: "consumer", testMatch: "static.spec.ts", use: { baseURL: "http://localhost:3033/fixture/" } },
    { name: "errors", testMatch: "errors.spec.ts", use: { baseURL: "http://localhost:3031" } },
  ],
  webServer: [{
    command: "pnpm exec slidev tests/fixtures/deck/slides.md --port 3030",
    url: "http://localhost:3030",
    timeout: 120_000,
  }, {
    command: "node tests/serve-built.mjs dist/consumer 3033",
    url: "http://localhost:3033/fixture/",
    timeout: 120_000,
  }, {
    command: "pnpm exec slidev build tests/fixtures/deck/slides.md --base /fixture/ --out ../../../dist/acceptance && node tests/serve-built.mjs",
    url: "http://localhost:3032/fixture/",
    timeout: 120_000,
  }, {
    command: "pnpm exec slidev tests/fixtures/errors/slides.md --port 3031",
    url: "http://localhost:3031",
    timeout: 120_000,
  }],
});
