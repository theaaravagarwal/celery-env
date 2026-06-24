import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { defineEnv, int, num, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const cases = [
  {
    name: "int-bounded",
    schema: defineEnv({ PORT: int({ strict: true, min: 1, max: 65535 }) }),
    valid: Object.freeze({ PORT: "3000" }),
    invalid: Object.freeze({ PORT: "1e3" })
  },
  {
    name: "num-dot",
    schema: defineEnv({ RATE_DOT: num({ strict: true, min: 0, max: 1 }) }),
    valid: Object.freeze({ RATE_DOT: ".5" }),
    invalid: Object.freeze({ RATE_DOT: "1e3" })
  },
  {
    name: "num-decimal",
    schema: defineEnv({ RATE_DECIMAL: num({ strict: true, min: 0, max: 100 }) }),
    valid: Object.freeze({ RATE_DECIMAL: "1.25" }),
    invalid: Object.freeze({ RATE_DECIMAL: " " })
  },
  {
    name: "num-integer-text",
    schema: defineEnv({ RATE_INTEGER_TEXT: num({ strict: true, min: 0, max: 1000 }) }),
    valid: Object.freeze({ RATE_INTEGER_TEXT: "123" }),
    invalid: Object.freeze({ RATE_INTEGER_TEXT: "+" })
  },
  {
    name: "num-trailing-dot",
    schema: defineEnv({ RATE_TRAILING_DOT: num({ strict: true, min: 0, max: 10 }) }),
    valid: Object.freeze({ RATE_TRAILING_DOT: "1." }),
    invalid: Object.freeze({ RATE_TRAILING_DOT: "." })
  },
  {
    name: "num-signed-dot",
    schema: defineEnv({ RATE_SIGNED_DOT: num({ strict: true, min: -1, max: 1 }) }),
    valid: Object.freeze({ RATE_SIGNED_DOT: "+.5" }),
    invalid: Object.freeze({ RATE_SIGNED_DOT: "+." })
  }
];

for (const c of cases) {
  c.generated = await generated(c.schema, `strict-numeric.${c.name}.generated.mjs`);
  c.generatedSpeed = await generated(c.schema, `strict-numeric.${c.name}.speed.generated.mjs`, { optimize: "speed" });
  assert.deepEqual(c.generated.loadEnv(c.valid), parseEnv(c.schema, c.valid));
  assert.deepEqual(c.generatedSpeed.loadEnv(c.valid), parseEnv(c.schema, c.valid));
  assert.throws(() => c.generated.loadEnv(c.invalid));
  assert.throws(() => c.generatedSpeed.loadEnv(c.invalid));
  assert.throws(() => parseEnv(c.schema, c.invalid));
}

Object.assign(process.env, Object.fromEntries(cases.flatMap((c) => Object.entries(c.valid))));

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const c of cases) {
  bench
    .add(`generated default ${c.name}`, () => { sink = c.generated.loadEnv(c.valid); })
    .add(`generated speed ${c.name}`, () => { sink = c.generatedSpeed.loadEnv(c.valid); })
    .add(`runtime ${c.name}`, () => { sink = parseEnv(c.schema, c.valid); })
    .add(`generated default process.env ${c.name}`, () => { sink = c.generated.loadEnv(); })
    .add(`generated speed process.env ${c.name}`, () => { sink = c.generatedSpeed.loadEnv(); })
    .add(`runtime process.env ${c.name}`, () => { sink = parseEnv(c.schema); })
    .add(`generated default invalid ${c.name}`, () => { sink = catchError(() => c.generated.loadEnv(c.invalid)); })
    .add(`generated speed invalid ${c.name}`, () => { sink = catchError(() => c.generatedSpeed.loadEnv(c.invalid)); })
    .add(`runtime invalid ${c.name}`, () => { sink = catchError(() => parseEnv(c.schema, c.invalid)); });
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
    schema: "celery-strict-numeric/1",
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

async function generated(schema, file, options) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema, options), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
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
