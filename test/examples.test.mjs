import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const examples = [
  "examples/env.schema.mjs",
  "examples/node-service/env.schema.mjs",
  "examples/next/env.schema.mjs"
];

describe("examples", () => {
  for (const schema of examples) {
    it(`generates from ${schema}`, async () => {
      const dir = join(tmpdir(), `celery-example-${process.pid}-${schema.replaceAll("/", "-")}`);
      const out = join(dir, "env.mjs");
      const types = join(dir, "env.d.ts");
      const example = join(dir, ".env.example");
      await mkdir(dir, { recursive: true });

      const result = spawnSync(process.execPath, [
        "src/cli.js",
        "generate",
        "--schema", schema,
        "--out", out,
        "--types", types,
        "--example", example,
        "--no-process-default",
        "--minify"
      ], { cwd: process.cwd(), encoding: "utf8" });

      assert.equal(result.status, 0, result.stderr);
      assert.match(await readFile(out, "utf8"), /export function loadEnv\(env\)/);
      assert.match(await readFile(types, "utf8"), /export declare function loadEnv/);
      assert.match(await readFile(example, "utf8"), /=/);
    });
  }
});
