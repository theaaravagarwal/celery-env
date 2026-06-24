import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { cpus } from "node:os";
import { Bench } from "tinybench";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const args = parseArgs(process.argv.slice(2));
const values = {
  NODE_ENV: "production",
  PORT: "3000",
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  API_KEY: "1234567890abcdef",
  DEBUG: "false"
};
const plainEnv = Object.freeze({ ...values });
Object.assign(process.env, values);

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add("property plain object", () => { sink = validateProperty(plainEnv); })
  .add("property process.env explicit", () => { sink = validateProperty(process.env); })
  .add("property process.env default", () => { sink = validateProperty(); })
  .add("direct process.env", () => { sink = validateDirectProcessEnv(); })
  .add("destructure plain object", () => { sink = validateDestructure(plainEnv); })
  .add("destructure process.env explicit", () => { sink = validateDestructure(process.env); })
  .add("destructure process.env default", () => { sink = validateDestructure(); });

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
    schema: "celery-process-env-shapes/1",
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

function validateProperty(env = process.env) {
  let r;
  let v;
  let _0, _1, _2, _3, _4, _5;
  v = env.NODE_ENV;
  if (v === "development" || v === "test" || v === "production") _0 = v;
  else (r ??= []).push("NODE_ENV must be one of development, test, production");
  v = env.PORT;
  v = +v;
  if ((v | 0) !== v) (r ??= []).push("PORT must be an integer");
  else if (v < 1) (r ??= []).push("PORT must be >= 1");
  else if (v > 65535) (r ??= []).push("PORT must be <= 65535");
  else _1 = v;
  v = env.DATABASE_URL;
  if (v.length < 1) (r ??= []).push("DATABASE_URL must have length >= 1");
  else if (!v.startsWith("postgres://")) (r ??= []).push("DATABASE_URL must start with postgres://");
  else _2 = v;
  v = env.REDIS_URL;
  if (v.length < 1) (r ??= []).push("REDIS_URL must have length >= 1");
  else if (!v.startsWith("redis://")) (r ??= []).push("REDIS_URL must start with redis://");
  else _3 = v;
  v = env.API_KEY;
  if (v.length < 16) (r ??= []).push("API_KEY must have length >= 16");
  else _4 = v;
  v = env.DEBUG;
  if (v === "true" || v === "1" || v === "yes" || v === "on") _5 = true;
  else if (v === "false" || v === "0" || v === "no" || v === "off") _5 = false;
  else (r ??= []).push("DEBUG must be a boolean");
  if (r) throw Error(r.join(", "));
  return { NODE_ENV: _0, PORT: _1, DATABASE_URL: _2, REDIS_URL: _3, API_KEY: _4, DEBUG: _5 };
}

function validateDirectProcessEnv() {
  let r;
  let v;
  let _0, _1, _2, _3, _4, _5;
  v = process.env.NODE_ENV;
  if (v === "development" || v === "test" || v === "production") _0 = v;
  else (r ??= []).push("NODE_ENV must be one of development, test, production");
  v = process.env.PORT;
  v = +v;
  if ((v | 0) !== v) (r ??= []).push("PORT must be an integer");
  else if (v < 1) (r ??= []).push("PORT must be >= 1");
  else if (v > 65535) (r ??= []).push("PORT must be <= 65535");
  else _1 = v;
  v = process.env.DATABASE_URL;
  if (v.length < 1) (r ??= []).push("DATABASE_URL must have length >= 1");
  else if (!v.startsWith("postgres://")) (r ??= []).push("DATABASE_URL must start with postgres://");
  else _2 = v;
  v = process.env.REDIS_URL;
  if (v.length < 1) (r ??= []).push("REDIS_URL must have length >= 1");
  else if (!v.startsWith("redis://")) (r ??= []).push("REDIS_URL must start with redis://");
  else _3 = v;
  v = process.env.API_KEY;
  if (v.length < 16) (r ??= []).push("API_KEY must have length >= 16");
  else _4 = v;
  v = process.env.DEBUG;
  if (v === "true" || v === "1" || v === "yes" || v === "on") _5 = true;
  else if (v === "false" || v === "0" || v === "no" || v === "off") _5 = false;
  else (r ??= []).push("DEBUG must be a boolean");
  if (r) throw Error(r.join(", "));
  return { NODE_ENV: _0, PORT: _1, DATABASE_URL: _2, REDIS_URL: _3, API_KEY: _4, DEBUG: _5 };
}

function validateDestructure(env = process.env) {
  let r;
  let _0, _1, _2, _3, _4, _5;
  const { NODE_ENV, PORT, DATABASE_URL, REDIS_URL, API_KEY, DEBUG } = env;
  if (NODE_ENV === "development" || NODE_ENV === "test" || NODE_ENV === "production") _0 = NODE_ENV;
  else (r ??= []).push("NODE_ENV must be one of development, test, production");
  const p = +PORT;
  if ((p | 0) !== p) (r ??= []).push("PORT must be an integer");
  else if (p < 1) (r ??= []).push("PORT must be >= 1");
  else if (p > 65535) (r ??= []).push("PORT must be <= 65535");
  else _1 = p;
  if (DATABASE_URL.length < 1) (r ??= []).push("DATABASE_URL must have length >= 1");
  else if (!DATABASE_URL.startsWith("postgres://")) (r ??= []).push("DATABASE_URL must start with postgres://");
  else _2 = DATABASE_URL;
  if (REDIS_URL.length < 1) (r ??= []).push("REDIS_URL must have length >= 1");
  else if (!REDIS_URL.startsWith("redis://")) (r ??= []).push("REDIS_URL must start with redis://");
  else _3 = REDIS_URL;
  if (API_KEY.length < 16) (r ??= []).push("API_KEY must have length >= 16");
  else _4 = API_KEY;
  if (DEBUG === "true" || DEBUG === "1" || DEBUG === "yes" || DEBUG === "on") _5 = true;
  else if (DEBUG === "false" || DEBUG === "0" || DEBUG === "no" || DEBUG === "off") _5 = false;
  else (r ??= []).push("DEBUG must be a boolean");
  if (r) throw Error(r.join(", "));
  return { NODE_ENV: _0, PORT: _1, DATABASE_URL: _2, REDIS_URL: _3, API_KEY: _4, DEBUG: _5 };
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
