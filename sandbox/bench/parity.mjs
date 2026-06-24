import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bool, defineEnv, int, list, num, oneOf, str, url } from "../../src/index.js";
import { generateValidator } from "../../src/compiler.js";
import { parseRuntimeList, resolveRuntime, runtimeMetadata } from "./runtime-target.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const runtimes = parseRuntimeList(args.runtimes || "node,bun");
const generatedDir = join(__dirname, "generated");
const validatorFile = join(generatedDir, "parity.generated.mjs");
const runnerFile = join(generatedDir, "parity-runner.mjs");

const schema = defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  PORT: int({ min: 1, max: 65535 }),
  DEBUG: bool({ default: false }),
  DATABASE_URL: url({ protocols: ["https"] }),
  RATE: num({ strict: true, min: -1, max: 1 }),
  API_KEY: str({ min: 4 }),
  FLAGS: list(bool()),
  IDS: list(int({ strict: true, min: 1, max: 1000 }))
});

await mkdir(generatedDir, { recursive: true });
await writeFile(validatorFile, generateValidator(schema), "utf8");
await writeFile(runnerFile, runnerSource(), "utf8");

const rows = [];
let baseline;
for (const target of runtimes) {
  const metadata = runtimeMetadata(target);
  if (!metadata.available) {
    rows.push({ target, skipped: true, error: metadata.error });
    continue;
  }
  const result = spawnSync(resolveRuntime(target), [runnerFile], {
    cwd: __dirname,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    rows.push({ target, passed: false, error: result.stderr.trim() || `exit ${result.status}` });
    process.exitCode = 1;
    continue;
  }
  const output = JSON.parse(result.stdout);
  if (!baseline) baseline = output;
  const passed = JSON.stringify(output) === JSON.stringify(baseline);
  rows.push({ target, passed, output });
  if (!passed) process.exitCode = 1;
}

console.table(rows.map(({ output, ...row }) => row));
if (args.artifactOut) {
  await mkdir(dirname(args.artifactOut), { recursive: true });
  await writeFile(args.artifactOut, `${JSON.stringify({
    schema: "celery-runtime-parity/1",
    generatedAt: new Date().toISOString(),
    runtimes,
    rows
  }, null, 2)}\n`, "utf8");
}

function runnerSource() {
  return `
    import { bool, defineEnv, int, list, num, oneOf, parseEnv, str, url } from "../../../src/index.js";
    import { loadEnv } from "./parity.generated.mjs";

    const schema = defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
      PORT: int({ min: 1, max: 65535 }),
      DEBUG: bool({ default: false }),
      DATABASE_URL: url({ protocols: ["https"] }),
      RATE: num({ strict: true, min: -1, max: 1 }),
      API_KEY: str({ min: 4 }),
      FLAGS: list(bool()),
      IDS: list(int({ strict: true, min: 1, max: 1000 }))
    });
    const valid = {
      PORT: "3000",
      DATABASE_URL: "https://db.example.com",
      RATE: "+.5",
      API_KEY: "abcd",
      FLAGS: "true,0,yes,off",
      IDS: "1,2,3"
    };
    const invalid = {
      PORT: "0",
      DATABASE_URL: "http://db.example.com",
      RATE: "+.",
      API_KEY: "x",
      FLAGS: "true,maybe",
      IDS: "1,1001,x"
    };

    function capture(fn) {
      try {
        return { ok: true, value: fn() };
      } catch (error) {
        return { ok: false, name: error.name, message: error.message };
      }
    }

    console.log(JSON.stringify({
      generatedValid: capture(() => loadEnv(valid)),
      runtimeValid: capture(() => parseEnv(schema, valid)),
      generatedInvalid: capture(() => loadEnv(invalid)),
      runtimeInvalid: capture(() => parseEnv(schema, invalid))
    }));
  `;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--runtimes") out.runtimes = argv[++i];
    else if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
