import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url);
const files = await walk(root.pathname);
let total = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const matches = source.match(/\bprocess\.env\b|(?<![A-Za-z0-9_$])env\.[A-Z][A-Z0-9_]+\b/g) || [];
  if (!matches.length) continue;
  total += matches.length;
  console.log(`${relative(file)}\t${matches.length}`);
}

console.log(`total\t${total}`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

function relative(file) {
  return file.slice(new URL("../", import.meta.url).pathname.length);
}
