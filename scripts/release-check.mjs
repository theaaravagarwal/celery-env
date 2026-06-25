import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const changelog = await readFile("CHANGELOG.md", "utf8");

assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "package version must be a stable semver release");
assert.match(changelog, new RegExp(`^## ${escapeRegExp(pkg.version)}$`, "m"), `CHANGELOG.md must include ## ${pkg.version}`);

const npmView = spawnSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version", "--json"], {
  encoding: "utf8"
});

if (npmView.status === 0 && npmView.stdout.trim()) {
  throw new Error(`${pkg.name}@${pkg.version} already exists on npm`);
}
if (npmView.status !== 0 && !/E404|404 Not Found/.test(npmView.stderr)) {
  process.stderr.write(npmView.stderr);
  throw new Error("could not verify npm version availability");
}

const pack = spawnSync("npm", [
  "--cache",
  join(tmpdir(), "npm-cache-celery-release-check"),
  "pack",
  "--dry-run",
  "--json",
  "--ignore-scripts"
], { encoding: "utf8" });

if (pack.status !== 0) {
  process.stderr.write(pack.stderr);
  process.exit(pack.status || 1);
}

const [summary] = JSON.parse(pack.stdout.trim());
assert.equal(summary.name, pkg.name, "pack name must match package.json");
assert.equal(summary.version, pkg.version, "pack version must match package.json");
assert.ok(summary.files.some((file) => file.path === "README.md"), "pack must include README.md");
assert.ok(summary.files.some((file) => file.path === "src/cli.js"), "pack must include CLI");

console.log(`release check ok: ${pkg.name}@${pkg.version}, ${summary.files.length} files, ${summary.size} packed bytes`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
