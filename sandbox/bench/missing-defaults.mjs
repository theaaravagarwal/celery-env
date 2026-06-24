import { Bench } from "tinybench";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cpus } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { defineEnv, parseEnv, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const counts = (args.counts || "40,160").split(",").map((value) => Number(value.trim()));
const rows = [];
let sink;

for (const count of counts) {
  const cases = [
    ["default", defineEnv(makeSchema(count, "default")), Object.freeze({ NODE_ENV: "production" })],
    ["optional", defineEnv(makeSchema(count, "optional")), Object.freeze({ NODE_ENV: "production" })],
    ["devDefault dev", defineEnv(makeSchema(count, "devDefault")), Object.freeze({ NODE_ENV: "development" })],
    ["testDefault test", defineEnv(makeSchema(count, "testDefault")), Object.freeze({ NODE_ENV: "test" })]
  ];

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
    const [name, schema, env] = cases[caseIndex];
    const generated = await generatedModule(schema, `missing.${count}.${caseIndex}.mjs`);
    assert.deepEqual(generated.loadEnv(env), parseEnv(schema, env));
    Object.assign(process.env, env);
    const bench = new Bench({
      time: Number(process.env.BENCH_TIME || 750),
      warmupTime: Number(process.env.BENCH_WARMUP || 250)
    });
    bench
      .add(`runtime ${name} ${count}`, () => { sink = parseEnv(schema, env); })
      .add(`runtime process.env ${name} ${count}`, () => { sink = parseEnv(schema); })
      .add(`generated ${name} ${count}`, () => { sink = generated.loadEnv(env); })
      .add(`generated process.env ${name} ${count}`, () => { sink = generated.loadEnv(); });
    await bench.run();
    for (const task of bench.tasks) {
      rows.push({
        name: task.name,
        hz: Math.round(task.result?.throughput?.mean || 0),
        mean_us: round((task.result?.latency?.mean || 0) * 1000),
        p75_us: round((task.result?.latency?.p75 || 0) * 1000),
        p99_us: round((task.result?.latency?.p99 || 0) * 1000),
        rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
      });
    }
  }
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
console.table(rows);
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-missing-defaults/1",
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

async function generatedModule(schema, file) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function makeSchema(count, kind) {
  const schema = {};
  for (let i = 0; i < count; i++) {
    const key = `K_${i}`;
    if (kind === "default") schema[key] = str({ default: `fallback_${i}` });
    else if (kind === "optional") schema[key] = str({ optional: true });
    else if (kind === "devDefault") schema[key] = str({ devDefault: `dev_${i}` });
    else schema[key] = str({ testDefault: `test_${i}`, devDefault: `dev_${i}` });
  }
  return schema;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--counts") out.counts = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
