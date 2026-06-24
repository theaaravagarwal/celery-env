import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { Bench } from "tinybench";
import { defineEnv, list, num, parseEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const W = "(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)";
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(process.env.LIST_COUNT || 200);
const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);
const schema = defineEnv({ STRICT_RATES: list(num({ strict: true, min: 0, max: 100000 })) });
const current = await generated("strict-num-list.current.mjs", generateValidator(schema, { optimize: "speed" }));
const segment = await generated("strict-num-list.segment-proto.mjs", segmentSource());
const envs = {
  short: pool("STRICT_RATES", values(shortCount, (i) => `${i + 1}.25`).join(",")),
  long: pool("STRICT_RATES", values(count, (i) => `${i + 1}.25`).join(",")),
  spaced: pool("STRICT_RATES", values(count, (i) => ` ${i % 2 ? "+.5" : `${i + 1}.`} `).join(",")),
  longDecimal: pool("STRICT_RATES", values(count, (i) => `${i + 1}.123456789`).join(",")),
  invalidLast: pool("STRICT_RATES", `${values(count - 1, (i) => `${i + 1}.25`).join(",")},1e3`)
};

for (const env of [envs.short[0], envs.long[0], envs.spaced[0], envs.longDecimal[0]]) {
  assert.deepEqual(segment.loadEnv(env), current.loadEnv(env));
  assert.deepEqual(segment.loadEnv(env), parseEnv(schema, env));
}
assert.throws(() => current.loadEnv(envs.invalidLast[0]));
assert.throws(() => segment.loadEnv(envs.invalidLast[0]));
assert.throws(() => parseEnv(schema, envs.invalidLast[0]));

let sink;
let roundRobin = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const [name, pool] of Object.entries(envs)) {
  if (name === "invalidLast") {
    bench
      .add(`current ${name} ${count}`, () => { sink = catchError(() => current.loadEnv(next(pool))); })
      .add(`segment ${name} ${count}`, () => { sink = catchError(() => segment.loadEnv(next(pool))); });
  } else {
    const n = name === "short" ? shortCount : count;
    bench
      .add(`current ${name} ${n}`, () => { sink = current.loadEnv(next(pool)); })
      .add(`segment ${name} ${n}`, () => { sink = segment.loadEnv(next(pool)); });
  }
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
await bench.run();
const sizes = [];
for (const candidate of [current, segment]) {
  const source = await readFile(candidate.file);
  sizes.push({ name: candidate.name, raw_bytes: source.length, gzip_bytes: gzipSync(source, { level: 9 }).length });
}
const rows = bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));
console.table(sizes);
console.table(rows);

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-strict-num-list-segment/1",
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
  return { name, file, loadEnv: mod.loadEnv };
}

function segmentSource() {
  return `export function loadEnv(env = process.env) {
  let r;
  let v;
  let _0;
  v = env.STRICT_RATES;
  if (v == null || v === "") (r ??= []).push("STRICT_RATES is required");
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
        if (a === z) (r ??= []).push("STRICT_RATES item must be a strict number");
        else {
          let q = a;
          let d;
          let h;
          let c = v.charCodeAt(q);
          if (c === 43 || c === 45) q++;
          for (; q < z; q++) {
            c = v.charCodeAt(q);
            if (c === 46 && !h) h = 1;
            else if (c < 48 || c > 57) break;
            else d = 1;
          }
          if (!d || q !== z) (r ??= []).push("STRICT_RATES item must be a strict number");
          else {
            const n = +v.slice(a, z);
            if (!isFinite(n)) (r ??= []).push("STRICT_RATES item must be a number");
            else if (n < 0) (r ??= []).push("STRICT_RATES item must be >= 0");
            else if (n > 100000) (r ??= []).push("STRICT_RATES item must be <= 100000");
            else l[i] = n;
          }
        }
        if (e < 0) break;
      }
      if (r?.length === b) _0 = l;
    }
  }
  if (r) throw Error("Invalid environment:\\n- " + r.join("\\n- "));
  return { STRICT_RATES: _0 };
}
export default loadEnv;
`;
}

function values(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i));
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
