import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { Bench } from "tinybench";
import { defineEnv, list, parseEnv, url } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { currentRuntimeMetadata } from "./runtime-target.mjs";

const W = "(c > 8 && c < 14 || c === 32 || c === 160 || c === 5760 || c > 8191 && c < 8203 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279)";
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const counts = [20, 200];
const protocolCases = [
  { id: "single", protocols: ["https"] },
  { id: "multi", protocols: ["http", "https"] }
];

const dir = await mkdtemp(join(tmpdir(), "celery-list-url-trim-bounds-"));

try {
  const cases = [];
  for (const protocolCase of protocolCases) {
    const schema = defineEnv({ URLS: list(url({ protocols: protocolCase.protocols })) });
    const currentSource = generateValidator(schema);
    const candidateSource = candidateValidatorSource(protocolCase.protocols);
    const current = await moduleFromSource(`current.${protocolCase.id}.mjs`, currentSource);
    const candidate = await moduleFromSource(`candidate.${protocolCase.id}.mjs`, candidateSource);
    const sizes = {
      current: sizeOf(currentSource),
      candidate: sizeOf(candidateSource)
    };

    for (const count of counts) {
      const env = envPool("URLS", paddedUrls(count, protocolCase.protocols));
      cases.push({ ...protocolCase, count, schema, current, candidate, sizes, env });
    }
  }

  assertSemantics(cases);

  let sink;
  let rr = 0;
  const bench = new Bench({
    time: Number(process.env.BENCH_TIME || 750),
    warmupTime: Number(process.env.BENCH_WARMUP || 250)
  });

  for (const c of cases) {
    bench
      .add(`current generated url ${c.id} ${c.count}`, () => { sink = c.current.loadEnv(next(c.env)); })
      .add(`candidate trim bounds url ${c.id} ${c.count}`, () => { sink = c.candidate.loadEnv(next(c.env)); })
      .add(`runtime parseEnv url ${c.id} ${c.count}`, () => { sink = parseEnv(c.schema, next(c.env)); });
  }

  const runtime = currentRuntimeMetadata();
  console.log(`${runtime.runtimeName} ${runtime.runtimeVersion} ${process.platform}/${process.arch}`);
  await bench.run();

  const rows = bench.tasks.map((task) => {
    const [, impl, protocolId, countText] = /^(current generated|candidate trim bounds|runtime parseEnv) url (single|multi) (\d+)$/.exec(task.name) || [];
    const protocolCase = cases.find((c) => c.id === protocolId && c.count === Number(countText));
    const size = impl === "current generated"
      ? protocolCase?.sizes.current
      : impl === "candidate trim bounds"
        ? protocolCase?.sizes.candidate
        : undefined;
    return {
      name: task.name,
      hz: Math.round(task.result?.throughput?.mean || 0),
      mean_us: round((task.result?.latency?.mean || 0) * 1000),
      p75_us: round((task.result?.latency?.p75 || 0) * 1000),
      p99_us: round((task.result?.latency?.p99 || 0) * 1000),
      rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a",
      raw_bytes: size?.raw_bytes ?? null,
      gzip_bytes: size?.gzip_bytes ?? null
    };
  });

  console.table(rows);

  if (args.artifactOut) {
    await mkdir(dirname(args.artifactOut), { recursive: true });
    await writeFile(args.artifactOut, `${JSON.stringify({
      schema: "celery-list-url-trim-bounds/1",
      generatedAt: new Date().toISOString(),
      metadata: {
        ...runtime,
        nodeVersion: process.version,
        v8Version: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
        cpuModel: cpus()[0]?.model || "unknown",
        benchTimeMs: Number(process.env.BENCH_TIME || 750),
        benchWarmupMs: Number(process.env.BENCH_WARMUP || 250),
        counts,
        protocolCases
      },
      rows
    }, null, 2)}\n`, "utf8");
  }

  if (!sink) process.exitCode = 1;

  function next(pool) {
    return pool[rr++ & 3];
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

function assertSemantics(cases) {
  for (const c of cases) {
    const env = c.env[0];
    const current = c.current.loadEnv(env);
    const candidate = c.candidate.loadEnv(env);
    const runtime = parseEnv(c.schema, env);
    assert.deepEqual(candidate, current, `${c.id} ${c.count}: candidate matches current generated`);
    assert.deepEqual(runtime, current, `${c.id} ${c.count}: runtime matches current generated`);
    assert.equal(current.URLS.length, c.count, `${c.id} ${c.count}: row count`);
    assert.equal(current.URLS[0], current.URLS[0].trim(), `${c.id} ${c.count}: values are trimmed`);

    const invalids = [
      { URLS: `${paddedUrls(2, c.protocols)}, not-a-url ` },
      { URLS: `${paddedUrls(2, c.protocols)}, ftp://blocked.example.com/path ` },
      { URLS: "   " }
    ];
    for (const invalid of invalids) {
      const currentError = result(() => c.current.loadEnv(invalid));
      const candidateError = result(() => c.candidate.loadEnv(invalid));
      const runtimeError = result(() => parseEnv(c.schema, invalid));
      assert.equal(currentError.ok, false, `${c.id} ${c.count}: current rejects invalid`);
      assert.deepEqual(candidateError, currentError, `${c.id} ${c.count}: candidate rejects like current`);
      assert.equal(runtimeError.ok, false, `${c.id} ${c.count}: runtime rejects invalid`);
    }
  }
}

function candidateValidatorSource(protocols) {
  const cases = protocols.map((protocol) => `case ${JSON.stringify(`${protocol}:`)}:`).join(" ");
  const protocolLabel = protocols.join(", ");
  const protocolError = JSON.stringify(`URLS item must use protocol ${protocolLabel}`);
  return `export function loadEnv(env = process.env) {
  let r;
  let v = env.URLS;
  let _0;
  if (v == null || v === "") (r || (r = [])).push("URLS is required");
  else {
    const l = [];
    const b = r?.length;
    for (let i = 0, s = 0, e;; i++, s = e + 1) {
      e = v.indexOf(",", s);
      let a = s;
      let z = e < 0 ? v.length : e;
      while (a < z) { const c = v.charCodeAt(a); if (!${W}) break; a++; }
      while (z > a) { const c = v.charCodeAt(z - 1); if (!${W}) break; z--; }
      const x = v.slice(a, z);
      try {
        switch (new URL(x).protocol) {
          ${cases} l[i] = x; break;
          default: (r || (r = [])).push(${protocolError});
        }
      } catch {
        (r || (r = [])).push("URLS item must be a URL");
      }
      if (e < 0) break;
    }
    if (r?.length === b) _0 = l;
  }
  if (r) throw Error("Invalid environment:\\n- " + r.join("\\n- "));
  return { URLS: _0 };
}
export default loadEnv;
`;
}

async function moduleFromSource(file, source) {
  const out = join(dir, file);
  await writeFile(out, source, "utf8");
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

function paddedUrls(count, protocols) {
  return Array.from({ length: count }, (_, i) => {
    const protocol = protocols[i % protocols.length];
    const pad = i % 3 === 0 ? "  " : i % 3 === 1 ? "\t" : " \t";
    return `${pad}${protocol}://svc-${i}.example.com/path?q=${i}${pad}`;
  }).join(",");
}

function envPool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function result(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function sizeOf(source) {
  return {
    raw_bytes: Buffer.byteLength(source),
    gzip_bytes: gzipSync(source, { level: 9 }).length
  };
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
