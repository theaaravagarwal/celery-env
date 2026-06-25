import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const expectedPrepublishOnly = "npm test && npm run size && npm run validate:publish && npm run smoke:pack";

for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
  assert.deepEqual(pkg[field] || {}, {}, `${field} must stay empty in the published package`);
}

for (const script of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "publish", "postpublish"]) {
  assert.equal(pkg.scripts?.[script], undefined, `${script} lifecycle script must not be present`);
}
assert.equal(pkg.scripts?.prepublishOnly, expectedPrepublishOnly, "prepublishOnly must stay limited to the verification gate");

assert.deepEqual(new Set(pkg.files), new Set([
  "src/index.js",
  "src/compiler.js",
  "src/index.d.ts",
  "src/compiler.d.ts",
  "src/cli.js",
  "docs/assets/celery-mark.svg",
  "docs/BENCHMARKS.md",
  "docs/CLI.md",
  "docs/COMPARISON.md",
  "docs/EXAMPLES.md",
  "docs/GETTING_STARTED.md",
  "docs/MIGRATION.md",
  "docs/README.md",
  "docs/RELEASE.md",
  "docs/RUNTIME.md",
  "docs/SCHEMA.md",
  "docs/TROUBLESHOOTING.md",
  "docs/TYPESCRIPT.md",
  "examples/env.schema.mjs",
  "examples/node-service/env.schema.mjs",
  "examples/next/env.schema.mjs",
  "SECURITY.md",
  "README.md",
  "LICENSE"
]), "published files whitelist changed");

const sources = {
  "src/index.js": await readFile("src/index.js", "utf8"),
  "src/compiler.js": await readFile("src/compiler.js", "utf8"),
  "src/cli.js": await readFile("src/cli.js", "utf8")
};

for (const [file, source] of Object.entries(sources)) {
  assert.doesNotMatch(source, /\beval\s*\(/, `${file} must not use eval()`);
  assert.doesNotMatch(source, /\bnew\s+Function\b/, `${file} must not use new Function()`);
  assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dgram|dns|worker_threads)\b/, `${file} must not import process, network, or worker primitives`);
}

assert.match(sources["src/cli.js"], /pathToFileURL\(schemaPath\)\.href/, "CLI schema imports must go through file URLs");
assert.match(sources["src/compiler.js"], /functionName must be a JavaScript identifier/, "generated function names must be validated");
assert.match(sources["src/compiler.js"], /function reserved/, "generated function names must reject reserved words");
assert.match(sources["src/compiler.js"], /key === "__proto__"/, "compiler must special-case __proto__");
assert.match(sources["src/compiler.js"], /function E\(e\)/, "generated requiredWhen predicates must receive an own env facade");
assert.match(sources["src/index.js"], /Object\.defineProperty\(o, k/, "runtime must define __proto__ as data property");
assert.match(sources["src/index.js"], /H\(env, "NODE_ENV"\)/, "runtime env-specific defaults must use own NODE_ENV");
assert.match(sources["src/index.js"], /Object\.create\(null\)/, "runtime specs must not inherit option fields");

console.log("security scan ok: zero root dependencies, lifecycle hooks constrained, static source checks passed");
