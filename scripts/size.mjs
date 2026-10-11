import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
for (const name of ["client", "host"]) {
  const bytes = gzipSync(readFileSync(`packages/${name}/dist/index.js`)).length;
  console.log(`${name}: ${bytes} gzip bytes`);
  if (bytes > 15360) process.exitCode = 1;
}
