import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { generateExample, generateValidator } from "../src/compiler.js";
import { inferSchemaSource, parseEnvSource, scanEnvKeys } from "../src/infer.js";

describe("env schema inference", () => {
  it("parses common .env syntax", () => {
    assert.deepEqual(parseEnvSource([
      "# comment",
      "export PORT=3000 # local port",
      "DATABASE_URL='postgres://localhost/app'",
      "DEBUG=\"true\"",
      "EMPTY=",
      "BAD-NAME=value"
    ].join("\n")), [
      { key: "PORT", value: "3000" },
      { key: "DATABASE_URL", value: "postgres://localhost/app" },
      { key: "DEBUG", value: "true" },
      { key: "EMPTY", value: "" }
    ]);
  });

  it("scans static env references", () => {
    assert.deepEqual(scanEnvKeys(`
      const direct = process.env.API_URL;
      const bracket = process.env["SESSION_SECRET"];
      const vite = import.meta.env.VITE_PUBLIC_KEY;
      const { NODE_ENV, PORT: localPort, DEBUG = "false" } = process.env;
      const { VITE_API_URL } = import.meta.env;
    `), ["API_URL", "DEBUG", "NODE_ENV", "PORT", "SESSION_SECRET", "VITE_API_URL", "VITE_PUBLIC_KEY"]);
  });

  it("generates conservative schema source from env files and scanned code", async () => withTempDir("celery-infer-", async (dir) => {
    const env = join(dir, ".env.example");
    const source = join(dir, "src", "config.ts");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(env, [
      "NODE_ENV=development",
      "PORT=3000",
      "DEBUG=true",
      "RATE=.5",
      "DATABASE_URL=postgres://user:pass@localhost:5432/app",
      "PUBLIC_URL=https://example.com",
      "FEATURES=1,2,3",
      "SETTINGS={\"ok\":true}",
      "API_KEY=sk_should_not_be_emitted",
      "GITHUB_TOKEN=ghp_should_not_be_emitted",
      "JWT=eyJshouldNotBeEmitted",
      "NAME=celery"
    ].join("\n"), "utf8");
    await writeFile(source, "export const secret = process.env.SESSION_SECRET;\n", "utf8");

    const schema = await inferSchemaSource({ cwd: dir, envFiles: [".env.example"], scanPaths: ["src"] });

    assert.match(schema, /import \{ bool, defineEnv, int, json, list, num, oneOf, str, url \}/);
    assert.match(schema, /NODE_ENV: oneOf\(\["development","test","production"\], \{"default":"development"\}\)/);
    assert.match(schema, /PORT: int\(\{"strict":true,"example":3000\}\)/);
    assert.match(schema, /DEBUG: bool\(\{"example":true\}\)/);
    assert.match(schema, /RATE: num\(\{"strict":true,"example":0.5\}\)/);
    assert.match(schema, /PUBLIC_URL: url\(\{"protocols":\["https"\],"example":"https:\/\/example.com"\}\)/);
    assert.match(schema, /FEATURES: list\(int\(\{"strict":true\}\), \{"example":\[1,2,3\]\}\)/);
    assert.match(schema, /SETTINGS: json\(\{"example":\{"ok":true\}\}\)/);
    assert.match(schema, /SESSION_SECRET: str\(\{"min":1\}\)/);
    assert.doesNotMatch(schema, /sk_should_not_be_emitted/);
    assert.doesNotMatch(schema, /ghp_should_not_be_emitted/);
    assert.doesNotMatch(schema, /eyJshouldNotBeEmitted/);
    assert.doesNotMatch(schema, /postgres:\/\/user:pass/);
  }));

  it("does not emit examples from local env files", async () => withTempDir("celery-infer-local-", async (dir) => {
    await writeFile(join(dir, ".env.local"), [
      "PUBLIC_URL=https://local.example",
      "FEATURE_FLAG=true",
      "PORT=4000"
    ].join("\n"), "utf8");

    const schema = await inferSchemaSource({ cwd: dir });

    assert.match(schema, /PUBLIC_URL: url\(\{"protocols":\["https"\]\}\)/);
    assert.match(schema, /FEATURE_FLAG: bool\(\)/);
    assert.match(schema, /PORT: int\(\{"strict":true\}\)/);
    assert.doesNotMatch(schema, /local\.example/);
    assert.doesNotMatch(schema, /"example"/);
  }));

  it("writes an inferred schema with the CLI and feeds existing generation", async () => withTempDir("celery-infer-cli-", async (dir) => {
    await linkLocalPackage(dir);
    const env = join(dir, ".env.example");
    const source = join(dir, "src", "config.js");
    const schema = join(dir, "env.schema.mjs");
    const out = join(dir, "env.mjs");
    const example = join(dir, ".env.generated");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(env, [
      "PORT=3000",
      "DEBUG=false",
      "PUBLIC_URL=https://example.com"
    ].join("\n"), "utf8");
    await writeFile(source, "const secret = process.env.SESSION_SECRET;\n", "utf8");

    const inferred = spawnSync(process.execPath, [
      "src/cli.js",
      "infer",
      "--schema", schema,
      "--env", env,
      "--scan", join(dir, "src")
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(inferred.status, 0, inferred.stderr);
    assert.match(await readFile(schema, "utf8"), /SESSION_SECRET/);

    const generated = spawnSync(process.execPath, [
      "src/cli.js",
      "generate",
      "--schema", schema,
      "--out", out,
      "--example", example,
      "--no-process-default"
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);

    const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
    assert.deepEqual(mod.loadEnv({
      PORT: "3000",
      DEBUG: "false",
      PUBLIC_URL: "https://example.com",
      SESSION_SECRET: "dev-secret"
    }), {
      PORT: 3000,
      DEBUG: false,
      PUBLIC_URL: "https://example.com",
      SESSION_SECRET: "dev-secret"
    });
    assert.match(await readFile(example, "utf8"), /PUBLIC_URL=https:\/\/example.com/);
  }));

  it("uses default discovery and protects existing schema outputs", async () => withTempDir("celery-infer-discover-", async (dir) => {
    const schema = join(dir, "env.schema.mjs");
    const link = join(dir, "linked.schema.mjs");
    const target = join(dir, "target.schema.mjs");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, ".env.example"), "PORT=3000\n", "utf8");
    await writeFile(join(dir, "src", "env.js"), "export const url = process.env.PUBLIC_URL;\n", "utf8");
    await writeFile(target, "target", "utf8");
    await symlink(target, link);

    const discovered = spawnSync(process.execPath, [
      join(process.cwd(), "src/cli.js"),
      "infer",
      "--schema", schema
    ], { cwd: dir, encoding: "utf8" });
    assert.equal(discovered.status, 0, discovered.stderr);
    assert.match(await readFile(schema, "utf8"), /PUBLIC_URL/);

    const blocked = spawnSync(process.execPath, [
      join(process.cwd(), "src/cli.js"),
      "infer",
      "--schema", schema
    ], { cwd: dir, encoding: "utf8" });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /already exists/);

    const symlinked = spawnSync(process.execPath, [
      join(process.cwd(), "src/cli.js"),
      "infer",
      "--schema", link,
      "--force"
    ], { cwd: dir, encoding: "utf8" });
    assert.notEqual(symlinked.status, 0);
    assert.match(symlinked.stderr, /symlink/);
    assert.equal(await readFile(target, "utf8"), "target");
  }));

  it("rejects symlinked env files and explicit scan roots", async () => withTempDir("celery-infer-links-", async (dir) => {
    const realEnv = join(dir, "real.env");
    const envLink = join(dir, ".env.example");
    const realSrc = join(dir, "real-src");
    const scanLink = join(dir, "src-link");
    await writeFile(realEnv, "PORT=3000\n", "utf8");
    await mkdir(realSrc, { recursive: true });
    await symlink(realEnv, envLink);
    await symlink(realSrc, scanLink);

    await assert.rejects(
      inferSchemaSource({ cwd: dir, envFiles: [".env.example"] }),
      /symlink; refusing to read/
    );
    await assert.rejects(
      inferSchemaSource({ cwd: dir, envFiles: [realEnv], scanPaths: [scanLink] }),
      /symlink; refusing to scan/
    );
  }));

  it("skips symlinked children during source scans", async () => withTempDir("celery-infer-skip-links-", async (dir) => {
    const src = join(dir, "src");
    const outside = join(dir, "outside");
    await mkdir(src, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(dir, ".env.example"), "PORT=3000\n", "utf8");
    await writeFile(join(src, "config.js"), "export const ok = process.env.PUBLIC_URL;\n", "utf8");
    await writeFile(join(outside, "secret.js"), "export const leak = process.env.OUTSIDE_SECRET;\n", "utf8");
    await symlink(join(outside, "secret.js"), join(src, "linked-secret.js"));
    await symlink(outside, join(src, "linked-dir"));

    const schema = await inferSchemaSource({ cwd: dir });

    assert.match(schema, /PUBLIC_URL/);
    assert.doesNotMatch(schema, /OUTSIDE_SECRET/);
  }));

  it("enforces inference resource caps", async () => withTempDir("celery-infer-caps-", async (dir) => {
    await writeFile(join(dir, "large.env"), `VALUE=${"x".repeat(256 * 1024)}\n`, "utf8");
    await assert.rejects(
      inferSchemaSource({ cwd: dir, envFiles: ["large.env"] }),
      /too large for env inference/
    );

    const src = join(dir, "src");
    await mkdir(src, { recursive: true });
    await writeFile(join(dir, ".env.example"), "PORT=3000\n", "utf8");
    await writeFile(join(src, "large.js"), `const value = "${"x".repeat(1024 * 1024)}";\n`, "utf8");
    await assert.rejects(
      inferSchemaSource({ cwd: dir, scanPaths: ["src"] }),
      /too large for source inference/
    );

    const bulky = join(dir, "bulky");
    await mkdir(bulky, { recursive: true });
    for (let i = 0; i < 9; i += 1) {
      await writeFile(join(bulky, `b${i}.js`), `process.env.BULK_${i};\n${"x".repeat(970000)}`, "utf8");
    }
    await assert.rejects(
      inferSchemaSource({ cwd: dir, scanPaths: ["bulky"] }),
      /source scan is too large/
    );

    const many = join(dir, "many");
    await mkdir(many, { recursive: true });
    for (let i = 0; i < 2001; i += 1) {
      await writeFile(join(many, `f${i}.js`), `process.env.KEY_${i};\n`, "utf8");
    }
    await assert.rejects(
      inferSchemaSource({ cwd: dir, scanPaths: ["many"] }),
      /too many files/
    );

    let deep = join(dir, "deep");
    await mkdir(deep, { recursive: true });
    for (let i = 0; i < 33; i += 1) {
      deep = join(deep, "d");
      await mkdir(deep);
    }
    await assert.rejects(
      inferSchemaSource({ cwd: dir, scanPaths: ["deep"] }),
      /scan depth limit/
    );
  }));

  it("produces a schema object accepted by compiler helpers", async () => withTempDir("celery-infer-compile-", async (dir) => {
    await linkLocalPackage(dir);
    await writeFile(join(dir, ".env.example"), "IDS=1,2,3\nMODE=local\n", "utf8");

    const schemaPath = join(dir, "env.schema.mjs");
    await writeFile(schemaPath, await inferSchemaSource({ cwd: dir }), "utf8");
    const schema = (await import(`${pathToFileURL(schemaPath).href}?t=${Date.now()}`)).default;
    const validator = generateValidator(schema, { processDefault: false });

    assert.match(validator, /export function loadEnv\(env\)/);
    assert.match(generateExample(schema), /IDS=1,2,3/);
  }));
});

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function linkLocalPackage(dir) {
  const modules = join(dir, "node_modules");
  await mkdir(modules, { recursive: true });
  await symlink(process.cwd(), join(modules, "celery-env"), "dir");
}
