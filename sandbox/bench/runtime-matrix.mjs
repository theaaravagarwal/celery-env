import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRuntimeList, runtimeMetadata, spawnRuntime } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const artifactDir = args.artifactDir || join(__dirname, "artifacts", "runtime-matrix");
const runtimes = parseRuntimeList(args.runtimes || args.runtime || "node");

await mkdir(artifactDir, { recursive: true });

for (const runtime of runtimes) {
  const metadata = runtimeMetadata(runtime);
  if (!metadata.available) {
    console.warn(`${runtime} unavailable: ${metadata.error}`);
    continue;
  }
  const dir = join(artifactDir, runtime);
  await mkdir(dir, { recursive: true });
  run(runtime, ["bench.mjs", "--artifact-out", join(dir, "hot.json")], { BENCH_TIME: "150", BENCH_WARMUP: "75" });
  run(runtime, ["real-schemas.mjs", "--artifact-out", join(dir, "real-schemas.json")], { BENCH_TIME: "150", BENCH_WARMUP: "75" });
  run("node", ["cold-first-validate.mjs", "--target-runtime", runtime, "--artifact-out", join(dir, "cold-first.json")], { RUNS: "7" });
  run("node", ["shipped-size.mjs", "--artifact-out", join(dir, "shipped-size.json")]);
}

function run(runtime, argv, env = {}) {
  const result = spawnRuntime(runtime, argv, {
    cwd: __dirname,
    stdio: "inherit",
    env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--runtime") out.runtime = argv[++i];
    else if (argv[i] === "--runtimes") out.runtimes = argv[++i];
    else if (argv[i] === "--artifact-dir") out.artifactDir = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
