import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The published type declarations must work for ESM consumers, which use
// "module": "NodeNext". NodeNext can't follow extensionless relative paths
// (`export * from "./types"`), so every relative import in packages/*/src
// needs a .js extension or these exports look missing to TypeScript.
test("type declarations resolve for a NodeNext consumer", () => {
  const root = resolve(import.meta.dirname, "..");
  const dir = mkdtempSync(join(tmpdir(), "audiframe-nodenext-"));
  try {
    mkdirSync(join(dir, "node_modules", "@audiframe"), { recursive: true });
    for (const name of [
      "protocol",
      "client",
      "host",
      "conformance",
      "adapter-noodlr",
    ]) {
      symlinkSync(
        join(root, "packages", name),
        join(dir, "node_modules", "@audiframe", name),
        "dir",
      );
    }
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        include: ["consumer.ts"],
      }),
    );
    writeFileSync(
      join(dir, "consumer.ts"),
      `import {
  manifestSchema,
  validateManifest,
  parseEnvelope,
  validateMidi,
  type Manifest,
} from "@audiframe/protocol";
import { createClient } from "@audiframe/client";
import { createHostSession } from "@audiframe/host";
import { report } from "@audiframe/conformance";
import { descriptor } from "@audiframe/adapter-noodlr";

const manifest: Manifest = {
  id: "com.example.app",
  name: "App",
  appVersion: "1.0.0",
  protocolVersions: [{ major: 1, minor: 0 }],
  capabilities: [{ id: "lifecycle", version: 1 }],
};
validateManifest(manifest);
export const used = [
  manifestSchema,
  parseEnvelope,
  validateMidi,
  createClient,
  createHostSession,
  report,
  descriptor,
];
`,
    );
    let output = "";
    try {
      execFileSync(
        process.execPath,
        [join(root, "node_modules/typescript/bin/tsc"), "-p", dir],
        { encoding: "utf8", stdio: "pipe" },
      );
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    assert.equal(output, "", output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
