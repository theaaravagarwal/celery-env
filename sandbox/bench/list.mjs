import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { bool, defineEnv, int, list, num, oneOf, parseEnv, str, url } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(process.env.LIST_COUNT || 200);
const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);
const enumValues = ["alpha", "beta", "release", "staging", "preview", "production", "test", "dev"];
const intEnv = envPool("IDS", Array.from({ length: count }, (_, i) => String(i + 1)).join(","));
const strictIntEnv = envPool("STRICT_IDS", Array.from({ length: count }, (_, i) => String(i + 1)).join(","));
const strictNumEnv = envPool("STRICT_RATES", Array.from({ length: count }, (_, i) => `${i + 1}.25`).join(","));
const boolEnv = envPool("FLAGS", Array.from({ length: count }, (_, i) => (i % 2 ? "false" : "true")).join(","));
const stringEnv = envPool("ORIGINS", Array.from({ length: count }, (_, i) => `https://app${i}.example.com`).join(","));
const urlEnv = envPool("URLS", Array.from({ length: count }, (_, i) => `https://app${i}.example.com/path`).join(","));
const enumEnv = envPool("MODES", Array.from({ length: count }, (_, i) => enumValues[i % enumValues.length]).join(","));
const shortIntEnv = envPool("IDS", Array.from({ length: shortCount }, (_, i) => String(i + 1)).join(","));
const shortStrictNumEnv = envPool("STRICT_RATES", Array.from({ length: shortCount }, (_, i) => `${i + 1}.25`).join(","));
const shortBoolEnv = envPool("FLAGS", Array.from({ length: shortCount }, (_, i) => (i % 2 ? "false" : "true")).join(","));
const shortStringEnv = envPool("ORIGINS", Array.from({ length: shortCount }, (_, i) => `https://app${i}.example.com`).join(","));
const shortUrlEnv = envPool("URLS", Array.from({ length: shortCount }, (_, i) => `https://app${i}.example.com/path`).join(","));
const shortEnumEnv = envPool("MODES", Array.from({ length: shortCount }, (_, i) => enumValues[i % enumValues.length]).join(","));
const intSchema = defineEnv({ IDS: list(int({ min: 1, max: 100000 })) });
const strictIntSchema = defineEnv({ STRICT_IDS: list(int({ strict: true, min: 1, max: 100000 })) });
const strictNumSchema = defineEnv({ STRICT_RATES: list(num({ strict: true, min: 1, max: 100000 })) });
const boolSchema = defineEnv({ FLAGS: list(bool()) });
const stringSchema = defineEnv({ ORIGINS: list(str({ startsWith: "https://", includes: ".example" })) });
const urlSchema = defineEnv({ URLS: list(url({ protocols: ["https"] })) });
const enumSchema = defineEnv({ MODES: list(oneOf(enumValues)) });
const intGenerated = await generated(intSchema, "list.int.generated.mjs");
const strictIntGenerated = await generated(strictIntSchema, "list.strict-int.generated.mjs");
const strictNumGenerated = await generated(strictNumSchema, "list.strict-num.generated.mjs");
const strictNumSpeedGenerated = await generated(strictNumSchema, "list.strict-num.speed.generated.mjs", { optimize: "speed" });
const boolGenerated = await generated(boolSchema, "list.bool.generated.mjs");
const stringGenerated = await generated(stringSchema, "list.string.generated.mjs");
const stringSpeedGenerated = await generated(stringSchema, "list.string.speed.generated.mjs", { optimize: "speed" });
const urlGenerated = await generated(urlSchema, "list.url.generated.mjs");
const enumGenerated = await generated(enumSchema, "list.enum.generated.mjs");

assert.equal(intGenerated.loadEnv(intEnv[0]).IDS.length, count);
assert.equal(strictIntGenerated.loadEnv(strictIntEnv[0]).STRICT_IDS.length, count);
assert.equal(strictNumGenerated.loadEnv(strictNumEnv[0]).STRICT_RATES.length, count);
assert.equal(strictNumSpeedGenerated.loadEnv(strictNumEnv[0]).STRICT_RATES.length, count);
assert.equal(boolGenerated.loadEnv(boolEnv[0]).FLAGS.length, count);
assert.equal(stringGenerated.loadEnv(stringEnv[0]).ORIGINS.length, count);
assert.equal(stringSpeedGenerated.loadEnv(stringEnv[0]).ORIGINS.length, count);
assert.equal(urlGenerated.loadEnv(urlEnv[0]).URLS.length, count);
assert.equal(enumGenerated.loadEnv(enumEnv[0]).MODES.length, count);
assert.equal(intGenerated.loadEnv(shortIntEnv[0]).IDS.length, shortCount);
assert.equal(strictNumGenerated.loadEnv(shortStrictNumEnv[0]).STRICT_RATES.length, shortCount);
assert.equal(strictNumSpeedGenerated.loadEnv(shortStrictNumEnv[0]).STRICT_RATES.length, shortCount);
assert.equal(boolGenerated.loadEnv(shortBoolEnv[0]).FLAGS.length, shortCount);
assert.equal(stringSpeedGenerated.loadEnv(shortStringEnv[0]).ORIGINS.length, shortCount);
assert.equal(urlGenerated.loadEnv(shortUrlEnv[0]).URLS.length, shortCount);
assert.equal(parseEnv(intSchema, intEnv[1]).IDS.length, count);
assert.equal(parseEnv(strictNumSchema, strictNumEnv[1]).STRICT_RATES.length, count);
assert.equal(parseEnv(boolSchema, boolEnv[1]).FLAGS.length, count);
assert.equal(parseEnv(stringSchema, stringEnv[1]).ORIGINS.length, count);
assert.equal(parseEnv(urlSchema, urlEnv[1]).URLS.length, count);
assert.equal(parseEnv(enumSchema, enumEnv[1]).MODES.length, count);

let sink;
let roundRobin = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add(`generated list int ${shortCount}`, () => { sink = intGenerated.loadEnv(next(shortIntEnv)); })
  .add(`runtime list int ${shortCount}`, () => { sink = parseEnv(intSchema, next(shortIntEnv)); })
  .add(`generated list strict num ${shortCount}`, () => { sink = strictNumGenerated.loadEnv(next(shortStrictNumEnv)); })
  .add(`generated list strict num speed ${shortCount}`, () => { sink = strictNumSpeedGenerated.loadEnv(next(shortStrictNumEnv)); })
  .add(`runtime list strict num ${shortCount}`, () => { sink = parseEnv(strictNumSchema, next(shortStrictNumEnv)); })
  .add(`generated list bool ${shortCount}`, () => { sink = boolGenerated.loadEnv(next(shortBoolEnv)); })
  .add(`runtime list bool ${shortCount}`, () => { sink = parseEnv(boolSchema, next(shortBoolEnv)); })
  .add(`generated list string ${shortCount}`, () => { sink = stringGenerated.loadEnv(next(shortStringEnv)); })
  .add(`generated list string speed ${shortCount}`, () => { sink = stringSpeedGenerated.loadEnv(next(shortStringEnv)); })
  .add(`runtime list string ${shortCount}`, () => { sink = parseEnv(stringSchema, next(shortStringEnv)); })
  .add(`generated list url protocols ${shortCount}`, () => { sink = urlGenerated.loadEnv(next(shortUrlEnv)); })
  .add(`runtime list url protocols ${shortCount}`, () => { sink = parseEnv(urlSchema, next(shortUrlEnv)); })
  .add(`generated list enum ${shortCount}`, () => { sink = enumGenerated.loadEnv(next(shortEnumEnv)); })
  .add(`runtime list enum ${shortCount}`, () => { sink = parseEnv(enumSchema, next(shortEnumEnv)); })
  .add(`generated list int ${count}`, () => { sink = intGenerated.loadEnv(next(intEnv)); })
  .add(`runtime list int ${count}`, () => { sink = parseEnv(intSchema, next(intEnv)); })
  .add(`generated list strict int ${count}`, () => { sink = strictIntGenerated.loadEnv(next(strictIntEnv)); })
  .add(`runtime list strict int ${count}`, () => { sink = parseEnv(strictIntSchema, next(strictIntEnv)); })
  .add(`generated list strict num ${count}`, () => { sink = strictNumGenerated.loadEnv(next(strictNumEnv)); })
  .add(`generated list strict num speed ${count}`, () => { sink = strictNumSpeedGenerated.loadEnv(next(strictNumEnv)); })
  .add(`runtime list strict num ${count}`, () => { sink = parseEnv(strictNumSchema, next(strictNumEnv)); })
  .add(`generated list bool ${count}`, () => { sink = boolGenerated.loadEnv(next(boolEnv)); })
  .add(`runtime list bool ${count}`, () => { sink = parseEnv(boolSchema, next(boolEnv)); })
  .add(`generated list string ${count}`, () => { sink = stringGenerated.loadEnv(next(stringEnv)); })
  .add(`generated list string speed ${count}`, () => { sink = stringSpeedGenerated.loadEnv(next(stringEnv)); })
  .add(`runtime list string ${count}`, () => { sink = parseEnv(stringSchema, next(stringEnv)); })
  .add(`generated list url protocols ${count}`, () => { sink = urlGenerated.loadEnv(next(urlEnv)); })
  .add(`runtime list url protocols ${count}`, () => { sink = parseEnv(urlSchema, next(urlEnv)); })
  .add(`generated list enum ${count}`, () => { sink = enumGenerated.loadEnv(next(enumEnv)); })
  .add(`runtime list enum ${count}`, () => { sink = parseEnv(enumSchema, next(enumEnv)); });

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
    schema: "celery-list/1",
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
    rows
  }, null, 2)}\n`, "utf8");
}

if (!sink) process.exitCode = 1;

async function generated(schema, file, options) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema, options), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function envPool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function next(pool) {
  return pool[roundRobin++ & 3];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
