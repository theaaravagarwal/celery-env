import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { defineEnv, oneOf, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const string2 = values(2);
const string8 = values(8);
const string32 = values(32);
const mixed8 = ["0", "1", "2", "3", 4, 5, true, false];
const schemas = {
  string2: defineEnv({ MODE: oneOf(string2) }),
  string8: defineEnv({ MODE: oneOf(string8) }),
  string32: defineEnv({ MODE: oneOf(string32) }),
  mixed8: defineEnv({ MODE: oneOf(mixed8) })
};
const envs = {
  string2: Object.freeze({ MODE: string2.at(-1) }),
  string8: Object.freeze({ MODE: string8.at(-1) }),
  string32: Object.freeze({ MODE: string32.at(-1) }),
  mixed8: Object.freeze({ MODE: "false" })
};
const generated = {};
const generatedSpeed = {};

for (const [name, schema] of Object.entries(schemas)) {
  generated[name] = await loadGenerated(schema, `enum.${name}.generated.mjs`);
  generatedSpeed[name] = await loadGenerated(schema, `enum.${name}.speed.generated.mjs`, { optimize: "speed" });
  assert.deepEqual(generated[name].loadEnv(envs[name]), parseEnv(schema, envs[name]));
  assert.deepEqual(generatedSpeed[name].loadEnv(envs[name]), parseEnv(schema, envs[name]));
}

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const name of Object.keys(schemas)) {
  bench
    .add(`generated enum ${name}`, () => { sink = generated[name].loadEnv(envs[name]); })
    .add(`generated enum speed ${name}`, () => { sink = generatedSpeed[name].loadEnv(envs[name]); })
    .add(`runtime enum ${name}`, () => { sink = parseEnv(schemas[name], envs[name]); });
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
    schema: "celery-enum/1",
    generatedAt: new Date().toISOString(),
    metadata: {
      ...runtime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      benchTimeMs: Number(process.env.BENCH_TIME || 750),
      benchWarmupMs: Number(process.env.BENCH_WARMUP || 250)
    },
    rows
  }, null, 2)}\n`, "utf8");
}

if (!sink) process.exitCode = 1;

async function loadGenerated(schema, file, options) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema, options), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function values(count) {
  return Array.from({ length: count }, (_, i) => `mode_${i}`);
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
