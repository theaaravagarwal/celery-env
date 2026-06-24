import { Bench } from "tinybench";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const counts = (args.counts || "40,160,320").split(",").map((value) => Number(value.trim()));
const rows = [];
let sink;

for (const count of counts) {
  const schemaObject = makeSchema(count);
  const schema = defineEnv(schemaObject);
  const entries = Object.keys(schemaObject);
  const env = Object.freeze(makeEnv(count));
  const baseSource = generateValidator(schema, { optimize: "speed", splitLarge: false });
  const candidates = [
    ["locals-return", await generated(`shape.${count}.locals.mjs`, baseSource)],
    ["array-slots", await generated(`shape.${count}.array.mjs`, transformRegisters(baseSource, entries, "array"))],
    ["object-assign", await generated(`shape.${count}.object.mjs`, transformRegisters(baseSource, entries, "object"))]
  ];

  const expected = candidates[0][1].loadEnv(env);
  for (const [, mod] of candidates) assertSame(expected, mod.loadEnv(env));

  const bench = new Bench({
    time: Number(process.env.BENCH_TIME || 750),
    warmupTime: Number(process.env.BENCH_WARMUP || 250)
  });
  for (const [name, mod] of candidates) {
    bench.add(`${name} ${count}`, () => { sink = mod.loadEnv(env); });
  }
  await bench.run();
  for (const task of bench.tasks) {
    const file = candidates.find(([name]) => task.name.startsWith(`${name} `))?.[1].file;
    const source = await readFile(file);
    rows.push({
      count,
      fields: entries.length,
      name: task.name,
      raw_bytes: source.length,
      gzip_bytes: gzipSync(source, { level: 9 }).length,
      hz: Math.round(task.result?.throughput?.mean || 0),
      mean_us: round((task.result?.latency?.mean || 0) * 1000),
      rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
    });
  }
}

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
console.table(rows);
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-generated-shapes/1",
    generatedAt: new Date().toISOString(),
    rows
  }, null, 2)}\n`, "utf8");
}
if (!sink) process.exitCode = 1;

async function generated(file, source) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, source, "utf8");
  const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  return { loadEnv: mod.loadEnv, file: out };
}

function transformRegisters(source, entries, mode) {
  let out = source.replace(/^  let (?:_\d+(?:, )?)+;\n/m, mode === "array" ? "  const a = [];\n" : "  const o = {};\n");
  for (let i = entries.length - 1; i >= 0; i--) {
    const target = mode === "array" ? `a[${i}]` : `o[${JSON.stringify(entries[i])}]`;
    out = out.replace(new RegExp(`\\b_${i}\\b`, "g"), target);
  }
  if (mode === "object") {
    out = out.replace(/  return \{ [^\n]+ \};/, "  return o;");
  }
  return out;
}

function makeSchema(count) {
  const schema = {};
  for (let i = 0; i < count; i++) {
    schema[`STR_${i}`] = str({ min: 1 });
    schema[`INT_${i}`] = int({ min: 1, max: 100000 });
    schema[`BOOL_${i}`] = bool();
    schema[`MODE_${i}`] = oneOf(["on", "off"]);
  }
  return schema;
}

function makeEnv(count) {
  const env = {};
  for (let i = 0; i < count; i++) {
    env[`STR_${i}`] = `value_${i}`;
    env[`INT_${i}`] = String(1000 + i);
    env[`BOOL_${i}`] = i % 2 === 0 ? "true" : "false";
    env[`MODE_${i}`] = i % 2 === 0 ? "on" : "off";
  }
  return env;
}

function assertSame(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("generated shape output mismatch");
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
