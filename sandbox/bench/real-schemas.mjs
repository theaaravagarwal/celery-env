import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { createEnv as createT3Env } from "@t3-oss/env-core";
import { bool as envalidBool, cleanEnv, makeValidator } from "envalid";
import envVar from "env-var";
import { bool as envsafeBool, envsafe, makeValidator as makeEnvsafeValidator } from "envsafe";
import * as z from "zod";
import * as v from "valibot";
import { bool, defineEnv, int, json, list, num, oneOf, parseEnv, str, url } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const zStrictInt1000 = z.coerce.number().int().min(1).max(1000);
const zShard = z.coerce.number().int().min(1).max(16);
const zHttps = z.string().startsWith("https://");
const vStrictInt1000 = v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(1000));
const vShard = v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(16));
const vHttps = v.pipe(v.string(), v.startsWith("https://"));
const envalidFns = validatorFns(makeValidator, () => envalidBool());
const envsafeFns = validatorFns(makeEnvsafeValidator, () => envsafeBool());

const cases = [
  {
    name: "api",
    env: Object.freeze({
      NODE_ENV: "production",
      PORT: "3000",
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      REDIS_URL: "redis://localhost:6379",
      API_KEY: "1234567890abcdef",
      DEBUG: "false"
    }),
    invalidEnv: Object.freeze({
      NODE_ENV: "staging",
      PORT: "0",
      DATABASE_URL: "mysql://localhost/app",
      REDIS_URL: "",
      API_KEY: "short",
      DEBUG: "maybe"
    }),
    celery: defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"]),
      PORT: int({ min: 1, max: 65535 }),
      DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
      REDIS_URL: str({ min: 1, startsWith: "redis://" }),
      API_KEY: str({ min: 16 }),
      DEBUG: bool()
    }),
    zod: z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      PORT: z.coerce.number().int().min(1).max(65535),
      DATABASE_URL: z.string().min(1).startsWith("postgres://"),
      REDIS_URL: z.string().min(1).startsWith("redis://"),
      API_KEY: z.string().min(16),
      DEBUG: zBool()
    }),
    valibot: v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
      DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("postgres://")),
      REDIS_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("redis://")),
      API_KEY: v.pipe(v.string(), v.minLength(16)),
      DEBUG: vBool()
    })
  },
  {
    name: "web",
    env: Object.freeze({
      NODE_ENV: "production",
      PUBLIC_API_URL: "https://api.example.com",
      FEATURE_SEARCH: "true",
      BUILD_ID: "build_123456",
      SENTRY_DSN: "https://example@sentry.io/123"
    }),
    invalidEnv: Object.freeze({
      NODE_ENV: "staging",
      PUBLIC_API_URL: "http://api.example.com",
      FEATURE_SEARCH: "maybe",
      BUILD_ID: "short",
      SENTRY_DSN: "not-a-url"
    }),
    celery: defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"]),
      PUBLIC_API_URL: url({ protocols: ["https"] }),
      FEATURE_SEARCH: bool({ default: false }),
      BUILD_ID: str({ min: 8 }),
      SENTRY_DSN: url({ protocols: ["https"] })
    }),
    zod: z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      PUBLIC_API_URL: z.string().url().startsWith("https://"),
      FEATURE_SEARCH: zBool(),
      BUILD_ID: z.string().min(8),
      SENTRY_DSN: z.string().url().startsWith("https://")
    }),
    valibot: v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      PUBLIC_API_URL: v.pipe(v.string(), v.url(), v.startsWith("https://")),
      FEATURE_SEARCH: vBool(),
      BUILD_ID: v.pipe(v.string(), v.minLength(8)),
      SENTRY_DSN: v.pipe(v.string(), v.url(), v.startsWith("https://"))
    })
  },
  {
    name: "worker",
    env: Object.freeze({
      NODE_ENV: "production",
      QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123/jobs",
      CONCURRENCY: "16",
      RETRY_BACKOFF: "1.5",
      DRY_RUN: "false"
    }),
    invalidEnv: Object.freeze({
      NODE_ENV: "staging",
      QUEUE_URL: "http://sqs.us-east-1.amazonaws.com/123/jobs",
      CONCURRENCY: "0",
      RETRY_BACKOFF: "100",
      DRY_RUN: "maybe"
    }),
    celery: defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"]),
      QUEUE_URL: url({ protocols: ["https"] }),
      CONCURRENCY: int({ min: 1, max: 128 }),
      RETRY_BACKOFF: num({ min: 0, max: 60 }),
      DRY_RUN: bool()
    }),
    zod: z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      QUEUE_URL: z.string().url().startsWith("https://"),
      CONCURRENCY: z.coerce.number().int().min(1).max(128),
      RETRY_BACKOFF: z.coerce.number().min(0).max(60),
      DRY_RUN: zBool()
    }),
    valibot: v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      QUEUE_URL: v.pipe(v.string(), v.url(), v.startsWith("https://")),
      CONCURRENCY: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(128)),
      RETRY_BACKOFF: v.pipe(v.string(), v.transform(Number), v.minValue(0), v.maxValue(60)),
      DRY_RUN: vBool()
    })
  },
  {
    name: "list-heavy",
    env: Object.freeze({
      NODE_ENV: "production",
      IDS: Array.from({ length: 80 }, (_, i) => String(i + 1)).join(","),
      ORIGINS: "https://a.example.com,https://b.example.com,https://c.example.com",
      FLAGS: "true,false,true,false,true",
      SHARDS: "1::2::3::4"
    }),
    invalidEnv: Object.freeze({
      NODE_ENV: "staging",
      IDS: "1,2,1e3,0",
      ORIGINS: "https://a.example.com,http://b.example.com",
      FLAGS: "true,maybe,false",
      SHARDS: "1::0::17"
    }),
    celery: defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"]),
      IDS: list(int({ strict: true, min: 1, max: 1000 })),
      ORIGINS: list(str({ startsWith: "https://" })),
      FLAGS: list(bool()),
      SHARDS: list(int({ min: 1, max: 16 }), { separator: "::" })
    }),
    zod: z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      IDS: zList(",", zStrictInt1000),
      ORIGINS: zList(",", zHttps),
      FLAGS: zList(",", zBool()),
      SHARDS: zList("::", zShard)
    }),
    valibot: v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      IDS: vList(",", vStrictInt1000),
      ORIGINS: vList(",", vHttps),
      FLAGS: vList(",", vBool()),
      SHARDS: vList("::", vShard)
    })
  },
  {
    name: "json-heavy",
    env: Object.freeze({
      NODE_ENV: "production",
      FEATURE_MATRIX: "{\"search\":true,\"checkout\":false}",
      LIMITS: "{\"requests\":1000,\"burst\":50}",
      PORT: "8080",
      RATE: "0.75"
    }),
    invalidEnv: Object.freeze({
      NODE_ENV: "staging",
      FEATURE_MATRIX: "{",
      LIMITS: "[",
      PORT: "0",
      RATE: "2"
    }),
    celery: defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"]),
      FEATURE_MATRIX: json(),
      LIMITS: json(),
      PORT: int({ min: 1, max: 65535 }),
      RATE: num({ min: 0, max: 1 })
    }),
    zod: z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      FEATURE_MATRIX: z.string().transform(JSON.parse),
      LIMITS: z.string().transform(JSON.parse),
      PORT: z.coerce.number().int().min(1).max(65535),
      RATE: z.coerce.number().min(0).max(1)
    }),
    valibot: v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      FEATURE_MATRIX: v.pipe(v.string(), v.transform(JSON.parse)),
      LIMITS: v.pipe(v.string(), v.transform(JSON.parse)),
      PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
      RATE: v.pipe(v.string(), v.transform(Number), v.minValue(0), v.maxValue(1))
    })
  }
];

for (const c of cases) Object.assign(process.env, c.env);

for (const c of cases) {
  c.generated = await generated(c.name, c.celery);
  c.envalid = packageSchema(c.name, envalidFns);
  c.envsafe = packageSchema(c.name, envsafeFns);
  c.t3 = t3Schema(c.name);
  assert.deepEqual(c.generated.loadEnv(c.env), parseEnv(c.celery, c.env));
  assert.deepEqual(c.generated.loadEnv(), parseEnv(c.celery));
  assert.notEqual(catchError(() => c.generated.loadEnv(c.invalidEnv)), 0);
  assert.notEqual(catchError(() => parseEnv(c.celery, c.invalidEnv)), 0);
  assert.notEqual(catchError(() => z.parse(c.zod, c.invalidEnv)), 0);
  assert.notEqual(catchError(() => v.parse(c.valibot, c.invalidEnv)), 0);
  assert.notEqual(catchError(() => cleanEnv(c.invalidEnv, c.envalid, { reporter: envalidReporter })), 0);
  assert.notEqual(catchError(() => envsafe(c.envsafe, { env: c.invalidEnv, reporter: envsafeReporter })), 0);
  assert.notEqual(catchError(() => readEnvVar(c.name, c.invalidEnv)), 0);
  assert.notEqual(catchError(() => readT3(c.t3, c.invalidEnv)), 0);
  assert.equal(z.parse(c.zod, c.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(z.parse(c.zod, process.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(v.parse(c.valibot, c.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(v.parse(c.valibot, process.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(cleanEnv(c.env, c.envalid, { reporter: envalidReporter }).NODE_ENV, c.env.NODE_ENV);
  assert.equal(cleanEnv(process.env, c.envalid, { reporter: envalidReporter }).NODE_ENV, c.env.NODE_ENV);
  assert.equal(envsafe(c.envsafe, { env: c.env, reporter: envsafeReporter }).NODE_ENV, c.env.NODE_ENV);
  assert.equal(envsafe(c.envsafe, { env: process.env, reporter: envsafeReporter }).NODE_ENV, c.env.NODE_ENV);
  assert.equal(readEnvVar(c.name, c.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(readEnvVar(c.name, process.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(readT3(c.t3, c.env).NODE_ENV, c.env.NODE_ENV);
  assert.equal(readT3(c.t3, process.env).NODE_ENV, c.env.NODE_ENV);
}

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const c of cases) {
  bench
    .add(`celery generated ${c.name}`, () => { sink = c.generated.loadEnv(c.env); })
    .add(`celery runtime ${c.name}`, () => { sink = parseEnv(c.celery, c.env); })
    .add(`zod ${c.name}`, () => { sink = z.parse(c.zod, c.env); })
    .add(`valibot ${c.name}`, () => { sink = v.parse(c.valibot, c.env); })
    .add(`envalid ${c.name}`, () => { sink = cleanEnv(c.env, c.envalid, { reporter: envalidReporter }); })
    .add(`envsafe ${c.name}`, () => { sink = envsafe(c.envsafe, { env: c.env, reporter: envsafeReporter }); })
    .add(`env-var ${c.name}`, () => { sink = readEnvVar(c.name, c.env); })
    .add(`t3-env core ${c.name}`, () => { sink = readT3(c.t3, c.env); })
    .add(`celery generated process.env ${c.name}`, () => { sink = c.generated.loadEnv(); })
    .add(`celery runtime process.env ${c.name}`, () => { sink = parseEnv(c.celery); })
    .add(`zod process.env ${c.name}`, () => { sink = z.parse(c.zod, process.env); })
    .add(`valibot process.env ${c.name}`, () => { sink = v.parse(c.valibot, process.env); })
    .add(`envalid process.env ${c.name}`, () => { sink = cleanEnv(process.env, c.envalid, { reporter: envalidReporter }); })
    .add(`envsafe process.env ${c.name}`, () => { sink = envsafe(c.envsafe, { env: process.env, reporter: envsafeReporter }); })
    .add(`env-var process.env ${c.name}`, () => { sink = readEnvVar(c.name, process.env); })
    .add(`t3-env core process.env ${c.name}`, () => { sink = readT3(c.t3, process.env); })
    .add(`celery generated invalid ${c.name}`, () => { sink = catchError(() => c.generated.loadEnv(c.invalidEnv)); })
    .add(`celery runtime invalid ${c.name}`, () => { sink = catchError(() => parseEnv(c.celery, c.invalidEnv)); })
    .add(`zod invalid ${c.name}`, () => { sink = catchError(() => z.parse(c.zod, c.invalidEnv)); })
    .add(`valibot invalid ${c.name}`, () => { sink = catchError(() => v.parse(c.valibot, c.invalidEnv)); })
    .add(`envalid invalid ${c.name}`, () => { sink = catchError(() => cleanEnv(c.invalidEnv, c.envalid, { reporter: envalidReporter })); })
    .add(`envsafe invalid ${c.name}`, () => { sink = catchError(() => envsafe(c.envsafe, { env: c.invalidEnv, reporter: envsafeReporter })); })
    .add(`env-var invalid ${c.name}`, () => { sink = catchError(() => readEnvVar(c.name, c.invalidEnv)); })
    .add(`t3-env core invalid ${c.name}`, () => { sink = catchError(() => readT3(c.t3, c.invalidEnv)); });
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
await bench.run();
const rows = bench.tasks.map((task) => ({
  name: task.name,
  suite: suiteOf(task.name),
  scenario: scenarioOf(task.name),
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));
console.table(rows.map(({ suite, scenario, ...row }) => row));

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-real-schemas/1",
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

async function generated(name, schema) {
  const out = join(__dirname, "generated", `real.${name}.generated.mjs`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function zBool() {
  return z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool);
}

function vBool() {
  return v.pipe(v.string(), v.picklist(["true", "false", "1", "0", "yes", "no", "on", "off"]), v.transform(toBool));
}

function zList(separator, schema) {
  return z.string().transform((value) => value.split(separator).map((item) => schema.parse(item.trim())));
}

function vList(separator, schema) {
  return v.pipe(v.string(), v.transform((value) => value.split(separator).map((item) => v.parse(schema, item.trim()))));
}

function t3List(separator, schema) {
  return z.string().transform((value, ctx) => {
    const out = [];
    for (const item of value.split(separator)) {
      const result = schema.safeParse(item.trim());
      if (!result.success) {
        ctx.addIssue({ code: "custom", message: "invalid list item" });
        return z.NEVER;
      }
      out.push(result.data);
    }
    return out;
  });
}

function t3Json() {
  return z.string().transform((value, ctx) => {
    try {
      return JSON.parse(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid JSON" });
      return z.NEVER;
    }
  });
}

function validatorFns(make, boolValidator) {
  return {
    bool: boolValidator,
    enum: (allowed) => make((input) => {
      if (allowed.includes(input)) return input;
      throw new Error("invalid enum");
    }),
    int: (min, max, options = {}) => make((input) => {
      if (options.strict && !/^[+-]?\d+$/.test(input)) throw new Error("invalid integer");
      const n = Number(input);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error("invalid integer");
      return n;
    }),
    num: (min, max) => make((input) => {
      const n = Number(input);
      if (!Number.isFinite(n) || n < min || n > max) throw new Error("invalid number");
      return n;
    }),
    startsWith: (prefix) => make((input) => {
      if (input.length && input.startsWith(prefix)) return input;
      throw new Error("invalid string");
    }),
    minString: (min) => make((input) => {
      if (input.length >= min) return input;
      throw new Error("invalid string");
    }),
    urlProtocol: (protocol) => make((input) => {
      const parsed = new URL(input);
      if (parsed.protocol !== `${protocol}:`) throw new Error("invalid URL protocol");
      return input;
    }),
    json: () => make((input) => JSON.parse(input)),
    list: (separator, parseItem) => make((input) => input.split(separator).map((item) => parseItem(item.trim())))
  };
}

function packageSchema(name, fns) {
  const env = fns.enum(["development", "test", "production"])();
  switch (name) {
    case "api":
      return {
        NODE_ENV: env,
        PORT: fns.int(1, 65535)(),
        DATABASE_URL: fns.startsWith("postgres://")(),
        REDIS_URL: fns.startsWith("redis://")(),
        API_KEY: fns.minString(16)(),
        DEBUG: fns.bool()
      };
    case "web":
      return {
        NODE_ENV: env,
        PUBLIC_API_URL: fns.urlProtocol("https")(),
        FEATURE_SEARCH: fns.bool(),
        BUILD_ID: fns.minString(8)(),
        SENTRY_DSN: fns.urlProtocol("https")()
      };
    case "worker":
      return {
        NODE_ENV: env,
        QUEUE_URL: fns.urlProtocol("https")(),
        CONCURRENCY: fns.int(1, 128)(),
        RETRY_BACKOFF: fns.num(0, 60)(),
        DRY_RUN: fns.bool()
      };
    case "list-heavy":
      return {
        NODE_ENV: env,
        IDS: fns.list(",", (item) => parseStrictInt(item, 1, 1000))(),
        ORIGINS: fns.list(",", (item) => parseStartsWith(item, "https://"))(),
        FLAGS: fns.list(",", parseBool)(),
        SHARDS: fns.list("::", (item) => parseIntValue(item, 1, 16))()
      };
    case "json-heavy":
      return {
        NODE_ENV: env,
        FEATURE_MATRIX: fns.json()(),
        LIMITS: fns.json()(),
        PORT: fns.int(1, 65535)(),
        RATE: fns.num(0, 1)()
      };
    default:
      throw new Error(`Unknown schema case: ${name}`);
  }
}

function t3Schema(name) {
  const env = z.enum(["development", "test", "production"]);
  switch (name) {
    case "api":
      return {
        NODE_ENV: env,
        PORT: z.coerce.number().int().min(1).max(65535),
        DATABASE_URL: z.string().min(1).startsWith("postgres://"),
        REDIS_URL: z.string().min(1).startsWith("redis://"),
        API_KEY: z.string().min(16),
        DEBUG: zBool()
      };
    case "web":
      return {
        NODE_ENV: env,
        PUBLIC_API_URL: z.string().url().startsWith("https://"),
        FEATURE_SEARCH: zBool(),
        BUILD_ID: z.string().min(8),
        SENTRY_DSN: z.string().url().startsWith("https://")
      };
    case "worker":
      return {
        NODE_ENV: env,
        QUEUE_URL: z.string().url().startsWith("https://"),
        CONCURRENCY: z.coerce.number().int().min(1).max(128),
        RETRY_BACKOFF: z.coerce.number().min(0).max(60),
        DRY_RUN: zBool()
      };
    case "list-heavy":
      return {
        NODE_ENV: env,
        IDS: t3List(",", zStrictInt1000),
        ORIGINS: t3List(",", zHttps),
        FLAGS: t3List(",", zBool()),
        SHARDS: t3List("::", zShard)
      };
    case "json-heavy":
      return {
        NODE_ENV: env,
        FEATURE_MATRIX: t3Json(),
        LIMITS: t3Json(),
        PORT: z.coerce.number().int().min(1).max(65535),
        RATE: z.coerce.number().min(0).max(1)
      };
    default:
      throw new Error(`Unknown schema case: ${name}`);
  }
}

function readEnvVar(name, data) {
  const env = envVar.from(data);
  const nodeEnv = env.get("NODE_ENV").required().asEnum(["development", "test", "production"]);
  switch (name) {
    case "api":
      return {
        NODE_ENV: nodeEnv,
        PORT: env.get("PORT").required().asPortNumber(),
        DATABASE_URL: parseStartsWith(env.get("DATABASE_URL").required().asString(), "postgres://"),
        REDIS_URL: parseStartsWith(env.get("REDIS_URL").required().asString(), "redis://"),
        API_KEY: parseMinString(env.get("API_KEY").required().asString(), 16),
        DEBUG: env.get("DEBUG").required().asBool()
      };
    case "web":
      return {
        NODE_ENV: nodeEnv,
        PUBLIC_API_URL: parseUrlProtocol(env.get("PUBLIC_API_URL").required().asString(), "https"),
        FEATURE_SEARCH: env.get("FEATURE_SEARCH").required().asBool(),
        BUILD_ID: parseMinString(env.get("BUILD_ID").required().asString(), 8),
        SENTRY_DSN: parseUrlProtocol(env.get("SENTRY_DSN").required().asString(), "https")
      };
    case "worker":
      return {
        NODE_ENV: nodeEnv,
        QUEUE_URL: parseUrlProtocol(env.get("QUEUE_URL").required().asString(), "https"),
        CONCURRENCY: parseIntValue(env.get("CONCURRENCY").required().asString(), 1, 128),
        RETRY_BACKOFF: parseNumValue(env.get("RETRY_BACKOFF").required().asString(), 0, 60),
        DRY_RUN: env.get("DRY_RUN").required().asBool()
      };
    case "list-heavy":
      return {
        NODE_ENV: nodeEnv,
        IDS: env.get("IDS").required().asString().split(",").map((item) => parseStrictInt(item.trim(), 1, 1000)),
        ORIGINS: env.get("ORIGINS").required().asString().split(",").map((item) => parseStartsWith(item.trim(), "https://")),
        FLAGS: env.get("FLAGS").required().asString().split(",").map((item) => parseBool(item.trim())),
        SHARDS: env.get("SHARDS").required().asString().split("::").map((item) => parseIntValue(item.trim(), 1, 16))
      };
    case "json-heavy":
      return {
        NODE_ENV: nodeEnv,
        FEATURE_MATRIX: JSON.parse(env.get("FEATURE_MATRIX").required().asString()),
        LIMITS: JSON.parse(env.get("LIMITS").required().asString()),
        PORT: parseIntValue(env.get("PORT").required().asString(), 1, 65535),
        RATE: parseNumValue(env.get("RATE").required().asString(), 0, 1)
      };
    default:
      throw new Error(`Unknown schema case: ${name}`);
  }
}

function readT3(server, runtimeEnv) {
  const env = createT3Env({
    server,
    runtimeEnv,
    emptyStringAsUndefined: false,
    onValidationError(issues) {
      throw new Error(`Invalid environment: ${issues.length} issue(s)`);
    }
  });
  const out = {};
  for (const key of Object.keys(server)) out[key] = env[key];
  return out;
}

function parseBool(value) {
  if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
  if (value === "false" || value === "0" || value === "no" || value === "off") return false;
  throw new Error("invalid boolean");
}

function parseStrictInt(value, min, max) {
  if (!/^[+-]?\d+$/.test(value)) throw new Error("invalid integer");
  return parseIntValue(value, min, max);
}

function parseIntValue(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("invalid integer");
  return n;
}

function parseNumValue(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error("invalid number");
  return n;
}

function parseStartsWith(value, prefix) {
  if (value.startsWith(prefix)) return value;
  throw new Error("invalid string");
}

function parseMinString(value, min) {
  if (value.length >= min) return value;
  throw new Error("invalid string");
}

function parseUrlProtocol(value, protocol) {
  const parsed = new URL(value);
  if (parsed.protocol !== `${protocol}:`) throw new Error("invalid URL protocol");
  return value;
}

function envalidReporter({ errors }) {
  const keys = Object.keys(errors);
  if (keys.length) throw new Error(`Invalid environment: ${keys.join(", ")}`);
}

function envsafeReporter({ errors }) {
  const keys = Object.keys(errors);
  if (keys.length) throw new Error(`Invalid environment: ${keys.join(", ")}`);
}

function toBool(value) {
  return value === "true" || value === "1" || value === "yes" || value === "on";
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

function suiteOf(name) {
  if (name.startsWith("celery generated")) return "celery-generated";
  if (name.startsWith("celery runtime")) return "celery-runtime";
  if (name.startsWith("t3-env core")) return "t3-env-core";
  if (name.startsWith("env-var")) return "env-var";
  return name.split(" ")[0];
}

function scenarioOf(name) {
  for (const prefix of ["celery generated", "celery runtime", "t3-env core", "env-var", "zod", "valibot", "envalid", "envsafe"]) {
    if (name.startsWith(`${prefix} `)) return name.slice(prefix.length + 1);
  }
  return name.split(" ").slice(1).join(" ");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
