import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const variantsDir = join(root, "variants");
const variants = (await readdir(variantsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const variant of variants) {
  const dir = join(variantsDir, variant);
  const args = existsSync(join(dir, "package-lock.json"))
    ? ["ci", "--ignore-scripts"]
    : ["install", "--ignore-scripts", "--no-package-lock"];
  const result = spawnSync("npm", args, {
    cwd: dir,
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
