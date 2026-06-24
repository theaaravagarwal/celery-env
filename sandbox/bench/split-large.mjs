import { Bench } from "tinybench";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const counts = (args.counts || "160,320").split(",").map((value) => Number(value.trim()));
const chunks = (args.chunks || "20,40,80").split(",").map((value) => Number(value.trim()));
const rows = [];
let sink;

for (const count of counts) {
  const schema = defineEnv(makeSchema(count));
  const env = Object.freeze(makeEnv(count));
  const base = await writeGenerated(`split.${count}.base.mjs`, generateValidator(schema));
  const candidates = [["baseline", base]];
  for (const chunk of chunks) {
    candidates.push([`split-${chunk}`, await writeGenerated(`split.${count}.${chunk}.mjs`, generateSplitValidator(count, chunk))]);
  }

  for (const [, mod] of candidates) {
    assertSame(base.loadEnv(env), mod.loadEnv(env));
  }

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
      name: task.name,
      raw_bytes: source.length,
      gzip_bytes: gzipSync(source, { level: 9 }).length,
      hz: Math.round(task.result?.throughput?.mean || 0),
      mean_us: round((task.result?.latency?.mean || 0) * 1000),
      rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
    });
  }
}

console.table(rows);
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-split-large/1",
    generatedAt: new Date().toISOString(),
    rows
  }, null, 2)}\n`, "utf8");
}
if (!sink) process.exitCode = 1;

async function writeGenerated(name, source) {
  const file = join(__dirname, "generated", name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return { loadEnv: mod.loadEnv, file };
}

function generateSplitValidator(count, chunkSize) {
  const chunks = [];
  for (let start = 0; start < count; start += chunkSize) {
    chunks.push([start, Math.min(start + chunkSize, count)]);
  }
  return [
    ...chunks.flatMap(([start, end], index) => emitChunk(index, start, end)),
    "export function loadEnv(env = process.env) {",
    "  const r = [];",
    ...chunks.map((_, index) => `  const c${index} = _c${index}(env, r);`),
    "  if (r.length) throw Error(\"Invalid environment:\\n- \" + r.join(\"\\n- \"));",
    `  return { ${Array.from({ length: count }, (_, i) => fields(i).map((key) => `${JSON.stringify(key)}: c${Math.floor(i / chunkSize)}[${JSON.stringify(key)}]`).join(", ")).join(", ")} };`,
    "}",
    "export default loadEnv;",
    ""
  ].join("\n");
}

function emitChunk(index, start, end) {
  const regs = [];
  const lines = [`function _c${index}(env, r) {`, "  let v;"];
  for (let i = start; i < end; i++) regs.push(`s${i}`, `n${i}`, `b${i}`, `m${i}`);
  lines.push(`  let ${regs.join(", ")};`);
  for (let i = start; i < end; i++) lines.push(...emitOne(i));
  lines.push(`  return { ${Array.from({ length: end - start }, (_, offset) => start + offset).flatMap((i) => [
    `${JSON.stringify(`STR_${i}`)}: s${i}`,
    `${JSON.stringify(`INT_${i}`)}: n${i}`,
    `${JSON.stringify(`BOOL_${i}`)}: b${i}`,
    `${JSON.stringify(`MODE_${i}`)}: m${i}`
  ]).join(", ")} };`);
  lines.push("}");
  return lines;
}

function emitOne(i) {
  return [
    `  v = env.STR_${i};`,
    `  if (v == null || v === "") r.push("STR_${i} is required");`,
    `  else if (v.length < 1) r.push("STR_${i} must have length >= 1");`,
    `  else s${i} = v;`,
    `  v = env.INT_${i};`,
    `  if (v == null || v === "") r.push("INT_${i} is required");`,
    "  else {",
    "    v = +v;",
    `    if (v !== (v | 0)) r.push("INT_${i} must be an integer");`,
    `    else if (v < 1) r.push("INT_${i} must be >= 1");`,
    `    else if (v > 100000) r.push("INT_${i} must be <= 100000");`,
    `    else n${i} = v;`,
    "  }",
    `  v = env.BOOL_${i};`,
    `  if (v == null || v === "") r.push("BOOL_${i} is required");`,
    `  else if (v === "true" || v === "1" || v === "yes" || v === "on") b${i} = true;`,
    `  else if (v === "false" || v === "0" || v === "no" || v === "off") b${i} = false;`,
    `  else r.push("BOOL_${i} must be a boolean");`,
    `  v = env.MODE_${i};`,
    `  if (v == null || v === "") r.push("MODE_${i} is required");`,
    `  else if (v === "on" || v === "off") m${i} = v;`,
    `  else r.push("MODE_${i} must be one of on, off");`
  ];
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

function fields(i) {
  return [`STR_${i}`, `INT_${i}`, `BOOL_${i}`, `MODE_${i}`];
}

function assertSame(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("split candidate output mismatch");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--counts") out.counts = argv[++i];
    else if (argv[i] === "--chunks") out.chunks = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
