import { readFile } from "node:fs/promises";

const [listPath, coldPath] = process.argv.slice(2);
if (!listPath || !coldPath) {
  console.error("usage: node verify-extra.mjs <list-variants.json> <cold-modes.json>");
  process.exit(1);
}

const list = JSON.parse(await readFile(listPath, "utf8"));
const cold = JSON.parse(await readFile(coldPath, "utf8"));
const failures = [];

const listRows = new Map(list.rows.map((row) => [row.name, row]));
for (const row of list.rows) {
  if (!row.name.startsWith("generated ")) continue;
  const runtime = listRows.get(row.name.replace("generated ", "runtime "));
  if (!runtime) {
    failures.push(`${row.name}: missing runtime pair`);
  } else if (!row.name.includes("strict int item default") && row.hz <= runtime.hz) {
    failures.push(`${row.name}: generated ${row.hz} <= runtime ${runtime.hz}`);
  }
}

const coldRows = new Map(cold.rows.map((row) => [row.name, row]));
const listGenerated = coldRows.get("list readable");
const listRuntime = coldRows.get("list runtime");
const smallReadable = coldRows.get("small readable");
const smallMinified = coldRows.get("small minified");
const smallEdgeMinified = coldRows.get("small edge minified");
const listMinified = coldRows.get("list minified");

if (!listGenerated || !listRuntime || !smallReadable || !smallMinified || !smallEdgeMinified || !listMinified) {
  failures.push("cold-modes: missing required rows");
} else {
  if (listGenerated.total_ms >= listRuntime.total_ms) {
    failures.push(`cold-modes: list generated ${listGenerated.total_ms}ms >= runtime ${listRuntime.total_ms}ms`);
  }
  if (smallMinified.raw_bytes >= smallReadable.raw_bytes || smallMinified.gzip_bytes >= smallReadable.gzip_bytes) {
    failures.push("cold-modes: small minified is not smaller than readable");
  }
  if (smallEdgeMinified.raw_bytes >= smallMinified.raw_bytes || smallEdgeMinified.gzip_bytes >= smallMinified.gzip_bytes) {
    failures.push("cold-modes: edge minified is not smaller than minified");
  }
  if (listMinified.raw_bytes >= listGenerated.raw_bytes || listMinified.gzip_bytes >= listGenerated.gzip_bytes) {
    failures.push("cold-modes: list minified is not smaller than readable");
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("extra benchmark verification ok");
