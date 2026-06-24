import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const left = await loadRuntime(args.left || "artifacts/runtime-matrix/node");
const right = await loadRuntime(args.right || "artifacts/runtime-matrix/bun");
const rows = compareRows(left.real.rows, right.real.rows);
const artifact = {
  schema: "celery-runtime-compare/1",
  generatedAt: new Date().toISOString(),
  left: left.metadata,
  right: right.metadata,
  rows
};

console.table(rows);
if (args.artifactOut) {
  await writeFile(args.artifactOut, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function loadRuntime(dir) {
  const real = JSON.parse(await readFile(join(dir, "real-schemas.json"), "utf8"));
  const cold = JSON.parse(await readFile(join(dir, "cold-first.json"), "utf8"));
  return {
    real,
    cold,
    metadata: {
      real: real.metadata,
      cold: cold.metadata,
      dir
    }
  };
}

function compareRows(leftRows, rightRows) {
  const rightByKey = new Map(rightRows.map((row) => [`${row.suite}:${row.scenario}`, row]));
  return leftRows.map((leftRow) => {
    const rightRow = rightByKey.get(`${leftRow.suite}:${leftRow.scenario}`);
    const leftHz = leftRow.hz || 0;
    const rightHz = rightRow?.hz || 0;
    return {
      suite: leftRow.suite,
      scenario: leftRow.scenario,
      left_hz: leftHz,
      right_hz: rightHz,
      delta_pct: leftHz ? Math.round(((rightHz - leftHz) / leftHz) * 10000) / 100 : null
    };
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--left") out.left = argv[++i];
    else if (argv[i] === "--right") out.right = argv[++i];
    else if (argv[i] === "--artifact-out") out.artifactOut = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}
