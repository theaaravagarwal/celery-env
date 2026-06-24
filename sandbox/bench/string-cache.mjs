import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { bool, defineEnv, int, oneOf, parseEnv, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
  API_KEY: str({ min: 16, includes: "key" }),
  REGION: oneOf(["iad1", "sfo1", "fra1", "sin1"]),
  DEBUG: bool(),
  PORT: int({ min: 1, max: 65535 })
});
const generated = await loadGenerated(schema, "string-cache.generated.mjs");
const stableEnv = Object.freeze(baseEnv());
const stablePool = Array.from({ length: 4 }, () => stableEnv);
const cache = new Map();

assert.deepEqual(generated.loadEnv(stableEnv), parseEnv(schema, stableEnv));
assert.deepEqual(parseEnv(schema, internEnv(freshEnv())), parseEnv(schema, freshEnv()));

let sink;
let rr = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add("runtime stable strings", () => { sink = parseEnv(schema, next(stablePool)); })
  .add("runtime fresh strings", () => { sink = parseEnv(schema, freshEnv()); })
  .add("runtime interned fresh strings", () => { sink = parseEnv(schema, internEnv(freshEnv())); })
  .add("generated stable strings", () => { sink = generated.loadEnv(next(stablePool)); })
  .add("generated fresh strings", () => { sink = generated.loadEnv(freshEnv()); })
  .add("generated interned fresh strings", () => { sink = generated.loadEnv(internEnv(freshEnv())); });

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
await bench.run();
console.table(bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
})));

if (!sink) process.exitCode = 1;

async function loadGenerated(schema, file) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function baseEnv() {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    API_KEY: "key_1234567890abcdef",
    REGION: "iad1",
    DEBUG: "false",
    PORT: "3000"
  };
}

function freshEnv() {
  const env = baseEnv();
  for (const key of Object.keys(env)) env[key] = (`_${env[key]}`).slice(1);
  return env;
}

function internEnv(env) {
  for (const key of Object.keys(env)) env[key] = intern(env[key]);
  return env;
}

function intern(value) {
  let cached = cache.get(value);
  if (cached === undefined) {
    cache.set(value, value);
    cached = value;
  }
  return cached;
}

function next(pool) {
  return pool[rr++ & 3];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
