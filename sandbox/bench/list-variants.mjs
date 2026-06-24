import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { Bench } from "tinybench";
import { bool, defineEnv, int, list, oneOf, parseEnv, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(process.env.LIST_COUNT || 200);
const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);
const commaWords = Array.from({ length: count }, (_, i) => ` value_${i} `).join(",");
const defaultWords = Array.from({ length: count }, (_, i) => (i % 17 === 0 ? "" : `value_${i}`)).join(",");
const optionalWords = Array.from({ length: count }, (_, i) => (i % 17 === 0 ? "" : `value_${i}`)).join(",");
const commaInts = Array.from({ length: count }, (_, i) => String(i + 1)).join(",");
const commaBools = Array.from({ length: count }, (_, i) => (i % 17 === 0 ? "" : i % 2 ? "false" : "true")).join(",");
const commaEnums = Array.from({ length: count }, (_, i) => (i % 17 === 0 ? "" : i % 3 === 0 ? "alpha" : i % 3 === 1 ? "beta" : "release")).join(",");
const wideInts = Array.from({ length: count }, (_, i) => String(i + 1)).join("::");
const rawWords = Array.from({ length: count }, (_, i) => ` value_${i} `).join(",");
const chars = Array.from({ length: count }, (_, i) => String(i % 10)).join("");
const shortCommaWords = Array.from({ length: shortCount }, (_, i) => ` value_${i} `).join(",");
const shortDefaultWords = Array.from({ length: shortCount }, (_, i) => (i % 7 === 0 ? "" : `value_${i}`)).join(",");
const shortOptionalWords = Array.from({ length: shortCount }, (_, i) => (i % 7 === 0 ? "" : `value_${i}`)).join(",");
const shortCommaInts = Array.from({ length: shortCount }, (_, i) => String(i + 1)).join(",");
const shortCommaBools = Array.from({ length: shortCount }, (_, i) => (i % 7 === 0 ? "" : i % 2 ? "false" : "true")).join(",");
const shortCommaEnums = Array.from({ length: shortCount }, (_, i) => (i % 7 === 0 ? "" : i % 3 === 0 ? "alpha" : i % 3 === 1 ? "beta" : "release")).join(",");
const shortWideInts = Array.from({ length: shortCount }, (_, i) => String(i + 1)).join("::");

const cases = [
  {
    name: "str trim comma",
    key: "WORDS",
    schema: defineEnv({ WORDS: list(str({ min: 1 })) }),
    env: envPool("WORDS", commaWords),
    shortEnv: envPool("WORDS", shortCommaWords)
  },
  {
    name: "str item default",
    key: "DEFAULT_WORDS",
    schema: defineEnv({ DEFAULT_WORDS: list(str({ min: 1, default: "fallback" })) }),
    env: envPool("DEFAULT_WORDS", defaultWords),
    shortEnv: envPool("DEFAULT_WORDS", shortDefaultWords)
  },
  {
    name: "str item optional",
    key: "OPTIONAL_WORDS",
    schema: defineEnv({ OPTIONAL_WORDS: list(str({ min: 1, optional: true })) }),
    env: envPool("OPTIONAL_WORDS", optionalWords),
    shortEnv: envPool("OPTIONAL_WORDS", shortOptionalWords)
  },
  {
    name: "int wide sep",
    key: "IDS",
    schema: defineEnv({ IDS: list(int({ min: 1, max: 100000 }), { separator: "::" }) }),
    env: envPool("IDS", wideInts),
    shortEnv: envPool("IDS", shortWideInts)
  },
  {
    name: "strict int item default",
    key: "STRICT_IDS",
    schema: defineEnv({ STRICT_IDS: list(int({ strict: true, min: 1, max: 100000, default: 1 })) }),
    env: envPool("STRICT_IDS", commaInts),
    shortEnv: envPool("STRICT_IDS", shortCommaInts)
  },
  {
    name: "bool item default",
    key: "FLAGS",
    schema: defineEnv({ FLAGS: list(bool({ default: true })) }),
    env: envPool("FLAGS", commaBools),
    shortEnv: envPool("FLAGS", shortCommaBools)
  },
  {
    name: "enum item default",
    key: "MODES",
    schema: defineEnv({ MODES: list(oneOf(["alpha", "beta", "release"], { default: "alpha" })) }),
    env: envPool("MODES", commaEnums),
    shortEnv: envPool("MODES", shortCommaEnums)
  },
  {
    name: "enum item optional",
    key: "OPT_MODES",
    schema: defineEnv({ OPT_MODES: list(oneOf(["alpha", "beta", "release"], { optional: true })) }),
    env: envPool("OPT_MODES", commaEnums),
    shortEnv: envPool("OPT_MODES", shortCommaEnums)
  },
  {
    name: "str trim false",
    key: "RAW",
    schema: defineEnv({ RAW: list(str({ min: 2 }), { trim: false }) }),
    env: envPool("RAW", rawWords),
    shortEnv: envPool("RAW", shortCommaWords)
  },
  {
    name: "str empty sep",
    key: "CHARS",
    schema: defineEnv({ CHARS: list(str(), { separator: "", trim: false }) }),
    env: envPool("CHARS", chars),
    shortEnv: envPool("CHARS", chars.slice(0, shortCount))
  },
  {
    name: "str empty sep item default",
    key: "DEFAULT_CHARS",
    schema: defineEnv({ DEFAULT_CHARS: list(str({ default: "x" }), { separator: "", trim: false }) }),
    env: envPool("DEFAULT_CHARS", chars),
    shortEnv: envPool("DEFAULT_CHARS", chars.slice(0, shortCount))
  }
];

for (const c of cases) {
  c.generated = await generated(c.schema, `list.variant.${c.key.toLowerCase()}.generated.mjs`);
  assert.equal(c.generated.loadEnv(c.env[0])[c.key].length, count);
  assert.equal(parseEnv(c.schema, c.env[1])[c.key].length, count);
  assert.equal(c.generated.loadEnv(c.shortEnv[0])[c.key].length, shortCount);
  assert.equal(parseEnv(c.schema, c.shortEnv[1])[c.key].length, shortCount);
}

let sink;
let roundRobin = 0;
const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

for (const c of cases) {
  bench
    .add(`generated ${c.name} ${shortCount}`, () => { sink = c.generated.loadEnv(next(c.shortEnv)); })
    .add(`runtime ${c.name} ${shortCount}`, () => { sink = parseEnv(c.schema, next(c.shortEnv)); })
    .add(`generated ${c.name} ${count}`, () => { sink = c.generated.loadEnv(next(c.env)); })
    .add(`runtime ${c.name} ${count}`, () => { sink = parseEnv(c.schema, next(c.env)); });
}

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
await bench.run();
const rows = bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
}));
if (args.artifactOut) {
  await writeFile(args.artifactOut, `${JSON.stringify({ schema: "celery-list-variants/1", rows }, null, 2)}\n`, "utf8");
} else {
  console.table(rows);
}

if (!sink) process.exitCode = 1;

async function generated(schema, file) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema), "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function envPool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function next(pool) {
  return pool[roundRobin++ & 3];
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
