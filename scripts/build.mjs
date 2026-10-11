import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
for (const name of [
  "protocol",
  "client",
  "host",
  "conformance",
  "adapter-noodlr",
]) {
  mkdirSync(`packages/${name}/dist`, { recursive: true });
  copyFileSync("LICENSE", `packages/${name}/LICENSE`);
  await build({
    entryPoints: [`packages/${name}/src/index.ts`],
    outdir: `packages/${name}/dist`,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
  });
  if (name === "conformance")
    await build({
      entryPoints: [`packages/${name}/src/cli.ts`],
      outfile: `packages/${name}/dist/cli.js`,
      bundle: true,
      format: "esm",
      platform: "node",
      banner: { js: "#!/usr/bin/env node" },
    });
  execFileSync("node", [
    "node_modules/typescript/bin/tsc",
    "--emitDeclarationOnly",
    "--outDir",
    `packages/${name}/dist/types`,
  ]);
  writeFileSync(
    `packages/${name}/package.json`,
    JSON.stringify(
      {
        name: `@audiframe/${name}`,
        version: "0.1.0-alpha.1",
        type: "module",
        license: "MIT",
        files: ["dist", "LICENSE"],
        ...(name === "protocol"
          ? {}
          : { peerDependencies: { "@audiframe/protocol": "0.1.0-alpha.1" } }),
        exports: {
          ".": {
            types: `./dist/types/${name}/src/index.d.ts`,
            import: "./dist/index.js",
          },
        },
        ...(name === "conformance"
          ? { bin: { "audiframe-conformance": "./dist/cli.js" } }
          : {}),
        publishConfig: { access: "public" },
      },
      null,
      2,
    ) + "\n",
  );
}
