import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  PORT: int({ min: 1, max: 65535 }),
  DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
  DEBUG: bool(),
  API_KEY: str({ min: 16 })
});
const valid = Object.freeze({
  NODE_ENV: "production",
  PORT: "3000",
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  DEBUG: "false",
  API_KEY: "1234567890abcdef"
});
const invalidFirst = Object.freeze({ ...valid, NODE_ENV: "bad" });
const invalidLast = Object.freeze({ ...valid, API_KEY: "short" });
const invalidMany = Object.freeze({
  NODE_ENV: "bad",
  PORT: "0",
  DATABASE_URL: "mysql://localhost/app",
  DEBUG: "maybe",
  API_KEY: "short"
});

const aggregate = await generated("fail-fast.aggregate.generated.mjs", false);
const failFast = await generated("fail-fast.generated.mjs", true);
assert.equal(aggregate.loadEnv(valid).PORT, 3000);
assert.equal(failFast.loadEnv(valid).PORT, 3000);
assert.ok(catchError(() => aggregate.loadEnv(invalidMany)) > catchError(() => failFast.loadEnv(invalidMany)));

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add("generated aggregate valid", () => { sink = aggregate.loadEnv(valid); })
  .add("generated fail-fast valid", () => { sink = failFast.loadEnv(valid); })
  .add("generated aggregate invalid first", () => { sink = catchError(() => aggregate.loadEnv(invalidFirst)); })
  .add("generated fail-fast invalid first", () => { sink = catchError(() => failFast.loadEnv(invalidFirst)); })
  .add("generated aggregate invalid last", () => { sink = catchError(() => aggregate.loadEnv(invalidLast)); })
  .add("generated fail-fast invalid last", () => { sink = catchError(() => failFast.loadEnv(invalidLast)); })
  .add("generated aggregate invalid many", () => { sink = catchError(() => aggregate.loadEnv(invalidMany)); })
  .add("generated fail-fast invalid many", () => { sink = catchError(() => failFast.loadEnv(invalidMany)); });

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
    schema: "celery-fail-fast/1",
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

async function generated(file, failFast) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema, { failFast }), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function catchError(fn) {
  try {
    fn();
    return 0;
  } catch (error) {
    return String(error.message).length || 1;
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
