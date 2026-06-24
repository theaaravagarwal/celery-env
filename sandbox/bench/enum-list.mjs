import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { defineEnv, list, oneOf, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(process.env.LIST_COUNT || 200);
const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);
const cases = [
  makeCase("string3", values(3), "MODES3"),
  makeCase("string8", values(8), "MODES8"),
  makeCase("string12", values(12), "MODES12"),
  makeCase("string16", values(16), "MODES16"),
  makeCase("string32", values(32), "MODES32"),
  makeCase("mixed8", ["0", "1", "2", "3", 4, 5, true, false], "MIXED")
];

for (const c of cases) {
  c.generated = await generated(c.schema, `enum-list.${c.name}.generated.mjs`);
  c.size = await sourceSize(c.generated.file);
  assert.deepEqual(c.generated.loadEnv(c.env[0]), parseEnv(c.schema, c.env[1]));
  assert.deepEqual(c.generated.loadEnv(c.shortEnv[0]), parseEnv(c.schema, c.shortEnv[1]));
  assert.throws(() => c.generated.loadEnv(c.invalidEnv[0]));
  assert.throws(() => parseEnv(c.schema, c.invalidEnv[1]));
}

let sink;
let roundRobin = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const c of cases) {
  bench
    .add(`generated enum list ${c.name} ${shortCount}`, () => { sink = c.generated.loadEnv(next(c.shortEnv)); })
    .add(`runtime enum list ${c.name} ${shortCount}`, () => { sink = parseEnv(c.schema, next(c.shortEnv)); })
    .add(`generated enum list ${c.name} ${count}`, () => { sink = c.generated.loadEnv(next(c.env)); })
    .add(`runtime enum list ${c.name} ${count}`, () => { sink = parseEnv(c.schema, next(c.env)); })
    .add(`generated enum list invalid-last ${c.name} ${count}`, () => { sink = catchError(() => c.generated.loadEnv(next(c.invalidEnv))); })
    .add(`runtime enum list invalid-last ${c.name} ${count}`, () => { sink = catchError(() => parseEnv(c.schema, next(c.invalidEnv))); });
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
await bench.run();
const rows = bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));
console.table(rows);

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-enum-list/1",
    generatedAt: new Date().toISOString(),
    metadata: {
      ...runtime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      listCount: count,
      shortListCount: shortCount,
      benchTimeMs: Number(process.env.BENCH_TIME || 750),
      benchWarmupMs: Number(process.env.BENCH_WARMUP || 250)
    },
    generatedSizes: Object.fromEntries(cases.map((c) => [c.name, c.size])),
    rows
  }, null, 2)}\n`, "utf8");
}

if (!sink) process.exitCode = 1;

async function generated(schema, file) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema), "utf8");
  const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  return { loadEnv: mod.loadEnv, file: out };
}

async function sourceSize(file) {
  const source = await readFile(file);
  return { raw_bytes: source.length, gzip_bytes: gzipSync(source, { level: 9 }).length };
}

function makeCase(name, options, key) {
  const valid = options.at(-1);
  const envValue = Array.from({ length: count }, () => String(valid)).join(",");
  const shortValue = Array.from({ length: shortCount }, () => String(valid)).join(",");
  const invalidValue = `${Array.from({ length: count - 1 }, () => String(valid)).join(",")},invalid`;
  const schema = defineEnv({ [key]: list(oneOf(options)) });
  return {
    name,
    schema,
    env: envPool(key, envValue),
    shortEnv: envPool(key, shortValue),
    invalidEnv: envPool(key, invalidValue)
  };
}

function values(count) {
  return Array.from({ length: count }, (_, i) => `mode_${i}`);
}

function envPool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function next(pool) {
  return pool[roundRobin++ & 3];
}

function catchError(fn) {
  try {
    fn();
  } catch (error) {
    return error.name;
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
