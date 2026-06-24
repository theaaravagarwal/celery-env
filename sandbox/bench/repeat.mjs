import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const runs = Number(process.env.RUNS || process.argv[2] || 3);
const dir = await mkdtemp(join(tmpdir(), "celery-bench-"));
const artifacts = [];

try {
  for (let i = 0; i < runs; i += 1) {
    const out = join(dir, `bench-${i}.json`);
    const result = spawnSync(process.execPath, ["bench.mjs", "--artifact-out", out], {
      cwd: new URL(".", import.meta.url),
      env: process.env,
      encoding: "utf8"
    });
    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status || 1);
    }
    artifacts.push(JSON.parse(await readFile(out, "utf8")));
  }

  const names = artifacts[0].benchmarks.map((bench) => bench.name);
  const rows = names.map((name) => {
    const samples = artifacts.map((artifact) => artifact.benchmarks.find((bench) => bench.name === name).hz).sort((a, b) => a - b);
    return {
      name,
      median_hz: samples[Math.floor(samples.length / 2)],
      min_hz: samples[0],
      max_hz: samples[samples.length - 1],
      spread_pct: round(((samples[samples.length - 1] - samples[0]) / samples[Math.floor(samples.length / 2)]) * 100)
    };
  });

  const output = {
    schema: "celery-bench-repeat/1",
    generatedAt: new Date().toISOString(),
    runs,
    metadata: artifacts[0].metadata,
    rows
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
