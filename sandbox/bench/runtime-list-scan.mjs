import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Bench } from "tinybench";
import * as scan from "../../src/index.js";

const source = await readFile(new URL("../../src/index.js", import.meta.url), "utf8");
const splitSource = source.replace(
  /function readList\(key, rule, value, e\) \{[\s\S]*?\n\}\n\nfunction k/,
  `function readList(key, rule, value, e) {
  const parts = value.split(rule.separator);
  const out = new Array(parts.length);
  const b = e.length;
  const trim = rule.trim !== false;
  for (let i = 0; i < parts.length; i++) {
    const value = trim ? parts[i].trim() : parts[i];
    const ib = e.length;
    const p = readValue(key, rule.item, value, e, i);
    if (e.length === ib) out[i] = p;
  }
  if (e.length === b) return out;
}

function k`
);

if (splitSource === source) throw new Error("readList replacement failed");

const dir = await mkdtemp(join(tmpdir(), "celery-runtime-list-"));
try {
  const file = join(dir, "split.mjs");
  await writeFile(file, splitSource, "utf8");
  const split = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  const count = Number(process.env.LIST_COUNT || 200);
  const shortCount = Number(process.env.LIST_SHORT_COUNT || 20);

  const cases = makeCases(scan);
  for (const c of cases) {
    const expected = result(() => split.parseEnv(c.schema, c.env));
    const actual = result(() => scan.parseEnv(c.schema, c.env));
    assert.deepEqual(actual, expected, c.name);
  }

  const intSchema = scan.defineEnv({ IDS: scan.list(scan.int({ min: 1, max: 100000 })) });
  const strictIntSchema = scan.defineEnv({ IDS: scan.list(scan.int({ strict: true, min: 1, max: 100000 })) });
  const boolSchema = scan.defineEnv({ FLAGS: scan.list(scan.bool()) });
  const intEnv = envPool("IDS", range(count).join(","));
  const strictIntEnv = envPool("IDS", range(count).join(","));
  const boolEnv = envPool("FLAGS", range(count).map((_, i) => (i & 1 ? "false" : "true")).join(","));
  const shortIntEnv = envPool("IDS", range(shortCount).join(","));
  const shortBoolEnv = envPool("FLAGS", range(shortCount).map((_, i) => (i & 1 ? "false" : "true")).join(","));

  let sink;
  let rr = 0;
  const bench = new Bench({
    time: Number(process.env.BENCH_TIME || 750),
    warmupTime: Number(process.env.BENCH_WARMUP || 250)
  });

  bench
    .add(`split int ${shortCount}`, () => { sink = split.parseEnv(intSchema, next(shortIntEnv)); })
    .add(`scan int ${shortCount}`, () => { sink = scan.parseEnv(intSchema, next(shortIntEnv)); })
    .add(`split bool ${shortCount}`, () => { sink = split.parseEnv(boolSchema, next(shortBoolEnv)); })
    .add(`scan bool ${shortCount}`, () => { sink = scan.parseEnv(boolSchema, next(shortBoolEnv)); })
    .add(`split int ${count}`, () => { sink = split.parseEnv(intSchema, next(intEnv)); })
    .add(`scan int ${count}`, () => { sink = scan.parseEnv(intSchema, next(intEnv)); })
    .add(`split strict int ${count}`, () => { sink = split.parseEnv(strictIntSchema, next(strictIntEnv)); })
    .add(`scan strict int ${count}`, () => { sink = scan.parseEnv(strictIntSchema, next(strictIntEnv)); })
    .add(`split bool ${count}`, () => { sink = split.parseEnv(boolSchema, next(boolEnv)); })
    .add(`scan bool ${count}`, () => { sink = scan.parseEnv(boolSchema, next(boolEnv)); });

  console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
  await bench.run();
  console.table(bench.tasks.map((task) => ({
    name: task.name,
    hz: Math.round(task.result?.throughput?.mean || 0),
    mean_us: round((task.result?.latency?.mean || 0) * 1000),
    rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
  })));
  if (!sink) process.exitCode = 1;

  function next(pool) {
    return pool[rr++ & 3];
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

function makeCases(api) {
  return [
    {
      name: "leading trailing consecutive separators",
      schema: api.defineEnv({ IDS: api.list(api.int({ default: 7 })) }),
      env: { IDS: ",1,,2," }
    },
    {
      name: "multi-character separator",
      schema: api.defineEnv({ IDS: api.list(api.int({ min: 1 }), { separator: "::" }) }),
      env: { IDS: "1::2::3" }
    },
    {
      name: "empty separator code units",
      schema: api.defineEnv({ CHARS: api.list(api.str(), { separator: "", trim: false }) }),
      env: { CHARS: "a😀b" }
    },
    {
      name: "trim false",
      schema: api.defineEnv({ WORDS: api.list(api.str({ min: 2 }), { trim: false }) }),
      env: { WORDS: " a, b " }
    },
    {
      name: "aggregate errors",
      schema: api.defineEnv({ IDS: api.list(api.int({ min: 1 })) }),
      env: { IDS: "0,1,x" }
    }
  ];
}

function result(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, errors: error.errors };
  }
}

function envPool(key, value) {
  return Array.from({ length: 4 }, () => Object.freeze({ [key]: value }));
}

function range(count) {
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
