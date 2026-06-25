import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
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
    `), ["API_URL", "DEBUG", "NODE_ENV", "PORT", "SESSION_SECRET", "VITE_PUBLIC_KEY"]);
  });

  it("generates conservative schema source from env files and scanned code", async () => {
    const dir = join(process.cwd(), ".tmp", `celery-infer-${process.pid}-${Date.now()}`);
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
    assert.doesNotMatch(schema, /postgres:\/\/user:pass/);
  });

  it("writes an inferred schema with the CLI and feeds existing generation", async () => {
    const dir = join(process.cwd(), ".tmp", `celery-infer-cli-${process.pid}-${Date.now()}`);
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
  });

  it("uses default discovery and protects existing schema outputs", async () => {
    const dir = join(process.cwd(), ".tmp", `celery-infer-discover-${process.pid}-${Date.now()}`);
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
  });

  it("produces a schema object accepted by compiler helpers", async () => {
    const dir = join(process.cwd(), ".tmp", `celery-infer-compile-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".env.example"), "IDS=1,2,3\nMODE=local\n", "utf8");

    const schemaPath = join(dir, "env.schema.mjs");
    await writeFile(schemaPath, await inferSchemaSource({ cwd: dir }), "utf8");
    const schema = (await import(`${pathToFileURL(schemaPath).href}?t=${Date.now()}`)).default;
    const validator = generateValidator(schema, { processDefault: false });

    assert.match(validator, /export function loadEnv\(env\)/);
    assert.match(generateExample(schema), /IDS=1,2,3/);
  });
});
