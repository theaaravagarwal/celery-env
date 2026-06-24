import { readFile } from "node:fs/promises";

const [baselinePath, currentPath] = process.argv.slice(2);
const maxRegressionPct = Number(process.env.MAX_REGRESSION_PCT || 25);

if (!baselinePath || !currentPath) {
  console.error("usage: node compare.mjs <baseline.json> <current.json>");
  process.exit(1);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const current = JSON.parse(await readFile(currentPath, "utf8"));
const currentByName = new Map(current.benchmarks.map((bench) => [bench.name, bench]));
const rows = [];
const failures = [];

for (const bench of baseline.benchmarks) {
  if (!bench.name.startsWith("celery ")) continue;
  const now = currentByName.get(bench.name);
  if (!now) {
    failures.push(`${bench.name}: missing current benchmark`);
    continue;
  }
  const delta = ((now.hz - bench.hz) / bench.hz) * 100;
  const row = {
    name: bench.name,
    baseline_hz: Math.round(bench.hz),
    current_hz: Math.round(now.hz),
    delta_pct: Math.round(delta * 100) / 100
  };
  rows.push(row);
  if (delta < -maxRegressionPct) {
    failures.push(`${bench.name}: ${row.delta_pct}% regression exceeds ${maxRegressionPct}%`);
  }
}

console.table(rows);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
