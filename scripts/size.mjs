import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";

const files = [
  ["src/index.js", 3700],
  ["src/compiler.js", 7500],
  ["src/cli.js", 2100],
  ["src/infer.js", 4400]
];
let failed = false;

for (const [file, limit] of files) {
  const source = await readFile(file);
  const gzip = gzipSync(source, { level: 9 });
  console.log(`${file}\t${source.length} bytes\t${gzip.length} gzip bytes`);
  if (gzip.length > limit) {
    failed = true;
    console.error(`${file} exceeds gzip budget: ${gzip.length} > ${limit}`);
  }
}

if (failed) process.exitCode = 1;
