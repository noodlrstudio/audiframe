import { readFileSync } from "node:fs";
import { report, type Fixture } from "./index";
const path = process.argv[2] ?? "spec/fixtures/core.json";
const result = report(JSON.parse(readFileSync(path, "utf8")) as Fixture[], {
  runtime: process.version,
  os: process.platform,
});
console.log(JSON.stringify(result, null, 2));
if (result.results.some((r) => r.status === "FAIL")) process.exitCode = 1;
