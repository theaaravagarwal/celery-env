import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const dir = join(__dirname, "bundle-cases");
const outDir = join(__dirname, "bundle-out");
await rm(dir, { recursive: true, force: true });
await rm(outDir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
await mkdir(outDir, { recursive: true });

const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"]),
  PORT: int({ min: 1, max: 65535 }),
  DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
  DEBUG: bool(),
  API_KEY: str({ min: 16 })
});

await writeFile(join(dir, "celery-generated.mjs"), generateValidator(schema, { processDefault: false, minify: true }), "utf8");
await writeFile(join(dir, "celery-runtime.mjs"), `
  import { bool, defineEnv, int, oneOf, parseEnv, str } from "../../../src/index.js";
  const schema = defineEnv({
    NODE_ENV: oneOf(["development", "test", "production"]),
    PORT: int({ min: 1, max: 65535 }),
    DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
    DEBUG: bool(),
    API_KEY: str({ min: 16 })
  });
  export function loadEnv(env) { return parseEnv(schema, env); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "zod.mjs"), `
  import * as z from "zod";
  const toBool = (v) => v === "true" || v === "1" || v === "yes" || v === "on";
  const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z.string().min(1).startsWith("postgres://"),
    DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool),
    API_KEY: z.string().min(16)
  });
  export function loadEnv(env) { return schema.parse(env); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "zod-mini.mjs"), `
  import * as z from "zod/mini";
  const toBool = (v) => v === "true" || v === "1" || v === "yes" || v === "on";
  const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().check(z.int(), z.minimum(1), z.maximum(65535)),
    DATABASE_URL: z.string().check(z.minLength(1), z.startsWith("postgres://")),
    DEBUG: z.pipe(z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]), z.transform(toBool)),
    API_KEY: z.string().check(z.minLength(16))
  });
  export function loadEnv(env) { return z.parse(schema, env); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "valibot.mjs"), `
  import * as v from "valibot";
  const toBool = (x) => x === "true" || x === "1" || x === "yes" || x === "on";
  const schema = v.object({
    NODE_ENV: v.picklist(["development", "test", "production"]),
    PORT: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(65535)),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1), v.startsWith("postgres://")),
    DEBUG: v.pipe(v.string(), v.picklist(["true", "false", "1", "0", "yes", "no", "on", "off"]), v.transform(toBool)),
    API_KEY: v.pipe(v.string(), v.minLength(16))
  });
  export function loadEnv(env) { return v.parse(schema, env); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "valienv.mjs"), `
  import { boolean, oneOf, port, string, validate } from "valienv";
  const validators = {
    NODE_ENV: oneOf("development", "test", "production"),
    PORT: port,
    DATABASE_URL: (x) => { const v = string(x); if (v?.startsWith("postgres://")) return v; },
    DEBUG: boolean,
    API_KEY: (x) => { const v = string(x); if (v && v.length >= 16) return v; }
  };
  export function loadEnv(env) { return validate({ env, validators }); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "envsafe.mjs"), `
  import { bool, envsafe, makeValidator, str } from "envsafe";
  const db = makeValidator((x) => { if (x.startsWith("postgres://")) return x; throw Error(); });
  const api = makeValidator((x) => { if (x.length >= 16) return x; throw Error(); });
  const port = makeValidator((x) => { const n = Number(x); if (Number.isInteger(n) && n >= 1 && n <= 65535) return n; throw Error(); });
  const schema = { NODE_ENV: str({ choices: ["development", "test", "production"] }), PORT: port(), DATABASE_URL: db(), DEBUG: bool(), API_KEY: api() };
  export function loadEnv(env) { return envsafe(schema, { env, reporter: ({ errors }) => { if (Object.keys(errors).length) throw Error(); } }); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "envalid.mjs"), `
  import { bool, cleanEnv, makeValidator } from "envalid";
  const nodeEnv = makeValidator((x) => { if (x === "development" || x === "test" || x === "production") return x; throw Error(); });
  const db = makeValidator((x) => { if (x.startsWith("postgres://")) return x; throw Error(); });
  const api = makeValidator((x) => { if (x.length >= 16) return x; throw Error(); });
  const port = makeValidator((x) => { const n = Number(x); if (Number.isInteger(n) && n >= 1 && n <= 65535) return n; throw Error(); });
  const schema = { NODE_ENV: nodeEnv(), PORT: port(), DATABASE_URL: db(), DEBUG: bool(), API_KEY: api() };
  export function loadEnv(env) { return cleanEnv(env, schema, { reporter: ({ errors }) => { if (Object.keys(errors).length) throw Error(); } }); }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "env-var.mjs"), `
  import { from } from "env-var";
  const validNodeEnv = ["development", "test", "production"];
  export function loadEnv(source) {
    const env = from(source);
    const DATABASE_URL = env.get("DATABASE_URL").required().asString();
    const API_KEY = env.get("API_KEY").required().asString();
    if (!DATABASE_URL.startsWith("postgres://")) throw Error();
    if (API_KEY.length < 16) throw Error();
    return {
      NODE_ENV: env.get("NODE_ENV").required().asEnum(validNodeEnv),
      PORT: env.get("PORT").required().asPortNumber(),
      DATABASE_URL,
      DEBUG: env.get("DEBUG").required().asBool(),
      API_KEY
    };
  }
  export default loadEnv;
`, "utf8");
await writeFile(join(dir, "t3-env-core.mjs"), `
  import { createEnv } from "@t3-oss/env-core";
  import * as z from "zod";
  const toBool = (v) => v === "true" || v === "1" || v === "yes" || v === "on";
  const server = {
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z.string().min(1).startsWith("postgres://"),
    DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool),
    API_KEY: z.string().min(16)
  };
  export function loadEnv(env) { return createEnv({ server, runtimeEnv: env }); }
  export default loadEnv;
`, "utf8");

const rows = [];
for (const name of ["celery-generated", "celery-runtime", "zod", "zod-mini", "valibot", "valienv", "envsafe", "envalid", "env-var", "t3-env-core"]) {
  const outfile = join(outDir, `${name}.js`);
  await esbuild.build({
    entryPoints: [join(dir, `${name}.mjs`)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    minify: true,
    treeShaking: true,
    logLevel: "silent"
  });
  const code = await readFile(outfile);
  rows.push({ name, raw_bytes: code.length, gzip_bytes: gzipSync(code, { level: 9 }).length });
}

console.table(rows);

if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-shipped-size/1",
    generatedAt: new Date().toISOString(),
    rows
  }, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
