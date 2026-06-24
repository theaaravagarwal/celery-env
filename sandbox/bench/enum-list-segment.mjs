import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { Bench } from "tinybench";
import { defineEnv, list, oneOf, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const W = "(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)";
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(process.env.LIST_COUNT || 200);
const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);
const cases = [8, 12, 16, 32].map((n) => makeCase(`string${n}`, values(n), "MODES"));

for (const c of cases) {
  c.current = await generated(`enum-list.${c.name}.current.mjs`, generateValidator(c.schema));
  c.segment = await generated(`enum-list.${c.name}.segment-proto.mjs`, segmentSource(c.values));
  c.currentSize = await sourceSize(c.current.file);
  c.segmentSize = await sourceSize(c.segment.file);
  for (const env of [c.shortEnv[0], c.env[0], c.spacedEnv[0]]) {
    assert.deepEqual(c.segment.loadEnv(env), c.current.loadEnv(env));
    assert.deepEqual(c.segment.loadEnv(env), parseEnv(c.schema, env));
  }
  assert.throws(() => c.current.loadEnv(c.invalidEnv[0]));
  assert.throws(() => c.segment.loadEnv(c.invalidEnv[0]));
  assert.throws(() => parseEnv(c.schema, c.invalidEnv[0]));
}

let sink;
let roundRobin = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const c of cases) {
  bench
    .add(`current ${c.name} ${shortCount}`, () => { sink = c.current.loadEnv(next(c.shortEnv)); })
    .add(`segment ${c.name} ${shortCount}`, () => { sink = c.segment.loadEnv(next(c.shortEnv)); })
    .add(`current ${c.name} ${count}`, () => { sink = c.current.loadEnv(next(c.env)); })
    .add(`segment ${c.name} ${count}`, () => { sink = c.segment.loadEnv(next(c.env)); })
    .add(`current spaced ${c.name} ${count}`, () => { sink = c.current.loadEnv(next(c.spacedEnv)); })
    .add(`segment spaced ${c.name} ${count}`, () => { sink = c.segment.loadEnv(next(c.spacedEnv)); })
    .add(`current invalid-last ${c.name} ${count}`, () => { sink = catchError(() => c.current.loadEnv(next(c.invalidEnv))); })
    .add(`segment invalid-last ${c.name} ${count}`, () => { sink = catchError(() => c.segment.loadEnv(next(c.invalidEnv))); });
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
await bench.run();
const sizes = Object.fromEntries(cases.map((c) => [c.name, { current: c.currentSize, segment: c.segmentSize }]));
const rows = bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));
console.table(Object.entries(sizes).flatMap(([name, size]) => [
  { name: `${name} current`, ...size.current },
  { name: `${name} segment`, ...size.segment }
]));
console.table(rows);

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-enum-list-segment/1",
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
    sizes,
    rows
  }, null, 2)}\n`, "utf8");
}

if (!sink) process.exitCode = 1;

async function generated(name, source) {
  const file = join(__dirname, "generated", name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return { file, loadEnv: mod.loadEnv };
}

async function sourceSize(file) {
  const source = await readFile(file);
  return { raw_bytes: source.length, gzip_bytes: gzipSync(source, { level: 9 }).length };
}

function makeCase(name, options, key) {
  const valid = options.at(-1);
  const shortValue = Array.from({ length: shortCount }, () => valid).join(",");
  const value = Array.from({ length: count }, () => valid).join(",");
  const spacedValue = Array.from({ length: count }, () => ` ${valid} `).join(",");
  const invalidValue = `${Array.from({ length: count - 1 }, () => valid).join(",")},invalid`;
  return {
    name,
    values: options,
    schema: defineEnv({ [key]: list(oneOf(options)) }),
    shortEnv: pool(key, shortValue),
    env: pool(key, value),
    spacedEnv: pool(key, spacedValue),
    invalidEnv: pool(key, invalidValue)
  };
}

function segmentSource(options) {
  const check = groupedChecks(options, "a", "z");
  return `export function loadEnv(env = process.env) {
  let r;
  let v;
  let _0;
  v = env.MODES;
  if (v == null || v === "") (r ??= []).push("MODES is required");
  else {
    {
      const l = [];
      const b = r?.length;
      for (let i = 0, s = 0, e;; i++, s = e + 1) {
        e = v.indexOf(",", s);
        let a = s;
        let z = e < 0 ? v.length : e;
        while (a < z) { const c = v.charCodeAt(a); if (!${W}) break; a++; }
        while (z > a) { const c = v.charCodeAt(z - 1); if (!${W}) break; z--; }
        ${check}
        else (r ??= []).push("MODES item must be one of ${options.join(", ")}");
        if (e < 0) break;
      }
      if (r?.length === b) _0 = l;
    }
  }
  if (r) throw Error("Invalid environment:\\n- " + r.join("\\n- "));
  return { MODES: _0 };
}
export default loadEnv;
`;
}

function groupedChecks(options, a, z) {
  const byLength = new Map();
  for (const value of options) {
    const list = byLength.get(value.length) || [];
    list.push(value);
    byLength.set(value.length, list);
  }
  const branches = [...byLength].sort((x, y) => x[0] - y[0]).map(([length, list]) => {
    const checks = list.map((value) => `v.startsWith(${JSON.stringify(value)}, ${a})`).join(" || ");
    return `if (${z} - ${a} === ${length} && (${checks})) l[i] = v.slice(${a}, ${z});`;
  });
  return branches.map((branch, index) => index ? `else ${branch}` : branch).join("\n        ");
}

function values(count) {
  return Array.from({ length: count }, (_, i) => `mode_${i}`);
}

function pool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function next(pool) {
  return pool[roundRobin++ & 3];
}

function catchError(fn) {
  try {
    fn();
  } catch (error) {
    return error.message.length;
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
