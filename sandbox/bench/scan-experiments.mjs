import { Bench } from "tinybench";

const count = Number(process.env.LIST_COUNT || 200);
const valid = Array.from({ length: count }, (_, i) => String(i + 1)).join(",");
const invalidStart = `1e3,${valid}`;
const invalidMiddle = `${Array.from({ length: count >> 1 }, (_, i) => String(i + 1)).join(",")},1e3,${valid}`;
const invalidEnd = `${valid},1e3`;
let sink;

function splitStrict(v) {
  const parts = v.split(",");
  const out = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    let x = parts[i].trim();
    if (!/^[+-]?\d+$/.test(x)) throw Error();
    x = +x;
    if ((x | 0) !== x || x < 1 || x > 100000) throw Error();
    out[i] = x;
  }
  return out;
}

function indexStrict(v) {
  const out = [];
  for (let i = 0, s = 0, e;; i++, s = e + 1) {
    e = v.indexOf(",", s);
    let x = e < 0 ? v.slice(s) : v.slice(s, e);
    x = x.trim();
    if (!/^[+-]?\d+$/.test(x)) throw Error();
    x = +x;
    if ((x | 0) !== x || x < 1 || x > 100000) throw Error();
    out[i] = x;
    if (e < 0) return out;
  }
}

function scanStrict(v) {
  const out = [];
  for (let i = 0, p = 0, n = 0, sign = 1, seen = 0, tail = 0; p <= v.length; p++) {
    const c = p === v.length ? 44 : v.charCodeAt(p);
    if (ws(c)) {
      if (seen === 2) tail = 1;
      else if (seen) throw Error();
    } else if (c === 43 || c === 45) {
      if (seen) throw Error();
      seen = 1;
      sign = c === 45 ? -1 : 1;
    } else if (c >= 48 && c <= 57) {
      if (tail) throw Error();
      seen = 2;
      n = n * 10 + c - 48;
    } else if (c === 44) {
      if (seen !== 2) throw Error();
      n *= sign;
      if ((n | 0) !== n || n < 1 || n > 100000) throw Error();
      out[i++] = n;
      n = 0;
      sign = 1;
      seen = 0;
      tail = 0;
    } else {
      throw Error();
    }
  }
  return out;
}

assertOk(splitStrict(valid));
assertOk(indexStrict(valid));
assertOk(scanStrict(valid));
assertBad(splitStrict, invalidStart);
assertBad(indexStrict, invalidStart);
assertBad(scanStrict, invalidStart);
assertBad(splitStrict, invalidMiddle);
assertBad(indexStrict, invalidMiddle);
assertBad(scanStrict, invalidMiddle);
assertBad(splitStrict, invalidEnd);
assertBad(indexStrict, invalidEnd);
assertBad(scanStrict, invalidEnd);

const bench = new Bench({
  time: Number(process.env.BENCH_TIME || 750),
  warmupTime: Number(process.env.BENCH_WARMUP || 250)
});

bench
  .add(`split strict int ${count}`, () => { sink = splitStrict(valid); })
  .add(`index strict int ${count}`, () => { sink = indexStrict(valid); })
  .add(`scan strict int ${count}`, () => { sink = scanStrict(valid); });

console.log(`Node ${process.version} ${process.platform}/${process.arch}`);
await bench.run();
console.table(bench.tasks.map((task) => ({
  name: task.name,
  hz: Math.round(task.result?.throughput?.mean || 0),
  mean_us: round((task.result?.latency?.mean || 0) * 1000),
  p75_us: round((task.result?.latency?.p75 || 0) * 1000),
  p99_us: round((task.result?.latency?.p99 || 0) * 1000),
  rme: task.result?.throughput?.rme ? `${round(task.result.throughput.rme)}%` : "n/a"
})));

if (!sink) process.exitCode = 1;

function assertOk(value) {
  if (value.length !== count || value[0] !== 1 || value[count - 1] !== count) throw Error("bad parse");
}

function assertBad(fn, input) {
  try {
    fn(input);
    throw Error("accepted invalid");
  } catch {}
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function ws(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13;
}
