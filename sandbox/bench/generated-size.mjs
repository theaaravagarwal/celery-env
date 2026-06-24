import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const runs = Number(process.env.RUNS || 15);
const options = args.optimize ? { optimize: args.optimize } : undefined;
const cases = [
  ["small", smallSchema(), smallEnv()],
  ["medium", makeSchema(40), makeEnv(40)],
  ["large", makeSchema(160), makeEnv(160)]
];
const rows = [];

for (const [name, schema, env] of cases) {
  const file = join(__dirname, "generated", `size.${name}.generated.mjs`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, generateValidator(schema, options), "utf8");
  const source = await readFile(file);
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", generatedCase(file, env)], {
      cwd: __dirname,
      encoding: "utf8"
    });
    if (result.status !== 0) throw new Error(result.stderr.trim() || `exit ${result.status}`);
    samples.push(JSON.parse(result.stdout));
  }
  rows.push({
    name,
    raw_bytes: source.length,
    gzip_bytes: gzipSync(source, { level: 9 }).length,
    import_ms: median(samples, "importMs"),
    first_validate_ms: median(samples, "validateMs"),
    total_ms: round(samples.map((s) => s.importMs + s.validateMs).sort((a, b) => a - b)[samples.length >> 1])
  });
}

console.table(rows);

if (args.artifactOut) {
  const runtime = currentRuntimeMetadata();
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-generated-size/1",
    generatedAt: new Date().toISOString(),
    metadata: {
      ...runtime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      runs,
      optimize: args.optimize || "default"
    },
    rows
  }, null, 2)}\n`, "utf8");
}

function generatedCase(file, env) {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import(${JSON.stringify(`./generated/${file.split("/").at(-1)}`)});
    const t1 = performance.now();
    const out = mod.loadEnv(env);
    const t2 = performance.now();
    if (!out) throw Error("bad output");
    console.log(JSON.stringify({ importMs: t1 - t0, validateMs: t2 - t1 }));
  `;
}

function smallSchema() {
  return defineEnv({
    NODE_ENV: oneOf(["development", "test", "production"]),
    PORT: int({ min: 1, max: 65535 }),
    DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
    DEBUG: bool(),
    API_KEY: str({ min: 16 })
  });
}

function smallEnv() {
  return {
    NODE_ENV: "production",
    PORT: "3000",
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    DEBUG: "false",
    API_KEY: "1234567890abcdef"
  };
}

function makeSchema(count) {
  const schema = {};
  for (let i = 0; i < count; i++) {
    schema[`STR_${i}`] = str({ min: 1 });
    schema[`INT_${i}`] = int({ min: 1, max: 100000 });
    schema[`BOOL_${i}`] = bool();
    schema[`MODE_${i}`] = oneOf(["on", "off"]);
  }
  return defineEnv(schema);
}

function makeEnv(count) {
  const env = {};
  for (let i = 0; i < count; i++) {
    env[`STR_${i}`] = `value_${i}`;
    env[`INT_${i}`] = String(1000 + i);
    env[`BOOL_${i}`] = i % 2 === 0 ? "true" : "false";
    env[`MODE_${i}`] = i % 2 === 0 ? "on" : "off";
  }
  return env;
}

function median(samples, key) {
  return round(samples.map((sample) => sample[key]).sort((a, b) => a - b)[samples.length >> 1]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--optimize") out.optimize = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
