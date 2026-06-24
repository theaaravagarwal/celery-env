import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import * as z from "zod";
import * as v from "valibot";
import { defineEnv, int, json, num, oneOf, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const benchTime = Number(process.env.BENCH_TIME || 500);
const benchWarmup = Number(process.env.BENCH_WARMUP || 200);

const env = Object.freeze({
  NODE_ENV: "production",
  FEATURE_MATRIX: "{\"search\":true,\"checkout\":false}",
  LIMITS: "{\"requests\":1000,\"burst\":50}",
  PORT: "8080",
  RATE: "0.75"
});

const invalidEnv = Object.freeze({
  NODE_ENV: "staging",
  FEATURE_MATRIX: "{",
  LIMITS: "[",
  PORT: "0",
  RATE: "2"
});

const invalidWhitespaceEnv = Object.freeze({
  ...invalidEnv,
  FEATURE_MATRIX: " {",
  LIMITS: " ["
});

const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  FEATURE_MATRIX: json(),
  LIMITS: json(),
  PORT: int({ min: 1, max: 65535 }),
  RATE: num({ min: 0, max: 1 })
});

const zodSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  FEATURE_MATRIX: z.string().transform(JSON.parse),
  LIMITS: z.string().transform(JSON.parse),
  PORT: z.coerce.number().int().min(1).max(65535),
  RATE: z.coerce.number().min(0).max(1)
});

const valibotSchema = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  FEATURE_MATRIX: v.pipe(v.string(), v.transform(JSON.parse)),
  LIMITS: v.pipe(v.string(), v.transform(JSON.parse)),
  PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
  RATE: v.pipe(v.string(), v.transform(Number), v.minValue(0), v.maxValue(1))
});

const currentSource = generateValidator(schema);
const baselineSource = removePrecheck(currentSource);

const current = await generated("json-current", currentSource);
const baseline = await generated("json-no-precheck", baselineSource);

assert.deepEqual(current.loadEnv(env), parseEnv(schema, env));
assert.deepEqual(baseline.loadEnv(env), parseEnv(schema, env));
assert.equal(catchError(() => current.loadEnv(invalidEnv)) > 0, true);
assert.equal(catchError(() => baseline.loadEnv(invalidEnv)) > 0, true);
assert.equal(catchError(() => current.loadEnv(invalidWhitespaceEnv)) > 0, true);
assert.equal(catchError(() => baseline.loadEnv(invalidWhitespaceEnv)) > 0, true);

console.table([
  sizeRow("baseline no precheck", baselineSource),
  sizeRow("current precheck", currentSource)
]);

let sink;
const bench = new Bench({ time: benchTime, warmupTime: benchWarmup });

bench
  .add("baseline generated valid", () => { sink = baseline.loadEnv(env); })
  .add("current generated valid", () => { sink = current.loadEnv(env); })
  .add("baseline generated invalid", () => { sink = catchError(() => baseline.loadEnv(invalidEnv)); })
  .add("current generated invalid", () => { sink = catchError(() => current.loadEnv(invalidEnv)); })
  .add("baseline generated invalid whitespace", () => { sink = catchError(() => baseline.loadEnv(invalidWhitespaceEnv)); })
  .add("current generated invalid whitespace", () => { sink = catchError(() => current.loadEnv(invalidWhitespaceEnv)); })
  .add("zod invalid", () => { sink = catchError(() => z.parse(zodSchema, invalidEnv)); })
  .add("valibot invalid", () => { sink = catchError(() => v.parse(valibotSchema, invalidEnv)); });

await bench.run();

const rows = bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));

console.table(rows);
if (!sink) process.exitCode = 1;

function removePrecheck(source) {
  return source
    .replace(`function J(v){return v[0]=="{"&&v[v.length-1]!="}"||v[0]=="["&&v[v.length-1]!="]"}\n`, "")
    .replaceAll(/(\s*)if\(!J\(v\)\)try\{(_\d+)=JSON\.parse\(v\)\}catch\{}\n\1if\(\2===undefined\)([^;]+);/g, "$1try { $2 = JSON.parse(v); } catch { $3; }");
}

async function generated(name, source) {
  const out = join(__dirname, "generated", `${name}.mjs`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, source, "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function sizeRow(name, source) {
  return {
    name,
    bytes: Buffer.byteLength(source),
    gzip: gzipSync(source, { level: 9 }).length
  };
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
