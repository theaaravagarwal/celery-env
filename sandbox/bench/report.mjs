import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentRuntimeMetadata, spawnRuntime } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const targetRuntime = args.runtime || "node";
const benchTime = String(args.time || 150);
const benchWarmup = String(args.warmup || 75);
const coldRuns = String(args.coldRuns || 7);
const artifactDir = join(__dirname, "artifacts");
const paths = {
  hot: join(artifactDir, "report.hot.json"),
  real: join(artifactDir, "report.real-schemas.json"),
  cold: join(artifactDir, "report.cold-first.json"),
  size: join(artifactDir, "report.shipped-size.json"),
  json: join(artifactDir, "report.json"),
  markdown: join(artifactDir, "report.md")
};

await mkdir(artifactDir, { recursive: true });

run(targetRuntime, ["bench.mjs", "--artifact-out", paths.hot], { BENCH_TIME: benchTime, BENCH_WARMUP: benchWarmup });
run(targetRuntime, ["real-schemas.mjs", "--artifact-out", paths.real], { BENCH_TIME: benchTime, BENCH_WARMUP: benchWarmup });
run("node", ["cold-first-validate.mjs", "--target-runtime", targetRuntime, "--artifact-out", paths.cold], { RUNS: coldRuns });
run("node", ["shipped-size.mjs", "--artifact-out", paths.size]);

const hot = await readJson(paths.hot);
const real = await readJson(paths.real);
const cold = await readJson(paths.cold);
const size = await readJson(paths.size);
const report = {
  schema: "celery-benchmark-report/1",
  generatedAt: new Date().toISOString(),
  artifacts: {
    hot: "artifacts/report.hot.json",
    realSchemas: "artifacts/report.real-schemas.json",
    coldFirst: "artifacts/report.cold-first.json",
    shippedSize: "artifacts/report.shipped-size.json"
  },
  metadata: {
    ...currentRuntimeMetadata(),
    targetRuntime,
    benchmarkRuntime: real.metadata || hot.metadata || cold.metadata
  },
  summaries: {
    hot: hot.summary || {},
    hotRows: hot.benchmarks || [],
    realSchemas: real.rows,
    coldFirst: cold.rows,
    shippedSize: size.rows,
    scorecard: scorecard(hot.benchmarks || [], real.rows, cold.rows, size.rows)
  }
};

await writeFile(paths.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(paths.markdown, markdown(report), "utf8");
console.log(`wrote ${paths.markdown}`);
console.log(`wrote ${paths.json}`);

function run(runtime, argv, env = {}) {
  const result = spawnRuntime(runtime, argv, {
    cwd: __dirname,
    env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--runtime") out.runtime = argv[++i];
    else if (argv[i] === "--time") out.time = Number(argv[++i]);
    else if (argv[i] === "--warmup") out.warmup = Number(argv[++i]);
    else if (argv[i] === "--cold-runs") out.coldRuns = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function markdown(report) {
  const metadata = report.metadata || {};
  const runtime = metadata.benchmarkRuntime || metadata;
  return [
    "# celery-env Benchmark Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Runtime: ${runtime.runtimeName || "node"} ${runtime.runtimeVersion || runtime.nodeVersion || "unknown"} / V8 ${runtime.v8Version || "unknown"} / ${runtime.platform || "unknown"}/${runtime.arch || "unknown"} / ${runtime.cpuModel || "unknown"}`,
    "",
    "## Scorecard",
    "",
    scorecardMarkdown(report.summaries.scorecard),
    "",
    "## Synthetic Hot Matrix",
    "",
    syntheticRows(report.summaries.hotRows),
    "",
    "## Real Schemas",
    "",
    table(realHeaders(), realRows(report.summaries.realSchemas, "")),
    "",
    "## Real Schemas with process.env",
    "",
    table(realHeaders(), realRows(report.summaries.realSchemas, "process.env ")),
    "",
    "## Invalid Real Schemas",
    "",
    table(realHeaders(), realRows(report.summaries.realSchemas, "invalid ")),
    "",
    "## Speed Mode",
    "",
    speedModeRows(report.summaries.hot.optimizeSpeed),
    "",
    "## Cold First Validation",
    "",
    table(["Case", "Import ms", "Setup ms", "First validate ms", "Total ms"], report.summaries.coldFirst.map((row) => [
      row.name,
      fmt(row.import_ms),
      fmt(row.setup_ms),
      fmt(row.first_validate_ms),
      fmt(row.total_ms)
    ])),
    "",
    "## Shipped Bundle Size",
    "",
    table(["Case", "Raw bytes", "Gzip bytes"], report.summaries.shippedSize.map((row) => [
      row.name,
      int(row.raw_bytes),
      int(row.gzip_bytes)
    ])),
    "",
    "## Claim Guidance",
    "",
    "- Strong claim: generated celery-env is faster than common validator-based env parsing in these real-schema Node benchmarks.",
    "- Strong claim: generated celery-env ships a tiny standalone validator for the measured schema.",
    "- Strong claim: runtime celery-env beats Zod and Valibot on the valid real-schema corpus in this Node run.",
    "- Be specific with ratios; wins vary by schema shape and real process.env access is much slower than frozen plain objects.",
    "- Keep compile/generation cost separate from hot validation cost.",
    ""
  ].join("\n");
}

function scorecardMarkdown(score) {
  if (!score) return "No scorecard data was captured.";
  return table(["Metric", "Result"], [
    ["Valid real-schema geometric mean", `${int(score.real.generatedHz)} generated / ${int(score.real.bestCompetitorHz)} best external competitor (${fmt(score.real.generatedVsBest)}x)`],
    ["process.env real-schema geometric mean", `${int(score.processEnv.generatedHz)} generated / ${int(score.processEnv.bestCompetitorHz)} best external competitor (${fmt(score.processEnv.generatedVsBest)}x)`],
    ["Invalid real-schema geometric mean", `${int(score.invalid.generatedHz)} generated / ${int(score.invalid.bestCompetitorHz)} best external competitor (${fmt(score.invalid.generatedVsBest)}x)`],
    ["Cold first validation", `${fmt(score.cold.generatedTotalMs)} ms generated / ${fmt(score.cold.bestCompetitorTotalMs)} ms best external competitor (${fmt(score.cold.generatedVsBest)}x faster)`],
    ["Shipped gzip", `${int(score.size.generatedGzip)} B generated / ${int(score.size.bestCompetitorGzip)} B best external competitor (${fmt(score.size.generatedVsBest)}x smaller)`]
  ]);
}

function syntheticRows(rows) {
  const selected = [
    ["small", "small"],
    ["medium", "medium"],
    ["large", "large"],
    ["invalid_small", "invalid small"],
    ["strict_numeric", "strict numeric"]
  ];
  const names = new Set(selected.map(([scenario]) => scenario));
  const grouped = rowsByScenario(rows.filter((row) => names.has(row.scenario) && !row.name.includes("process.env")));
  return table(["Case", "Generated", "Runtime", "Zod", "Valibot", "Best external gap"], selected.map(([scenario, label]) => {
    const bucket = grouped.get(scenario) || {};
    const generated = bucket["celery-generated"]?.hz || 0;
    const competitors = [bucket.zod, bucket.valibot, bucket.envsafe, bucket.valienv].filter(Boolean);
    const best = Math.max(...competitors.map((row) => row.hz), 0);
    return [
      label,
      int(generated),
      int(bucket["celery-runtime"]?.hz || 0),
      int(bucket.zod?.hz || 0),
      int(bucket.valibot?.hz || 0),
      best ? `${round(generated / best)}x` : "n/a"
    ];
  }));
}

function realRows(rows, prefix) {
  const byCase = new Map();
  for (const row of rows) {
    if (!row.scenario.startsWith(prefix)) continue;
    const name = row.scenario.slice(prefix.length);
    if (name.includes("process.env") || name.includes("invalid")) continue;
    const bucket = byCase.get(name) || {};
    bucket[row.suite] = row;
    byCase.set(name, bucket);
  }
  return [...byCase].map(([name, bucket]) => {
    const generated = bucket["celery-generated"]?.hz || 0;
    const best = Math.max(...competitorSuites().map((suite) => bucket[suite]?.hz || 0));
    return [
      name,
      int(generated),
      int(bucket["celery-runtime"]?.hz || 0),
      int(bucket.zod?.hz || 0),
      int(bucket.valibot?.hz || 0),
      int(bucket.envalid?.hz || 0),
      int(bucket.envsafe?.hz || 0),
      int(bucket["env-var"]?.hz || 0),
      int(bucket["t3-env-core"]?.hz || 0),
      best ? `${round(generated / best)}x` : "n/a"
    ];
  });
}

function realHeaders() {
  return ["Case", "Generated ops/sec", "Runtime", "Zod", "Valibot", "Envalid", "Envsafe", "env-var", "T3 Env", "Best external gap"];
}

function scorecard(hotRows, realRows, coldRows, sizeRows) {
  return {
    synthetic: familyScore(hotRows.filter((row) => !row.name.includes("process.env")), ["small", "medium", "large"], ""),
    real: familyScore(realRows, ["api", "web", "worker", "list-heavy", "json-heavy"], ""),
    processEnv: familyScore(realRows, ["api", "web", "worker", "list-heavy", "json-heavy"], "process.env "),
    invalid: familyScore(realRows, ["api", "web", "worker", "list-heavy", "json-heavy"], "invalid "),
    cold: coldScore(coldRows),
    size: sizeScore(sizeRows)
  };
}

function familyScore(rows, scenarios, prefix) {
  const grouped = rowsByScenario(rows);
  const generated = [];
  const runtime = [];
  const zod = [];
  const valibot = [];
  const envalid = [];
  const envsafe = [];
  const envVar = [];
  const t3Env = [];
  const bestCompetitor = [];
  for (const scenario of scenarios) {
    const bucket = grouped.get(`${prefix}${scenario}`) || {};
    const g = bucket["celery-generated"]?.hz || 0;
    const r = bucket["celery-runtime"]?.hz || 0;
    const z = bucket.zod?.hz || 0;
    const v = bucket.valibot?.hz || 0;
    const e = bucket.envalid?.hz || 0;
    const es = bucket.envsafe?.hz || 0;
    const ev = bucket["env-var"]?.hz || 0;
    const t3 = bucket["t3-env-core"]?.hz || 0;
    if (!g) continue;
    generated.push(g);
    if (r) runtime.push(r);
    if (z) zod.push(z);
    if (v) valibot.push(v);
    if (e) envalid.push(e);
    if (es) envsafe.push(es);
    if (ev) envVar.push(ev);
    if (t3) t3Env.push(t3);
    bestCompetitor.push(Math.max(z, v, e, es, ev, t3));
  }
  const generatedHz = geoMean(generated);
  const runtimeHz = geoMean(runtime);
  const zodHz = geoMean(zod);
  const valibotHz = geoMean(valibot);
  const envalidHz = geoMean(envalid);
  const envsafeHz = geoMean(envsafe);
  const envVarHz = geoMean(envVar);
  const t3EnvHz = geoMean(t3Env);
  const bestCompetitorHz = geoMean(bestCompetitor);
  return {
    generatedHz: Math.round(generatedHz),
    runtimeHz: Math.round(runtimeHz),
    zodHz: Math.round(zodHz),
    valibotHz: Math.round(valibotHz),
    envalidHz: Math.round(envalidHz),
    envsafeHz: Math.round(envsafeHz),
    envVarHz: Math.round(envVarHz),
    t3EnvHz: Math.round(t3EnvHz),
    bestCompetitorHz: Math.round(bestCompetitorHz),
    generatedVsRuntime: round(generatedHz / runtimeHz),
    generatedVsZod: round(generatedHz / zodHz),
    generatedVsValibot: round(generatedHz / valibotHz),
    generatedVsEnvalid: round(generatedHz / envalidHz),
    generatedVsEnvsafe: round(generatedHz / envsafeHz),
    generatedVsEnvVar: round(generatedHz / envVarHz),
    generatedVsT3Env: round(generatedHz / t3EnvHz),
    generatedVsBest: round(generatedHz / bestCompetitorHz)
  };
}

function competitorSuites() {
  return ["zod", "valibot", "envalid", "envsafe", "env-var", "t3-env-core"];
}

function coldScore(rows) {
  const generated = rows.find((row) => row.name === "celery generated")?.total_ms || 0;
  const runtime = rows.find((row) => row.name === "celery runtime")?.total_ms || 0;
  const competitors = rows.filter((row) => row.name !== "celery generated" && row.name !== "celery runtime");
  const best = Math.min(...competitors.map((row) => row.total_ms).filter(Number.isFinite));
  return {
    generatedTotalMs: generated,
    runtimeTotalMs: runtime,
    bestCompetitorTotalMs: best,
    generatedVsRuntime: round(runtime / generated),
    generatedVsBest: round(best / generated)
  };
}

function sizeScore(rows) {
  const generated = rows.find((row) => row.name === "celery-generated")?.gzip_bytes || 0;
  const runtime = rows.find((row) => row.name === "celery-runtime")?.gzip_bytes || 0;
  const competitors = rows.filter((row) => row.name !== "celery-generated" && row.name !== "celery-runtime");
  const best = Math.min(...competitors.map((row) => row.gzip_bytes).filter(Number.isFinite));
  return {
    generatedGzip: generated,
    runtimeGzip: runtime,
    bestCompetitorGzip: best,
    generatedVsRuntime: round(runtime / generated),
    generatedVsBest: round(best / generated)
  };
}

function rowsByScenario(rows) {
  const out = new Map();
  for (const row of rows) {
    const bucket = out.get(row.scenario) || {};
    bucket[row.suite] = row;
    out.set(row.scenario, bucket);
  }
  return out;
}

function geoMean(values) {
  const positive = values.filter((value) => value > 0);
  if (!positive.length) return 0;
  return Math.exp(positive.reduce((sum, value) => sum + Math.log(value), 0) / positive.length);
}

function speedModeRows(summary) {
  if (!summary) return "No speed-mode summary was captured.";
  return table(["Case", "Default ops/sec", "Speed ops/sec", "Speedup"], [
    [
      "strict numeric",
      int(summary.strictNumericDefaultHz),
      int(summary.strictNumericSpeedHz),
      `${fmt(summary.strictNumericSpeedup)}x`
    ],
    [
      "invalid strict numeric",
      int(summary.invalidStrictNumericDefaultHz),
      int(summary.invalidStrictNumericSpeedHz),
      `${fmt(summary.invalidStrictNumericSpeedup)}x`
    ]
  ]);
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function fmt(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function int(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "n/a";
}

function round(value) {
  return Math.round(value * 100) / 100;
}
