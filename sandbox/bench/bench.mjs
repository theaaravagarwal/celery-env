import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cpus } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import * as z from "zod";
import * as v from "valibot";
import { createEnv as createT3Env } from "@t3-oss/env-core";
import convict from "convict";
import { bool as envalidBool, cleanEnv, makeValidator } from "envalid";
import envSchema from "env-schema";
import envVar from "env-var";
import { bool as envsafeBool, envsafe, makeValidator as makeEnvsafeValidator, str as envsafeStr } from "envsafe";
import * as envType from "env-type-validator";
import { EnvironmentReader } from "safe-env-vars";
import { boolean as valienvBoolean, oneOf as valienvOneOf, port as valienvPort, string as valienvString, validate as validateValienv } from "valienv";
import { bool, defineEnv, int, num, oneOf, parseEnv, str } from "../../src/index.js";
import { generateValidator as compileValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const smallEnv = Object.freeze({
  NODE_ENV: "production",
  PORT: "3000",
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  DEBUG: "false",
  API_KEY: "1234567890abcdef"
});
const invalidSmallEnv = Object.freeze({
  NODE_ENV: "bad",
  PORT: "0",
  DATABASE_URL: "mysql://user:pass@localhost:3306/app",
  DEBUG: "maybe",
  API_KEY: "short"
});
const strictNumericEnv = Object.freeze({ PORT: "3000", RATE: ".5" });
const invalidStrictNumericEnv = Object.freeze({ PORT: "1e3", RATE: "1e3" });
Object.assign(process.env, smallEnv, strictNumericEnv);

const mediumEnv = Object.freeze(makeEnv(40));
const largeEnv = Object.freeze(makeEnv(160));
Object.assign(process.env, mediumEnv);
Object.assign(process.env, largeEnv);

const celerySmallSchema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  PORT: int({ min: 1, max: 65535 }),
  DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
  DEBUG: bool(),
  API_KEY: str({ min: 16 })
});

const generatedSmall = await generated(celerySmallSchema, "small.generated.mjs");
const celeryStrictNumericSchema = defineEnv({
  PORT: int({ strict: true, min: 1, max: 65535 }),
  RATE: num({ strict: true, min: 0, max: 100 })
});
const generatedStrictNumeric = await generated(celeryStrictNumericSchema, "strict-numeric.generated.mjs");
const generatedStrictNumericSpeed = await generated(celeryStrictNumericSchema, "strict-numeric.speed.generated.mjs", { optimize: "speed" });

const zodSmall = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1).startsWith("postgres://"),
  DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool),
  API_KEY: z.string().min(16)
});

const valibotSmall = v.object({
  NODE_ENV: v.picklist(["development", "test", "production"]),
  PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
  DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("postgres://")),
  DEBUG: v.pipe(v.string(), v.picklist(["true", "false", "1", "0", "yes", "no", "on", "off"]), v.transform(toBool)),
  API_KEY: v.pipe(v.string(), v.minLength(16))
});
const t3Small = {
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1).startsWith("postgres://"),
  DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool),
  API_KEY: z.string().min(16)
};
const envSchemaSmall = {
  type: "object",
  required: ["NODE_ENV", "PORT", "DATABASE_URL", "DEBUG", "API_KEY"],
  properties: {
    NODE_ENV: { type: "string", enum: ["development", "test", "production"] },
    PORT: { type: "integer", minimum: 1, maximum: 65535 },
    DATABASE_URL: { type: "string", pattern: "^postgres://" },
    DEBUG: { type: "boolean" },
    API_KEY: { type: "string", minLength: 16 }
  }
};
const envTypeSmall = {
  NODE_ENV: envType.enumm({ enum: ["development", "test", "production"] }),
  PORT: envType.port(),
  DATABASE_URL: envType.regex({ regex: /^postgres:\/\// }),
  DEBUG: envType.boolean({ trueValue: "true" }),
  API_KEY: envType.regex({ regex: /^.{16,}$/ })
};
const validateEnvType = envType.validate;
const safeEnvReader = new EnvironmentReader({ dotEnv: false });
const valienvSmall = {
  NODE_ENV: valienvOneOf("development", "test", "production"),
  PORT: valienvPort,
  DATABASE_URL: (value) => {
    const out = valienvString(value);
    if (out?.startsWith("postgres://")) return out;
  },
  DEBUG: valienvBoolean,
  API_KEY: (value) => {
    const out = valienvString(value);
    if (out && out.length >= 16) return out;
  }
};

const envalidNodeEnv = makeValidator((input) => {
  if (input === "development" || input === "test" || input === "production") return input;
  throw new Error("invalid NODE_ENV");
});
const envalidDatabase = makeValidator((input) => {
  if (input.startsWith("postgres://")) return input;
  throw new Error("invalid DATABASE_URL");
});
const envalidPort = makeValidator((input) => {
  const n = Number(input);
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  throw new Error("invalid PORT");
});
const envalidApiKey = makeValidator((input) => {
  if (input.length >= 16) return input;
  throw new Error("invalid API_KEY");
});
const envalidNonempty = makeValidator((input) => {
  if (input.length) return input;
  throw new Error("invalid string");
});
const envalidBoolText = makeValidator((input) => {
  if (input === "true" || input === "false") return input === "true";
  throw new Error("invalid boolean");
});
const envalidMode = makeValidator((input) => {
  if (input === "on" || input === "off") return input;
  throw new Error("invalid mode");
});

const envsafeDatabase = makeEnvsafeValidator((input) => {
  if (input.startsWith("postgres://")) return input;
  throw new Error("invalid DATABASE_URL");
});
const envsafeApiKey = makeEnvsafeValidator((input) => {
  if (input.length >= 16) return input;
  throw new Error("invalid API_KEY");
});
const envsafePort = makeEnvsafeValidator((input) => {
  const n = Number(input);
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  throw new Error("invalid PORT");
});
const envsafeInt = makeEnvsafeValidator((input) => {
  const n = Number(input);
  if (Number.isInteger(n) && n >= 1 && n <= 100000) return n;
  throw new Error("invalid integer");
});
const envsafeBoolText = makeEnvsafeValidator((input) => {
  if (input === "true" || input === "false") return input === "true";
  throw new Error("invalid boolean");
});
const envsafeMode = makeEnvsafeValidator((input) => {
  if (input === "on" || input === "off") return input;
  throw new Error("invalid mode");
});

const envalidSmall = {
  NODE_ENV: envalidNodeEnv(),
  PORT: envalidPort(),
  DATABASE_URL: envalidDatabase(),
  DEBUG: envalidBool(),
  API_KEY: envalidApiKey()
};

const envsafeSmall = {
  NODE_ENV: envsafeStr({ choices: ["development", "test", "production"] }),
  PORT: envsafePort(),
  DATABASE_URL: envsafeDatabase(),
  DEBUG: envsafeBool(),
  API_KEY: envsafeApiKey()
};

const celeryMedium = defineEnv(makeCelerySchema(40));
const celeryLarge = defineEnv(makeCelerySchema(160));
const generatedMedium = await generated(celeryMedium, "medium.generated.mjs");
const generatedLarge = await generated(celeryLarge, "large.generated.mjs");
const zodMedium = makeZodSchema(40);
const zodLarge = makeZodSchema(160);
const valibotMedium = makeValibotSchema(40);
const valibotLarge = makeValibotSchema(160);
const envalidMedium = makeEnvalidSchema(40);
const envalidLarge = makeEnvalidSchema(160);
const envsafeMedium = makeEnvsafeSchema(40);
const envsafeLarge = makeEnvsafeSchema(160);

checkCandidates();

let sink;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add("noop", () => { sink = smallEnv; })
  .add("celery generated small", () => { sink = generatedSmall.loadEnv(smallEnv); })
  .add("celery runtime small", () => { sink = parseEnv(celerySmallSchema, smallEnv); })
  .add("celery generated process.env explicit small", () => { sink = generatedSmall.loadEnv(process.env); })
  .add("celery runtime process.env explicit small", () => { sink = parseEnv(celerySmallSchema, process.env); })
  .add("celery generated process.env small", () => { sink = generatedSmall.loadEnv(); })
  .add("celery runtime process.env small", () => { sink = parseEnv(celerySmallSchema); })
  .add("zod small", () => { sink = zodSmall.parse(smallEnv); })
  .add("valibot small", () => { sink = v.parse(valibotSmall, smallEnv); })
  .add("envalid small", () => { sink = cleanEnv(smallEnv, envalidSmall, { reporter: envalidReporter }); })
  .add("envsafe small", () => { sink = envsafe(envsafeSmall, { env: smallEnv, reporter: envsafeReporter }); })
  .add("valienv small", () => { sink = validateValienv({ env: smallEnv, validators: valienvSmall }); })
  .add("env-var small", () => { sink = readEnvVarSmall(smallEnv); })
  .add("safe-env-vars small", () => { sink = readSafeEnvVarsSmall(); })
  .add("env-type-validator small", () => { sink = validateEnvType(envTypeSmall); })
  .add("t3-env core small", () => { sink = createT3Env({ server: t3Small, runtimeEnv: smallEnv }); })
  .add("env-schema small", () => { sink = envSchema({ schema: envSchemaSmall, data: smallEnv }); })
  .add("convict small", () => { sink = readConvictSmall(); })
  .add("celery generated medium", () => { sink = generatedMedium.loadEnv(mediumEnv); })
  .add("celery runtime medium", () => { sink = parseEnv(celeryMedium, mediumEnv); })
  .add("celery generated process.env explicit medium", () => { sink = generatedMedium.loadEnv(process.env); })
  .add("celery runtime process.env explicit medium", () => { sink = parseEnv(celeryMedium, process.env); })
  .add("celery generated process.env medium", () => { sink = generatedMedium.loadEnv(); })
  .add("celery runtime process.env medium", () => { sink = parseEnv(celeryMedium); })
  .add("zod medium", () => { sink = zodMedium.parse(mediumEnv); })
  .add("valibot medium", () => { sink = v.parse(valibotMedium, mediumEnv); })
  .add("envalid medium", () => { sink = cleanEnv(mediumEnv, envalidMedium, { reporter: envalidReporter }); })
  .add("envsafe medium", () => { sink = envsafe(envsafeMedium, { env: mediumEnv, reporter: envsafeReporter }); })
  .add("celery generated large", () => { sink = generatedLarge.loadEnv(largeEnv); })
  .add("celery runtime large", () => { sink = parseEnv(celeryLarge, largeEnv); })
  .add("celery generated process.env explicit large", () => { sink = generatedLarge.loadEnv(process.env); })
  .add("celery runtime process.env explicit large", () => { sink = parseEnv(celeryLarge, process.env); })
  .add("celery generated process.env large", () => { sink = generatedLarge.loadEnv(); })
  .add("celery runtime process.env large", () => { sink = parseEnv(celeryLarge); })
  .add("zod large", () => { sink = zodLarge.parse(largeEnv); })
  .add("valibot large", () => { sink = v.parse(valibotLarge, largeEnv); })
  .add("envalid large", () => { sink = cleanEnv(largeEnv, envalidLarge, { reporter: envalidReporter }); })
  .add("envsafe large", () => { sink = envsafe(envsafeLarge, { env: largeEnv, reporter: envsafeReporter }); })
  .add("celery generated invalid small", () => { sink = catchError(() => generatedSmall.loadEnv(invalidSmallEnv)); })
  .add("celery runtime invalid small", () => { sink = catchError(() => parseEnv(celerySmallSchema, invalidSmallEnv)); })
  .add("zod invalid small", () => { sink = catchError(() => zodSmall.parse(invalidSmallEnv)); })
  .add("valibot invalid small", () => { sink = catchError(() => v.parse(valibotSmall, invalidSmallEnv)); })
  .add("envalid invalid small", () => { sink = catchError(() => cleanEnv(invalidSmallEnv, envalidSmall, { reporter: envalidReporter })); })
  .add("envsafe invalid small", () => { sink = catchError(() => envsafe(envsafeSmall, { env: invalidSmallEnv, reporter: envsafeReporter })); })
  .add("celery generated default strict numeric", () => { sink = generatedStrictNumeric.loadEnv(strictNumericEnv); })
  .add("celery generated speed strict numeric", () => { sink = generatedStrictNumericSpeed.loadEnv(strictNumericEnv); })
  .add("celery runtime strict numeric", () => { sink = parseEnv(celeryStrictNumericSchema, strictNumericEnv); })
  .add("celery generated process.env explicit strict numeric", () => { sink = generatedStrictNumeric.loadEnv(process.env); })
  .add("celery generated speed process.env explicit strict numeric", () => { sink = generatedStrictNumericSpeed.loadEnv(process.env); })
  .add("celery runtime process.env explicit strict numeric", () => { sink = parseEnv(celeryStrictNumericSchema, process.env); })
  .add("celery generated process.env strict numeric", () => { sink = generatedStrictNumeric.loadEnv(); })
  .add("celery generated speed process.env strict numeric", () => { sink = generatedStrictNumericSpeed.loadEnv(); })
  .add("celery runtime process.env strict numeric", () => { sink = parseEnv(celeryStrictNumericSchema); })
  .add("celery generated default invalid strict numeric", () => { sink = catchError(() => generatedStrictNumeric.loadEnv(invalidStrictNumericEnv)); })
  .add("celery generated speed invalid strict numeric", () => { sink = catchError(() => generatedStrictNumericSpeed.loadEnv(invalidStrictNumericEnv)); })
  .add("celery runtime invalid strict numeric", () => { sink = catchError(() => parseEnv(celeryStrictNumericSchema, invalidStrictNumericEnv)); });

const runtime = currentRuntimeMetadata();
if (!args.artifact) console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
await bench.run();

const baseline = new Map();
for (const task of bench.tasks) {
  const size = scenarioOf(task.name);
  if (task.name.startsWith("celery generated ") && !task.name.includes(" speed ") && !task.name.includes("process.env")) {
    baseline.set(size, task.result?.throughput?.mean || 0);
  }
}
const rows = bench.tasks.map((task) => {
  const hz = task.result?.throughput?.mean || 0;
  const scenario = scenarioOf(task.name);
  const baseHz = baseline.get(scenario) || hz;
  return {
    name: task.name,
    hz: Math.round(hz),
    mean_us: round((task.result?.latency?.mean || 0) * 1000),
    p75_us: round((task.result?.latency?.p75 || 0) * 1000),
    p99_us: round((task.result?.latency?.p99 || 0) * 1000),
    slower_than_generated: hz ? `${round(baseHz / hz)}x` : "n/a",
    rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
  };
});

if (args.artifact) {
  const artifact = {
    schema: "celery-bench-artifact/1",
    generatedAt: new Date().toISOString(),
    command: `node ${process.argv.slice(1).join(" ")}`,
    metadata: {
      ...runtime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      benchTimeMs: bench.opts?.time ?? Number(process.env.BENCH_TIME || 750),
      benchWarmupMs: bench.opts?.warmupTime ?? Number(process.env.BENCH_WARMUP || 250)
    },
    benchmarks: rows.map((row) => ({
      name: row.name,
      suite: suiteOf(row.name),
      scenario: scenarioOf(row.name).replace(" ", "_"),
      scope: row.name.includes("invalid") ? "invalid" : "valid",
      hz: row.hz,
      latencyUs: { mean: row.mean_us, p75: row.p75_us, p99: row.p99_us },
      rmePercent: Number.parseFloat(row.rme) || 0,
      slowdownVsGenerated: Number.parseFloat(row.slower_than_generated) || 1,
      passed: true
    })),
    summary: {
      baselineHzByScenario: Object.fromEntries([...baseline].map(([key, value]) => [key.replace(" ", "_"), Math.round(value)])),
      optimizeSpeed: speedSummary(rows),
      runStatus: "ok"
    }
  };
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  if (args.artifactOut) {
    await mkdir(dirname(args.artifactOut), { recursive: true });
    await writeFile(args.artifactOut, json, "utf8");
  } else {
    process.stdout.write(json);
  }
} else {
  console.table(rows);
}

if (!sink) process.exitCode = 1;

async function generated(schema, file, options) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, compileValidator(schema, options), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function makeEnv(count) {
  const env = {};
  for (let i = 0; i < count; i += 1) {
    env[`STR_${i}`] = `value_${i}`;
    env[`INT_${i}`] = String(1000 + i);
    env[`BOOL_${i}`] = i % 2 === 0 ? "true" : "false";
    env[`MODE_${i}`] = i % 2 === 0 ? "on" : "off";
  }
  return env;
}

function makeCelerySchema(count) {
  const schema = {};
  for (let i = 0; i < count; i += 1) {
    schema[`STR_${i}`] = str({ min: 1 });
    schema[`INT_${i}`] = int({ min: 1, max: 100000 });
    schema[`BOOL_${i}`] = bool();
    schema[`MODE_${i}`] = oneOf(["on", "off"]);
  }
  return schema;
}

function makeZodSchema(count) {
  const shape = {};
  for (let i = 0; i < count; i += 1) {
    shape[`STR_${i}`] = z.string().min(1);
    shape[`INT_${i}`] = z.coerce.number().int().min(1).max(100000);
    shape[`BOOL_${i}`] = z.enum(["true", "false"]).transform(toBool);
    shape[`MODE_${i}`] = z.enum(["on", "off"]);
  }
  return z.object(shape);
}

function makeValibotSchema(count) {
  const shape = {};
  for (let i = 0; i < count; i += 1) {
    shape[`STR_${i}`] = v.pipe(v.string(), v.minLength(1));
    shape[`INT_${i}`] = v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(100000));
    shape[`BOOL_${i}`] = v.pipe(v.string(), v.picklist(["true", "false"]), v.transform(toBool));
    shape[`MODE_${i}`] = v.picklist(["on", "off"]);
  }
  return v.object(shape);
}

function makeEnvalidSchema(count) {
  const schema = {};
  for (let i = 0; i < count; i += 1) {
    schema[`STR_${i}`] = envalidNonempty();
    schema[`INT_${i}`] = envalidPort();
    schema[`BOOL_${i}`] = envalidBoolText();
    schema[`MODE_${i}`] = envalidMode();
  }
  return schema;
}

function makeEnvsafeSchema(count) {
  const schema = {};
  for (let i = 0; i < count; i += 1) {
    schema[`STR_${i}`] = envsafeStr();
    schema[`INT_${i}`] = envsafeInt();
    schema[`BOOL_${i}`] = envsafeBoolText();
    schema[`MODE_${i}`] = envsafeMode();
  }
  return schema;
}

function checkCandidates() {
  assert.equal(generatedSmall.loadEnv(smallEnv).PORT, 3000);
  assert.equal(generatedSmall.loadEnv().PORT, 3000);
  assert.equal(generatedStrictNumeric.loadEnv(strictNumericEnv).PORT, 3000);
  assert.equal(generatedStrictNumericSpeed.loadEnv(strictNumericEnv).PORT, 3000);
  assert.equal(generatedStrictNumericSpeed.loadEnv().RATE, 0.5);
  assert.equal(parseEnv(celerySmallSchema, smallEnv).DEBUG, false);
  assert.equal(parseEnv(celerySmallSchema).DEBUG, false);
  assert.equal(parseEnv(celeryStrictNumericSchema, strictNumericEnv).RATE, 0.5);
  assert.equal(parseEnv(celeryStrictNumericSchema).RATE, 0.5);
  assert.equal(zodSmall.parse(smallEnv).PORT, 3000);
  assert.equal(v.parse(valibotSmall, smallEnv).DEBUG, false);
  assert.equal(cleanEnv(smallEnv, envalidSmall, { reporter: envalidReporter }).PORT, 3000);
  assert.equal(envsafe(envsafeSmall, { env: smallEnv, reporter: envsafeReporter }).PORT, 3000);
  assert.equal(validateValienv({ env: smallEnv, validators: valienvSmall }).PORT, 3000);
  assert.equal(readEnvVarSmall(smallEnv).DEBUG, false);
  assert.equal(readSafeEnvVarsSmall().PORT, 3000);
  assert.equal(validateEnvType(envTypeSmall).PORT, "3000");
  assert.equal(createT3Env({ server: t3Small, runtimeEnv: smallEnv }).PORT, 3000);
  assert.equal(envSchema({ schema: envSchemaSmall, data: smallEnv }).PORT, 3000);
  assert.equal(readConvictSmall().PORT, 3000);
  assert.equal(generatedMedium.loadEnv().INT_0, 1000);
  assert.equal(parseEnv(celeryMedium).BOOL_1, false);
  assert.equal(generatedLarge.loadEnv().INT_159, 1159);
  assert.equal(parseEnv(celeryLarge).BOOL_159, false);
  for (const [name, fn] of [
    ["celery generated", () => generatedSmall.loadEnv(invalidSmallEnv)],
    ["celery runtime", () => parseEnv(celerySmallSchema, invalidSmallEnv)],
    ["zod", () => zodSmall.parse(invalidSmallEnv)],
    ["valibot", () => v.parse(valibotSmall, invalidSmallEnv)],
    ["envalid", () => cleanEnv(invalidSmallEnv, envalidSmall, { reporter: envalidReporter })],
    ["envsafe", () => envsafe(envsafeSmall, { env: invalidSmallEnv, reporter: envsafeReporter })],
    ["celery generated strict numeric", () => generatedStrictNumeric.loadEnv(invalidStrictNumericEnv)],
    ["celery generated speed strict numeric", () => generatedStrictNumericSpeed.loadEnv(invalidStrictNumericEnv)],
    ["celery runtime strict numeric", () => parseEnv(celeryStrictNumericSchema, invalidStrictNumericEnv)]
  ]) {
    assert.notEqual(catchError(fn), 0, `${name} must reject invalid input`);
  }
}

function toBool(value) {
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

function readEnvVarSmall(env) {
  const reader = envVar.from(env);
  const out = {
    NODE_ENV: reader.get("NODE_ENV").required().asEnum(["development", "test", "production"]),
    PORT: reader.get("PORT").required().asPortNumber(),
    DATABASE_URL: reader.get("DATABASE_URL").required().asString(),
    DEBUG: reader.get("DEBUG").required().asBool(),
    API_KEY: reader.get("API_KEY").required().asString()
  };
  if (!out.DATABASE_URL.startsWith("postgres://")) throw new Error("invalid DATABASE_URL");
  if (out.API_KEY.length < 16) throw new Error("invalid API_KEY");
  return out;
}

function readSafeEnvVarsSmall() {
  const out = {
    NODE_ENV: safeEnvReader.string.get("NODE_ENV", { allowedValues: ["development", "test", "production"] }),
    PORT: safeEnvReader.number.get("PORT", { allowedValues: [3000] }),
    DATABASE_URL: safeEnvReader.string.get("DATABASE_URL"),
    DEBUG: safeEnvReader.boolean.get("DEBUG"),
    API_KEY: safeEnvReader.string.get("API_KEY")
  };
  if (!out.DATABASE_URL.startsWith("postgres://")) throw new Error("invalid DATABASE_URL");
  if (out.API_KEY.length < 16) throw new Error("invalid API_KEY");
  return out;
}

function readConvictSmall() {
  const config = convict({
    NODE_ENV: { format: ["development", "test", "production"], default: "development", env: "NODE_ENV" },
    PORT: { format: "port", default: 3000, env: "PORT" },
    DATABASE_URL: {
      format: (value) => {
        if (typeof value !== "string" || !value.startsWith("postgres://")) throw new Error("invalid DATABASE_URL");
      },
      default: "postgres://localhost",
      env: "DATABASE_URL"
    },
    DEBUG: { format: Boolean, default: false, env: "DEBUG" },
    API_KEY: {
      format: (value) => {
        if (typeof value !== "string" || value.length < 16) throw new Error("invalid API_KEY");
      },
      default: "1234567890abcdef",
      env: "API_KEY"
    }
  });
  config.validate({ allowed: "strict" });
  return config.getProperties();
}

function envalidReporter({ errors }) {
  const keys = Object.keys(errors);
  if (keys.length) throw new Error(`Invalid environment: ${keys.join(", ")}`);
}

function envsafeReporter({ errors }) {
  const keys = Object.keys(errors);
  if (keys.length) throw new Error(`Invalid environment: ${keys.join(", ")}`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function catchError(fn) {
  try {
    fn();
    return 0;
  } catch (error) {
    const message = String(error.message);
    if (message.includes("short") || message.includes("mysql://")) {
      throw new Error("benchmark error leaked an input value");
    }
    return message.length || 1;
  }
}

function speedSummary(rows) {
  const hz = (name) => rows.find((row) => row.name === name)?.hz || 0;
  const strictDefault = hz("celery generated default strict numeric");
  const strictSpeed = hz("celery generated speed strict numeric");
  const invalidStrictDefault = hz("celery generated default invalid strict numeric");
  const invalidStrictSpeed = hz("celery generated speed invalid strict numeric");
  return {
    strictNumericDefaultHz: strictDefault,
    strictNumericSpeedHz: strictSpeed,
    strictNumericSpeedup: strictDefault ? round(strictSpeed / strictDefault) : 0,
    invalidStrictNumericDefaultHz: invalidStrictDefault,
    invalidStrictNumericSpeedHz: invalidStrictSpeed,
    invalidStrictNumericSpeedup: invalidStrictDefault ? round(invalidStrictSpeed / invalidStrictDefault) : 0
  };
}

function scenarioOf(name) {
  if (name.includes("invalid strict numeric")) return "invalid strict numeric";
  if (name.includes("strict numeric")) return "strict numeric";
  if (name.includes("invalid small")) return "invalid small";
  if (name.includes("small")) return "small";
  if (name.includes("medium")) return "medium";
  if (name.includes("large")) return "large";
  return "unknown";
}

function suiteOf(name) {
  if (name.startsWith("celery generated")) return "celery-generated";
  if (name.startsWith("celery runtime")) return "celery-runtime";
  return name.split(" ")[0];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--artifact") out.artifact = true;
    else if (argv[i] === "--artifact-out") {
      out.artifact = true;
      out.artifactOut = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return out;
}
