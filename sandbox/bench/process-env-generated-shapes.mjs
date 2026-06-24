import { Bench } from "tinybench";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cpus } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const counts = (args.counts || "40,160").split(",").map((value) => Number(value.trim()));
const rows = [];
let sink;

for (const count of counts) {
  const schemaObject = makeSchema(count);
  const schema = defineEnv(schemaObject);
  const keys = Object.keys(schemaObject);
  const plainEnv = Object.freeze(makeEnv(count));
  Object.assign(process.env, plainEnv);

  const currentSource = generateValidator(schema, { optimize: "speed" });
  const destructureSource = transformEnvReads(currentSource, keys);
  const snapshotIfSource = snapshotProcessEnv(currentSource, "if");
  const snapshotAlwaysSource = snapshotProcessEnv(currentSource, "always");
  const manualDefaultSource = manualProcessDefault(currentSource);
  const candidates = [
    ["current", await generated(`process-env.${count}.current.mjs`, currentSource)],
    ["destructure", await generated(`process-env.${count}.destructure.mjs`, destructureSource)],
    ["snapshot-if", await generated(`process-env.${count}.snapshot-if.mjs`, snapshotIfSource)],
    ["snapshot-always", await generated(`process-env.${count}.snapshot-always.mjs`, snapshotAlwaysSource)],
    ["manual-default", await generated(`process-env.${count}.manual-default.mjs`, manualDefaultSource)]
  ];

  const expected = candidates[0][1].loadEnv(plainEnv);
  for (const [, mod] of candidates) {
    assertSame(expected, mod.loadEnv(plainEnv));
    assertSame(expected, mod.loadEnv(process.env));
    assertSame(expected, mod.loadEnv());
  }

  const bench = new Bench({
    time: Number(process.env.BENCH_TIME || 750),
    warmupTime: Number(process.env.BENCH_WARMUP || 250)
  });
  for (const [name, mod] of candidates) {
    bench
      .add(`${name} plain ${count}`, () => { sink = mod.loadEnv(plainEnv); })
      .add(`${name} process.env explicit ${count}`, () => { sink = mod.loadEnv(process.env); })
      .add(`${name} process.env default ${count}`, () => { sink = mod.loadEnv(); });
  }
  await bench.run();

  const files = new Map(candidates.map(([name, mod]) => [name, mod.file]));
  for (const task of bench.tasks) {
    const name = task.name.split(" ")[0];
    const source = await readFile(files.get(name));
    rows.push({
      count,
      fields: keys.length,
      name: task.name,
      raw_bytes: source.length,
      gzip_bytes: gzipSync(source, { level: 9 }).length,
      hz: Math.round(task.result?.throughput?.mean || 0),
      mean_us: round((task.result?.latency?.mean || 0) * 1000),
      p75_us: round((task.result?.latency?.p75 || 0) * 1000),
      p99_us: round((task.result?.latency?.p99 || 0) * 1000),
      rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
    });
  }
}

const runtime = currentRuntimeMetadata();
console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
console.table(rows);
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-process-env-generated-shapes/1",
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

async function generated(file, source) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, source, "utf8");
  const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  return { loadEnv: mod.loadEnv, file: out };
}

function transformEnvReads(source, keys) {
  const lines = source.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^(?:export )?function \w+\(env\b/.test(line)) {
      out.push(replaceEnvReads(line, keys));
      continue;
    }
    const block = [line];
    while (++i < lines.length) {
      block.push(lines[i]);
      if (lines[i] === "}") break;
    }
    const text = block.join("\n");
    const localKeys = keys.filter((key) => text.includes(`env.${key}`));
    out.push(block[0]);
    if (localKeys.length) out.push(`  const { ${localKeys.join(", ")} } = env;`);
    for (let j = 1; j < block.length; j++) out.push(replaceEnvReads(block[j], localKeys));
  }
  return out.join("\n");
}

function replaceEnvReads(line, keys) {
  for (const key of keys) line = line.replaceAll(`env.${key}`, key);
  return line;
}

function snapshotProcessEnv(source, mode) {
  return source.replace(
    /export function (\w+)\(env = process\.env\) \{/,
    mode === "always"
      ? "export function $1(env = process.env) {\n  env = { ...env };"
      : "export function $1(env = process.env) {\n  if (env === process.env) env = { ...env };"
  );
}

function manualProcessDefault(source) {
  return source.replace(
    /export function (\w+)\(env = process\.env\) \{/,
    "export function $1(env) {\n  if (env === undefined) env = process.env;"
  );
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
