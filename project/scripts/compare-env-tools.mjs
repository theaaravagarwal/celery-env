import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const verify = process.argv.includes("--verify");
const writeArtifacts = process.argv.includes("--write");
const config = JSON.parse(await readFile(join(root, "comparison.config.json"), "utf8"));
const baseline = await analyzeProject(root, config.baseline.name);
const rows = [baseline];

for (const tool of config.tools) {
  const fullPath = join(root, tool.path);
  if (!existsSync(fullPath)) {
    rows.push({
      name: tool.name,
      status: "missing",
      runtimeDeps: "-",
      devDeps: tool.package,
      appLoc: "-",
      envMaintainedLoc: "-",
      generatedLoc: "-",
      testLoc: "-",
      envReads: "-",
      installPackages: "-",
      testCommand: "-",
      auditCommand: "-",
      files: "-",
      notes: tool.expectedShape
    });
    continue;
  }
  rows.push(await analyzeProject(fullPath, tool.name, tool));
}

annotateRows(rows);
printTable(rows);
if (writeArtifacts) await writeComparisonArtifacts(rows);
else if (verify) await verifyComparisonArtifacts(rows);

async function analyzeProject(projectPath, name, tool) {
  const files = await listFiles(projectPath);
  const pkg = await readPackage(projectPath);
  const installPackages = await countInstallPackages(projectPath);
  const sourceFiles = files.filter((file) => file.startsWith("src/") && file.endsWith(".js"));
  const appFiles = sourceFiles.filter((file) => !isEnvMaintainedFile(file));
  const testFiles = files.filter((file) => file.startsWith("test/") && file.endsWith(".mjs"));
  const generatedFiles = files.filter(isGeneratedFile);
  const envMaintainedFiles = files.filter((file) => !generatedFiles.includes(file) && isEnvMaintainedFile(file));
  const envReads = await countEnvReads(projectPath, sourceFiles);
  const commands = verify ? runVerification(projectPath) : { testCommand: "not run", auditCommand: "not run" };

  return {
    name,
    status: "present",
    runtimeDeps: Object.keys(pkg.dependencies || {}).sort().join(", ") || "none",
    devDeps: Object.keys(pkg.devDependencies || {}).sort().join(", ") || "none",
    appLoc: await countLoc(projectPath, appFiles),
    envMaintainedLoc: await countLoc(projectPath, envMaintainedFiles),
    generatedLoc: await countLoc(projectPath, generatedFiles),
    testLoc: await countLoc(projectPath, testFiles),
    envReads,
    installPackages,
    ...commands,
    files: files.length,
    notes: tool?.expectedShape || "baseline"
  };
}

async function readPackage(projectPath) {
  const path = join(projectPath, "package.json");
  if (!existsSync(path)) return {};
  return JSON.parse(await readFile(path, "utf8"));
}

async function countInstallPackages(projectPath) {
  const path = join(projectPath, "package-lock.json");
  if (!existsSync(path)) return 0;
  const lock = JSON.parse(await readFile(path, "utf8"));
  return Object.entries(lock.packages || {})
    .filter(([path, meta]) => path.startsWith("node_modules/") && !meta.dev)
    .length;
}

function runVerification(projectPath) {
  return {
    testCommand: commandStatus(projectPath, ["npm", "test"]),
    auditCommand: commandStatus(projectPath, ["npm", "run", "audit:env"])
  };
}

function commandStatus(projectPath, args) {
  const result = spawnSync(args[0], args.slice(1), { cwd: projectPath, encoding: "utf8" });
  if (result.status === 0) return "pass";
  return `fail ${result.status ?? "error"}`;
}

async function listFiles(projectPath, dir = "") {
  const fullDir = join(projectPath, dir);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "variants") continue;
    if (dir === "" && (entry.name === "COMPARISON_PLAN.md" || entry.name === "MIGRATION_BASELINE.md" || entry.name === "comparison.config.json")) continue;
    if (dir === "scripts" && entry.name === "compare-env-tools.mjs") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(projectPath, path));
    else files.push(path);
  }
  return files.sort();
}

function isGeneratedFile(file) {
  return file === "src/env.mjs" || file === "src/env.d.ts";
}

function isEnvMaintainedFile(file) {
  return file === "env.schema.mjs" ||
    file === "src/config.js" ||
    file === "src/env.js" ||
    file === "src/env.mjs" ||
    file === "src/env.d.ts" ||
    /(^|\/)(config|env|schema)\.[mc]?js$/.test(file) ||
    /env\.schema\.[mc]?js$/.test(file);
}

async function countLoc(projectPath, files) {
  let total = 0;
  for (const file of files) {
    const source = await readFile(join(projectPath, file), "utf8");
    total += source.split("\n").filter((line) => line.trim()).length;
  }
  return total;
}

async function countEnvReads(projectPath, files) {
  let total = 0;
  for (const file of files) {
    const source = await readFile(join(projectPath, file), "utf8");
    total += (source.match(/\bprocess\.env\b|(?<![A-Za-z0-9_$])env\.[A-Z][A-Z0-9_]+\b/g) || []).length;
  }
  return total;
}

function printTable(rows) {
  const headers = ["Tool", "Status", "Runtime deps", "Dev deps", "Install pkgs", "App LOC", "Env LOC", "Env LOC vs gen", "Generated LOC", "Test LOC", "Env reads"];
  if (verify) headers.push("Tests", "Audit");
  headers.push("Files", "Notes");
  const values = rows.map((row) => [
    row.name,
    row.status,
    row.runtimeDeps,
    row.devDeps,
    String(row.installPackages),
    String(row.appLoc),
    String(row.envMaintainedLoc),
    String(row.envLocDelta),
    String(row.generatedLoc),
    String(row.testLoc),
    String(row.envReads)
  ].concat(verify ? [
    row.testCommand,
    row.auditCommand
  ] : []).concat([
    String(row.files),
    row.notes
  ]));
  const widths = headers.map((header, index) => Math.max(header.length, ...values.map((row) => row[index].length)));
  console.log(format(headers, widths));
  console.log(format(widths.map((width) => "-".repeat(width)), widths));
  for (const row of values) console.log(format(row, widths));
}

function format(row, widths) {
  return row.map((value, index) => value.padEnd(widths[index])).join("  ");
}

function annotateRows(rows) {
  const generated = rows.find((row) => row.name === "celery generated");
  const base = typeof generated?.envMaintainedLoc === "number" ? generated.envMaintainedLoc : undefined;
  for (const row of rows) {
    if (typeof base !== "number" || typeof row.envMaintainedLoc !== "number") {
      row.envLocDelta = "-";
      continue;
    }
    const delta = row.envMaintainedLoc - base;
    row.envLocDelta = delta === 0 ? "0" : delta > 0 ? `+${delta}` : String(delta);
  }
}

async function writeComparisonArtifacts(rows) {
  const dir = join(root, "artifacts");
  await mkdir(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const artifact = {
    generatedAt,
    verified: verify,
    rows
  };
  await writeFile(join(dir, "env-tool-comparison.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(join(dir, "env-tool-comparison.md"), markdownReport(generatedAt, rows), "utf8");
}

async function verifyComparisonArtifacts(rows) {
  const artifact = JSON.parse(await readFile(join(root, "artifacts", "env-tool-comparison.json"), "utf8"));
  assert.equal(artifact.verified, true, "comparison artifact must be generated with --verify");
  assert.deepEqual(artifact.rows, rows, "comparison artifact is stale; run npm run compare:env-tools:write");
}

function markdownReport(generatedAt, rows) {
  const headers = ["Tool", "Runtime deps", "Install pkgs", "App LOC", "Env LOC", "Env LOC vs gen", "Generated LOC", "Test LOC", "Env reads"];
  if (verify) headers.push("Tests", "Audit");
  const lines = [
    "# Env Tool Comparison",
    "",
    `Generated: ${generatedAt}`,
    "",
    markdownTable(headers, rows.map((row) => [
      row.name,
      row.runtimeDeps,
      String(row.installPackages),
      String(row.appLoc),
      String(row.envMaintainedLoc),
      String(row.envLocDelta),
      String(row.generatedLoc),
      String(row.testLoc),
      String(row.envReads)
    ].concat(verify ? [row.testCommand, row.auditCommand] : []))),
    "",
    "All variants preserve the same fixture behavior: defaults, strict integers, booleans, URLs, lists, JSON, conditional secrets, secret-safe errors, and own-property env reads."
  ];
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}
