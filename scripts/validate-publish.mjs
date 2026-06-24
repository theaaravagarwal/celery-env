import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const emptyDependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const expectedPrepublishOnly = "npm test && npm run size && npm run validate:publish && npm run smoke:pack";
const binPath = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["celery-env"];

for (const field of emptyDependencyFields) {
  assert.deepEqual(pkg[field] || {}, {}, `${field} must stay empty in the root package`);
}

for (const script of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "publish", "postpublish"]) {
  assert.equal(pkg.scripts?.[script], undefined, `${script} lifecycle script must not be present`);
}
assert.equal(pkg.scripts?.prepublishOnly, expectedPrepublishOnly, "prepublishOnly must stay limited to the verification gate");

const expectedFiles = new Set([
  "package/LICENSE",
  "package/README.md",
  "package/SECURITY.md",
  "package/package.json",
  "package/docs/BENCHMARKS.md",
  "package/docs/CLI.md",
  "package/docs/COMPARISON.md",
  "package/docs/GETTING_STARTED.md",
  "package/docs/MIGRATION.md",
  "package/docs/README.md",
  "package/docs/RUNTIME.md",
  "package/docs/SCHEMA.md",
  "package/docs/TROUBLESHOOTING.md",
  "package/docs/TYPESCRIPT.md",
  "package/docs/assets/celery-mark.svg",
  "package/src/cli.js",
  "package/src/compiler.d.ts",
  "package/src/compiler.js",
  "package/src/index.d.ts",
  "package/src/index.js"
]);

for (const path of [
  pkg.types,
  binPath,
  pkg.exports["."].import,
  pkg.exports["."].types,
  pkg.exports["./compiler"].import,
  pkg.exports["./compiler"].types
]) {
  assert.equal(existsSync(path), true, `${path} must exist`);
}

const npmArgs = ["--cache", join(tmpdir(), "npm-cache-celery"), "pack", "--dry-run", "--json", "--ignore-scripts"];
const npmExec = process.env.npm_execpath;
const result = npmExec
  ? spawnSync(process.execPath, [npmExec, ...npmArgs], { encoding: "utf8" })
  : spawnSync("npm", npmArgs, { encoding: "utf8" });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

const output = result.stdout.trim() || result.stderr.trim();
assert.ok(output, "npm pack did not produce JSON output");
const [pack] = JSON.parse(output);
const actualFiles = new Set(pack.files.map((file) => `package/${file.path}`));

assert.deepEqual(actualFiles, expectedFiles, "npm package contents changed unexpectedly");
assert.ok(pack.size < 33000, `packed tarball is too large: ${pack.size}`);
assert.ok(pack.unpackedSize < 112000, `unpacked package is too large: ${pack.unpackedSize}`);

console.log(`publish validation ok: ${pack.files.length} files, ${pack.size} packed bytes`);
