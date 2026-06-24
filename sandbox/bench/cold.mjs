import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const cases = [
  ["empty process", ""],
  ["celery-env runtime", "../../src/index.js"],
  ["celery-env compiler", "../../src/compiler.js"],
  ["zod", "zod"],
  ["valibot", "valibot"],
  ["envalid", "envalid"],
  ["envsafe", "envsafe"]
];

const runs = Number(process.env.RUNS || 25);
const rows = [];

for (const [name, specifier] of cases) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    const result = spawnSync(process.execPath, ["-e", specifier ? `import(${JSON.stringify(specifier)})` : ""], {
      cwd: new URL(".", import.meta.url),
      stdio: "ignore"
    });
    const ms = performance.now() - start;
    if (result.status !== 0) {
      rows.push({ name, error: `exit ${result.status}` });
      break;
    }
    samples.push(ms);
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    rows.push({
      name,
      median_ms: round(samples[Math.floor(samples.length / 2)]),
      p75_ms: round(samples[Math.floor(samples.length * 0.75)]),
      min_ms: round(samples[0])
    });
  }
}

console.table(rows);

function round(value) {
  return Math.round(value * 100) / 100;
}
