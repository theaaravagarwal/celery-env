import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata, spawnRuntime } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const generatedFile = join(__dirname, "generated", "cold-small.generated.mjs");
const runs = Number(process.env.RUNS || 25);
const targetRuntime = args.targetRuntime || currentRuntimeMetadata().runtimeName;
const env = {
  NODE_ENV: "production",
  PORT: "3000",
  DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  DEBUG: "false",
  API_KEY: "1234567890abcdef"
};
const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  PORT: int({ min: 1, max: 65535 }),
  DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
  DEBUG: bool(),
  API_KEY: str({ min: 16 })
});

await mkdir(dirname(generatedFile), { recursive: true });
await writeFile(generatedFile, generateValidator(schema), "utf8");

const cases = [
  ["celery generated", generatedCase()],
  ["celery runtime", runtimeCase()],
  ["zod", zodCase()],
  ["valibot", valibotCase()],
  ["envalid", envalidCase()],
  ["envsafe", envsafeCase()],
  ["valienv", valienvCase()],
  ["env-var", envVarCase()],
  ["safe-env-vars", safeEnvVarsCase()],
  ["env-type-validator", envTypeValidatorCase()],
  ["t3-env core", t3EnvCase()],
  ["env-schema", envSchemaCase()],
  ["convict", convictCase()]
];
const rows = [];

for (const [name, source] of cases) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const result = spawnRuntime(targetRuntime, ["--input-type=module", "-e", source], {
      cwd: __dirname,
    });
    if (result.status !== 0) {
      rows.push({ name, error: result.stderr.trim() || `exit ${result.status}` });
      break;
    }
    samples.push(JSON.parse(result.stdout));
  }
  if (samples.length) rows.push(summary(name, samples));
}

console.table(rows);

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-cold-first/1",
    generatedAt: new Date().toISOString(),
    metadata: {
      ...currentRuntimeMetadata(),
      targetRuntime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      runs
    },
    rows
  }, null, 2)}\n`, "utf8");
}

function generatedCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("./generated/cold-small.generated.mjs");
    const t1 = performance.now();
    const out = mod.loadEnv(env);
    const t2 = performance.now();
    if (out.PORT !== 3000) throw Error("bad generated output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: 0, validateMs: t2 - t1 }));
  `;
}

function runtimeCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("../../src/index.js");
    const t1 = performance.now();
    const schema = mod.defineEnv({
      NODE_ENV: mod.oneOf(["development", "test", "production"]),
      PORT: mod.int({ min: 1, max: 65535 }),
      DATABASE_URL: mod.str({ min: 1, startsWith: "postgres://" }),
      DEBUG: mod.bool(),
      API_KEY: mod.str({ min: 16 })
    });
    const t2 = performance.now();
    const out = mod.parseEnv(schema, env);
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad runtime output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function zodCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const z = await import("zod");
    const t1 = performance.now();
    const schema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]),
      PORT: z.coerce.number().int().min(1).max(65535),
      DATABASE_URL: z.string().min(1).startsWith("postgres://"),
      DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform((v) => v === "true" || v === "1" || v === "yes" || v === "on"),
      API_KEY: z.string().min(16)
    });
    const t2 = performance.now();
    const out = schema.parse(env);
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad zod output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function valibotCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const v = await import("valibot");
    const t1 = performance.now();
    const schema = v.object({
      NODE_ENV: v.picklist(["development", "test", "production"]),
      PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
      DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("postgres://")),
      DEBUG: v.pipe(v.string(), v.picklist(["true", "false", "1", "0", "yes", "no", "on", "off"]), v.transform((x) => x === "true" || x === "1" || x === "yes" || x === "on")),
      API_KEY: v.pipe(v.string(), v.minLength(16))
    });
    const t2 = performance.now();
    const out = v.parse(schema, env);
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad valibot output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function envalidCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("envalid");
    const t1 = performance.now();
    const nodeEnv = mod.makeValidator((x) => { if (x === "development" || x === "test" || x === "production") return x; throw Error(); });
    const port = mod.makeValidator((x) => { const n = Number(x); if (Number.isInteger(n) && n >= 1 && n <= 65535) return n; throw Error(); });
    const db = mod.makeValidator((x) => { if (x.startsWith("postgres://")) return x; throw Error(); });
    const api = mod.makeValidator((x) => { if (x.length >= 16) return x; throw Error(); });
    const schema = { NODE_ENV: nodeEnv(), PORT: port(), DATABASE_URL: db(), DEBUG: mod.bool(), API_KEY: api() };
    const t2 = performance.now();
    const out = mod.cleanEnv(env, schema, { reporter: ({ errors }) => { if (Object.keys(errors).length) throw Error(); } });
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad envalid output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function envsafeCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("envsafe");
    const t1 = performance.now();
    const db = mod.makeValidator((x) => { if (x.startsWith("postgres://")) return x; throw Error(); });
    const api = mod.makeValidator((x) => { if (x.length >= 16) return x; throw Error(); });
    const port = mod.makeValidator((x) => { const n = Number(x); if (Number.isInteger(n) && n >= 1 && n <= 65535) return n; throw Error(); });
    const schema = { NODE_ENV: mod.str({ choices: ["development", "test", "production"] }), PORT: port(), DATABASE_URL: db(), DEBUG: mod.bool(), API_KEY: api() };
    const t2 = performance.now();
    const out = mod.envsafe(schema, { env, reporter: ({ errors }) => { if (Object.keys(errors).length) throw Error(); } });
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad envsafe output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function valienvCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("valienv");
    const t1 = performance.now();
    const schema = {
      NODE_ENV: mod.oneOf("development", "test", "production"),
      PORT: mod.port,
      DATABASE_URL: (x) => { const v = mod.string(x); if (v?.startsWith("postgres://")) return v; },
      DEBUG: mod.boolean,
      API_KEY: (x) => { const v = mod.string(x); if (v && v.length >= 16) return v; }
    };
    const t2 = performance.now();
    const out = mod.validate({ env, validators: schema });
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad valienv output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function envVarCase() {
  return `
    import { performance } from "node:perf_hooks";
    const data = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("env-var");
    const t1 = performance.now();
    const t2 = performance.now();
    const api = mod.from ? mod : mod.default;
    const env = api.from(data);
    const out = {
      NODE_ENV: env.get("NODE_ENV").required().asEnum(["development", "test", "production"]),
      PORT: env.get("PORT").required().asPortNumber(),
      DATABASE_URL: env.get("DATABASE_URL").required().asString(),
      DEBUG: env.get("DEBUG").required().asBool(),
      API_KEY: env.get("API_KEY").required().asString()
    };
    if (!out.DATABASE_URL.startsWith("postgres://") || out.API_KEY.length < 16) throw Error("bad env-var validation");
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad env-var output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function safeEnvVarsCase() {
  return `
    import { performance } from "node:perf_hooks";
    Object.assign(process.env, ${JSON.stringify(env)});
    const t0 = performance.now();
    const mod = await import("safe-env-vars");
    const t1 = performance.now();
    const reader = new mod.EnvironmentReader({ dotEnv: false });
    const t2 = performance.now();
    const out = {
      NODE_ENV: reader.string.get("NODE_ENV", { allowedValues: ["development", "test", "production"] }),
      PORT: reader.number.get("PORT", { allowedValues: [3000] }),
      DATABASE_URL: reader.string.get("DATABASE_URL"),
      DEBUG: reader.boolean.get("DEBUG"),
      API_KEY: reader.string.get("API_KEY")
    };
    if (!out.DATABASE_URL.startsWith("postgres://") || out.API_KEY.length < 16) throw Error("bad safe-env-vars validation");
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad safe-env-vars output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function envTypeValidatorCase() {
  return `
    import { performance } from "node:perf_hooks";
    Object.assign(process.env, ${JSON.stringify(env)});
    const t0 = performance.now();
    const mod = await import("env-type-validator");
    const t1 = performance.now();
    const schema = {
      NODE_ENV: mod.enumm({ enum: ["development", "test", "production"] }),
      PORT: mod.port(),
      DATABASE_URL: mod.regex({ regex: /^postgres:\\/\\// }),
      DEBUG: mod.boolean({ trueValue: "true" }),
      API_KEY: mod.regex({ regex: /^.{16,}$/ })
    };
    const t2 = performance.now();
    const out = mod.validate(schema);
    const t3 = performance.now();
    if (out.PORT !== "3000") throw Error("bad env-type-validator output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function t3EnvCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const [t3, z] = await Promise.all([import("@t3-oss/env-core"), import("zod")]);
    const t1 = performance.now();
    const schema = {
      NODE_ENV: z.enum(["development", "test", "production"]),
      PORT: z.coerce.number().int().min(1).max(65535),
      DATABASE_URL: z.string().min(1).startsWith("postgres://"),
      DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform((x) => x === "true" || x === "1" || x === "yes" || x === "on"),
      API_KEY: z.string().min(16)
    };
    const t2 = performance.now();
    const out = t3.createEnv({ server: schema, runtimeEnv: env });
    const t3n = performance.now();
    if (out.PORT !== 3000) throw Error("bad t3 output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3n - t2 }));
  `;
}

function envSchemaCase() {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("env-schema");
    const t1 = performance.now();
    const schema = { type: "object", required: ["NODE_ENV", "PORT", "DATABASE_URL", "DEBUG", "API_KEY"], properties: { NODE_ENV: { type: "string", enum: ["development", "test", "production"] }, PORT: { type: "integer", minimum: 1, maximum: 65535 }, DATABASE_URL: { type: "string", pattern: "^postgres://" }, DEBUG: { type: "boolean" }, API_KEY: { type: "string", minLength: 16 } } };
    const t2 = performance.now();
    const out = mod.default({ schema, data: env });
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad env-schema output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function convictCase() {
  return `
    import { performance } from "node:perf_hooks";
    Object.assign(process.env, ${JSON.stringify(env)});
    const t0 = performance.now();
    const mod = await import("convict");
    const t1 = performance.now();
    const t2 = performance.now();
    const config = mod.default({
      NODE_ENV: { format: ["development", "test", "production"], default: "development", env: "NODE_ENV" },
      PORT: { format: "port", default: 3000, env: "PORT" },
      DATABASE_URL: { format: (x) => { if (typeof x !== "string" || !x.startsWith("postgres://")) throw Error(); }, default: "postgres://localhost", env: "DATABASE_URL" },
      DEBUG: { format: Boolean, default: false, env: "DEBUG" },
      API_KEY: { format: (x) => { if (typeof x !== "string" || x.length < 16) throw Error(); }, default: "1234567890abcdef", env: "API_KEY" }
    });
    config.validate({ allowed: "strict" });
    const out = config.getProperties();
    const t3 = performance.now();
    if (out.PORT !== 3000) throw Error("bad convict output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function summary(name, samples) {
  return {
    name,
    import_ms: median(samples, "importMs"),
    setup_ms: median(samples, "setupMs"),
    first_validate_ms: median(samples, "validateMs"),
    total_ms: round(samples.map((s) => s.importMs + s.setupMs + s.validateMs).sort((a, b) => a - b)[samples.length >> 1])
  };
}

function median(samples, key) {
  return round(samples.map((sample) => sample[key]).sort((a, b) => a - b)[samples.length >> 1]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--target-runtime") out.targetRuntime = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
