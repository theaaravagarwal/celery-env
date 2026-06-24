import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { bool, defineEnv, int, oneOf, str } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const runs = Number(process.env.RUNS || 9);
const counts = (args.counts || "160,320").split(",").map((value) => Number(value.trim()));
const thresholds = (args.thresholds || "128,256,512").split(",").map((value) => Number(value.trim()));
const rows = [];

for (const count of counts) {
  const schema = defineEnv(makeSchema(count));
  const env = makeEnv(count);
  const candidates = [["unsplit", await generated(schema, `split-cold.${count}.unsplit.mjs`, { splitLarge: false })]];
  for (const threshold of thresholds) {
    candidates.push([`split-${threshold}`, await generated(schema, `split-cold.${count}.${threshold}.mjs`, { splitLargeThreshold: threshold })]);
  }

  for (const [name, candidate] of candidates) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", childCase(candidate.file, env)], {
        cwd: __dirname,
        encoding: "utf8"
      });
      if (result.status !== 0) throw new Error(result.stderr.trim() || `exit ${result.status}`);
      samples.push(JSON.parse(result.stdout));
    }
    rows.push({
      count,
      name: `${name} ${count}`,
      raw_bytes: candidate.rawBytes,
      gzip_bytes: candidate.gzipBytes,
      import_ms: median(samples, "importMs"),
      first_validate_ms: median(samples, "validateMs"),
      total_ms: total(samples)
    });
  }
}

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
console.table(rows);

if (args.artifactOut) {
  const runtime = currentRuntimeMetadata();
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-split-cold/1",
    generatedAt: new Date().toISOString(),
    metadata: {
      ...runtime,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model || "unknown",
      runs,
      counts,
      thresholds
    },
    rows
  }, null, 2)}\n`, "utf8");
}

async function generated(schema, file, options) {
  const out = join(__dirname, "generated", file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, generateValidator(schema, options), "utf8");
  const source = await readFile(out);
  return { file: out, rawBytes: source.length, gzipBytes: gzipSync(source, { level: 9 }).length };
}

function childCase(file, env) {
  return `
    import { performance } from "node:perf_hooks";
    const env = ${JSON.stringify(env)};
    const t0 = performance.now();
    const mod = await import(${JSON.stringify(`./generated/${file.split("/").at(-1)}`)});
    const t1 = performance.now();
    const out = mod.loadEnv(env);
    const t2 = performance.now();
    if (!out || out.STR_0 !== "value_0") throw Error("bad output");
    console.log(JSON.stringify({ importMs: t1 - t0, validateMs: t2 - t1 }));
  `;
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

function median(samples, key) {
  return round(samples.map((sample) => sample[key]).sort((a, b) => a - b)[samples.length >> 1]);
}

function total(samples) {
  return round(samples.map((sample) => sample.importMs + sample.validateMs).sort((a, b) => a - b)[samples.length >> 1]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else if (argv[i] === "--counts") out.counts = argv[++i];
    else if (argv[i] === "--thresholds") out.thresholds = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
