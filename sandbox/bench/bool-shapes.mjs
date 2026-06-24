import { Bench } from "tinybench";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { bool, defineEnv } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const count = Number(args.count || 160);
const schema = defineEnv(Object.fromEntries(Array.from({ length: count }, (_, i) => [`B_${i}`, bool()])));
const envTrue = Object.freeze(Object.fromEntries(Array.from({ length: count }, (_, i) => [`B_${i}`, "true"])));
const envFalse = Object.freeze(Object.fromEntries(Array.from({ length: count }, (_, i) => [`B_${i}`, "false"])));
const base = generateValidator(schema, { optimize: "speed", splitLarge: false });
const candidates = [
  ["switch", await generated(`bool.${count}.switch.mjs`, base)],
  ["chain", await generated(`bool.${count}.chain.mjs`, rewriteBoolSwitches(base))]
];
let sink;

for (const env of [envTrue, envFalse]) {
  const expected = candidates[0][1].loadEnv(env);
  for (const [, mod] of candidates) assertSame(expected, mod.loadEnv(env));
}

const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});
for (const [name, mod] of candidates) {
  bench
    .add(`${name} true ${count}`, () => { sink = mod.loadEnv(envTrue); })
    .add(`${name} false ${count}`, () => { sink = mod.loadEnv(envFalse); });
}
await bench.run();

const rows = [];
for (const task of bench.tasks) {
  const file = candidates.find(([name]) => task.name.startsWith(`${name} `))?.[1].file;
  const source = await readFile(file);
  rows.push({
    name: task.name,
    raw_bytes: source.length,
    gzip_bytes: gzipSync(source, { level: 9 }).length,
    hz: Math.round(task.result?.throughput?.mean || 0),
    mean_us: round((task.result?.latency?.mean || 0) * 1000),
    rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
  });
}

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
console.table(rows);
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-bool-shapes/1",
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

function rewriteBoolSwitches(source) {
  return source.replace(/    switch \(v\.length\) \{\n      case 1: if \(v==="1"\) ([^;]+); else if \(v==="0"\) ([^;]+); else ([^;]+); break;\n      case 2: if \(v==="on"\) \1; else if \(v==="no"\) \2; else \3; break;\n      case 3: if \(v==="yes"\) \1; else if \(v==="off"\) \2; else \3; break;\n      case 4: if \(v==="true"\) \1; else \3; break;\n      case 5: if \(v==="false"\) \2; else \3; break;\n      default: \3;\n    \}/g, (_match, yes, no, bad) => `    if (v==="true"||v==="1"||v==="yes"||v==="on") ${yes};\n    else if (v==="false"||v==="0"||v==="no"||v==="off") ${no};\n    else ${bad};`);
}

function assertSame(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("bool shape output mismatch");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--count") out.count = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
