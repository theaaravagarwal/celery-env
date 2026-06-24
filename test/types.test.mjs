import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

const hasTsc = spawnSync("tsc", ["--version"], { encoding: "utf8" }).status === 0;

describe("TypeScript declarations", () => {
  it("type-checks the public runtime API", { skip: hasTsc ? false : "tsc is not available" }, async () => {
    const dir = join(tmpdir(), `celery-types-${process.pid}`);
    await mkdir(dir, { recursive: true });

    const importPath = relative(dir, join(process.cwd(), "src/index.js")).split(sep).join("/");
    const source = `
      import { bool, defineEnv, int, list, oneOf, parseEnv, str, type InferEnv } from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};

      const schema = defineEnv({
        MODE: oneOf(["development", "production"], { default: "development" }),
        PORT: int({ default: 3000 }),
        DEBUG: bool({ default: false }),
        OPTIONAL: str({ optional: true }),
        IDS: list(int())
      });

      type Env = InferEnv<typeof schema>;
      const env: Env = parseEnv(schema, {
        MODE: "production",
        PORT: "4000",
        DEBUG: "true",
        IDS: "1,2"
      });

      const mode: "development" | "production" = env.MODE;
      const port: number = env.PORT;
      const debug: boolean = env.DEBUG;
      const optional: string | undefined = env.OPTIONAL;
      const ids: readonly number[] = env.IDS;

      void mode;
      void port;
      void debug;
      void optional;
      void ids;

      // @ts-expect-error defaults must not narrow parsed values to the default literal.
      const only3000: 3000 = env.PORT;

      // @ts-expect-error optional values can be undefined.
      const requiredString: string = env.OPTIONAL;

      void only3000;
      void requiredString;
    `;

    await writeFile(join(dir, "usage.ts"), source);
    const result = spawnSync("tsc", [
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      join(dir, "usage.ts")
    ], { encoding: "utf8" });

    await rm(dir, { recursive: true, force: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
