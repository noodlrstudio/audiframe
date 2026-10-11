import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = process.argv[2] ?? "chrome";
const session = "audiframe-ci-" + browser;
const cli = (args) =>
  execFileSync(
    "npx",
    ["--yes", "@playwright/cli@0.1.22", `-s=${session}`, ...args],
    { encoding: "utf8", timeout: 60000 },
  );
mkdirSync("output/playwright", { recursive: true });
try {
  cli([
    "open",
    "http://127.0.0.1:4100/packages/conformance/browser/",
    "--browser",
    browser,
  ]);
  cli(["snapshot"]);
  const report = cli([
    "eval",
    `async () => { const {run} = await import('/packages/conformance/browser/runner.js'); const r = await run(); if(r.results.some(x=>x.status==='FAIL')) throw new Error(JSON.stringify(r.results.filter(x=>x.status==='FAIL'))); return r; }`,
    "--raw",
  ]);
  writeFileSync(`output/playwright/${browser}.json`, report);
  console.log(`${browser}: cross-origin conformance passed`);
} finally {
  cli(["close"]);
}
