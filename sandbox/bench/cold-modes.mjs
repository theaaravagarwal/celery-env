import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bool, defineEnv, int, list, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const runs = Number(process.env.RUNS || 15);
const small = [smallSchema(), smallEnv()];
const listCase = [listSchema(), listEnv()];
const cases = [
  ["small readable", small, {}],
  ["small minified", small, { minify: true }],
  ["small edge minified", small, { minify: true, processDefault: false }],
  ["list readable", listCase, {}],
  ["list minified", listCase, { minify: true }],
  ["list runtime", listCase, null]
];
const rows = [];

for (const [name, [schema, env], options] of cases) {
  if (options) {
    const file = join(__dirname, "generated", `cold-modes.${name.replaceAll(" ", "-")}.mjs`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, generateValidator(schema, options), "utf8");
    rows.push(await measureGenerated(name, file, env));
  } else {
    rows.push(await measureRuntime(name, env));
  }
}

if (args.artifactOut) {
  await writeFile(args.artifactOut, `${JSON.stringify({ schema: "celery-cold-modes/1", runs, rows }, null, 2)}\n`, "utf8");
} else {
  console.table(rows);
}

async function measureGenerated(name, file, env) {
  const source = await readFile(file);
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", generatedCase(file, env)], {
      cwd: __dirname,
      encoding: "utf8"
    });
    if (result.status !== 0) throw new Error(result.stderr.trim() || `exit ${result.status}`);
    samples.push(JSON.parse(result.stdout));
  }
  return {
    name,
    raw_bytes: source.length,
    gzip_bytes: gzipSync(source, { level: 9 }).length,
    import_ms: median(samples, "importMs"),
    setup_ms: 0,
    first_validate_ms: median(samples, "validateMs"),
    total_ms: total(samples)
  };
}

async function measureRuntime(name, env) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", runtimeCase(env)], {
      cwd: __dirname,
      encoding: "utf8"
    });
    if (result.status !== 0) throw new Error(result.stderr.trim() || `exit ${result.status}`);
    samples.push(JSON.parse(result.stdout));
  }
  return {
    name,
    raw_bytes: 0,
    gzip_bytes: 0,
    import_ms: median(samples, "importMs"),
    setup_ms: median(samples, "setupMs"),
    first_validate_ms: median(samples, "validateMs"),
    total_ms: total(samples)
  };
}

function generatedCase(file, env) {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import(${JSON.stringify(`./generated/${file.split("/").at(-1)}`)});
    const t1 = performance.now();
    const out = mod.loadEnv(env);
    const t2 = performance.now();
    if (!out) throw Error("bad output");
    console.log(JSON.stringify({ importMs: t1 - t0, validateMs: t2 - t1 }));
  `;
}

function runtimeCase(env) {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import("../../src/index.js");
    const t1 = performance.now();
    const schema = mod.defineEnv({
      IDS: mod.list(mod.int({ min: 1, max: 100000 })),
      FLAGS: mod.list(mod.bool()),
      WORDS: mod.list(mod.str({ min: 1 })),
      MODE: mod.oneOf(["development", "test", "production"])
    });
    const t2 = performance.now();
    const out = mod.parseEnv(schema, env);
    const t3 = performance.now();
    if (!out.IDS || out.IDS.length !== 200) throw Error("bad runtime output");
    console.log(JSON.stringify({ importMs: t1 - t0, setupMs: t2 - t1, validateMs: t3 - t2 }));
  `;
}

function smallSchema() {
  return defineEnv({
    NODE_ENV: oneOf(["development", "test", "production"]),
    PORT: int({ min: 1, max: 65535 }),
    DATABASE_URL: str({ min: 1, startsWith: "postgres://" }),
    DEBUG: bool(),
    API_KEY: str({ min: 16 })
  });
}

function smallEnv() {
  return {
    NODE_ENV: "production",
    PORT: "3000",
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    DEBUG: "false",
    API_KEY: "1234567890abcdef"
  };
}

function listSchema() {
  return defineEnv({
    IDS: list(int({ min: 1, max: 100000 })),
    FLAGS: list(bool()),
    WORDS: list(str({ min: 1 })),
    MODE: oneOf(["development", "test", "production"])
  });
}

function listEnv() {
  const nums = Array.from({ length: 200 }, (_, i) => String(i + 1));
  return {
    IDS: nums.join(","),
    FLAGS: nums.map((_, i) => (i & 1 ? "false" : "true")).join(","),
    WORDS: nums.map((n) => `word_${n}`).join(","),
    MODE: "production"
  };
}

function median(samples, key) {
  return round(samples.map((sample) => sample[key]).sort((a, b) => a - b)[samples.length >> 1]);
}

function total(samples) {
  return round(samples.map((s) => s.importMs + (s.setupMs || 0) + s.validateMs).sort((a, b) => a - b)[samples.length >> 1]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
