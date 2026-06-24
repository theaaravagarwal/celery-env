import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { bool, defineEnv, int, json, list, num, oneOf, str, url } from "../src/index.js";
import { generateExample, generateJsonSchema, generateTypes, generateValidator } from "../src/compiler.js";

describe("generateValidator", () => {
  it("emits a standalone validator with equivalent output", async () => {
    const schema = defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
      PORT: int({ min: 1, max: 65535 }),
      DEBUG: bool({ default: false }),
      DATABASE_URL: url({ protocols: ["https"] }),
      API_KEY: str({ min: 4 })
    });

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "env.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({
      PORT: "3000",
      DEBUG: "0",
      DATABASE_URL: "https://db.example.com",
      API_KEY: "abcd"
    }), {
      NODE_ENV: "development",
      PORT: 3000,
      DEBUG: false,
      DATABASE_URL: "https://db.example.com",
      API_KEY: "abcd"
    });
  });

  it("collects generated errors", async () => {
    const schema = defineEnv({
      PORT: int({ min: 1, max: 65535 }),
      API_KEY: str({ min: 8 })
    });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "bad.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.throws(() => loadEnv({ PORT: "0", API_KEY: "x" }), /PORT must be >= 1[\s\S]*API_KEY/);
  });

  it("emits declaration output", () => {
    const schema = defineEnv({ PORT: int(), NODE_ENV: oneOf(["test", "production"]), IDS: list(int()), "BAD-NAME": str() });
    const dts = generateTypes(schema);
    assert.match(dts, /readonly PORT: number/);
    assert.match(dts, /"test" \| "production"/);
    assert.match(dts, /readonly IDS: readonly number\[\]/);
    assert.match(dts, /readonly "BAD-NAME": string/);
  });

  it("exports JSON Schema for ecosystem tooling", () => {
    const schema = defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"], { default: "development", desc: "Runtime mode" }),
      PORT: int({ min: 1, max: 65535, strict: true, devDefault: 3000 }),
      DATABASE_URL: url({ protocols: ["postgres"] }),
      FEATURE_FLAGS: list(str({ min: 1 }), { default: [], separator: "," }),
      SESSION_SECRET: str({ optional: true, min: 32, requiredWhen: (env) => env.NODE_ENV === "production" }),
      RATE_LIMIT_JSON: json({ optional: true })
    });

    assert.deepEqual(generateJsonSchema(schema, { title: "Orders API env" }), {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      title: "Orders API env",
      properties: {
        NODE_ENV: {
          enum: ["development", "test", "production"],
          description: "Runtime mode",
          default: "development"
        },
        PORT: {
          type: "integer",
          minimum: 1,
          maximum: 65535,
          "x-celery-strict": true,
          "x-celery-devDefault": 3000
        },
        DATABASE_URL: {
          type: "string",
          format: "uri",
          "x-celery-protocols": ["postgres"]
        },
        FEATURE_FLAGS: {
          type: "array",
          items: {
            type: "string",
            minLength: 1
          },
          default: []
        },
        SESSION_SECRET: {
          type: "string",
          minLength: 32,
          "x-celery-optional": true,
          "x-celery-requiredWhen": true
        },
        RATE_LIMIT_JSON: {
          "x-celery-optional": true
        }
      },
      required: ["DATABASE_URL"]
    });
  });

  it("validates generated list items", async () => {
    const schema = defineEnv({ IDS: list(int({ min: 1 })) });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "1,2,3" }), { IDS: [1, 2, 3] });
    assert.deepEqual(loadEnv({ IDS: "1e1,0x10" }), { IDS: [10, 16] });
    assert.throws(() => loadEnv({ IDS: "1,0,3" }), /IDS\[1\] must be >= 1/);
  });

  it("supports generated list items with an empty separator", async () => {
    const schema = defineEnv({ DIGITS: list(int({ min: 1 }), { separator: "" }) });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list-empty-separator.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ DIGITS: "123" }), { DIGITS: [1, 2, 3] });
  });

  it("emits native split for unconstrained generated string lists with an empty separator", async () => {
    const schema = defineEnv({ CHARS: list(str(), { separator: "", trim: false }) });
    const code = generateValidator(schema);
    assert.match(code, /v\.split\(""\)/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "string-list-empty-separator.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ CHARS: "a😀b" }).CHARS, "a😀b".split(""));
  });

  it("emits native split for unconstrained generated string lists with item missing handlers", async () => {
    const schema = defineEnv({ CHARS: list(str({ default: "x", devDefault: "y" }), { separator: "", trim: false }) });
    const code = generateValidator(schema);
    assert.match(code, /v\.split\(""\)/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "string-list-empty-separator-default.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ CHARS: "a😀b" }).CHARS, "a😀b".split(""));
  });

  it("supports generated list items with a multi-character separator", async () => {
    const schema = defineEnv({ IDS: list(int({ min: 1 }), { separator: "::" }) });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list-wide-separator.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "1::2::3" }), { IDS: [1, 2, 3] });
  });

  it("emits an allocation-light generated list scanner for bounded strict ints", async () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: -5, max: 100 })) });
    const code = generateValidator(schema);
    assert.doesNotMatch(code, /\.slice\(/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list-fast-paths.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({
      IDS: " +1, -5 ,42"
    }), {
      IDS: [1, -5, 42]
    });
    assert.throws(() => loadEnv({ IDS: "1e3,101,x" }), (error) => {
      assert.match(error.message, /IDS\[0\] must be a strict integer/);
      assert.match(error.message, /IDS\[1\] must be <= 100/);
      assert.match(error.message, /IDS\[2\] must be a strict integer/);
      return true;
    });
  });

  it("returns a terminal object literal from generated validators", () => {
    const schema = defineEnv({
      PORT: int({ default: 3000 }),
      "BAD-NAME": str({ default: "ok" })
    });
    const code = generateValidator(schema);
    assert.doesNotMatch(code, /const o = \{\}/);
    assert.doesNotMatch(code, /o\./);
    assert.match(code, /let _0, _1;/);
    assert.match(code, /return \{ PORT: _0, "BAD-NAME": _1 \};/);
  });

  it("omits redundant optional missing assignments for local generated targets", async () => {
    const schema = defineEnv({ OPTIONAL_KEY: str({ optional: true }) });
    const code = generateValidator(schema);
    assert.doesNotMatch(code, /_0 = undefined/);
    assert.match(code, /if \(v != null && v !== ""\)/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "optional-local.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const out = loadEnv({});
    assert.deepEqual(out, { OPTIONAL_KEY: undefined });
    assert.equal(Object.hasOwn(out, "OPTIONAL_KEY"), true);
  });

  it("splits large generated validators without chunk result objects", async () => {
    const schema = defineEnv({
      K0: str({ min: 1 }),
      K1: int({ min: 1, max: 100 }),
      K2: bool(),
      K3: oneOf(["on", "off"]),
      K4: num({ strict: true, min: 0 }),
      K5: str({ default: "fallback" })
    });
    const code = generateValidator(schema, { splitLargeThreshold: 4, optimize: "speed" });
    assert.match(code, /function _c0\(env, a, r\)/);
    assert.match(code, /const a = new Array\(6\);/);
    assert.match(code, /return \{ K0: a\[0\]/);
    assert.doesNotMatch(code, /const c\d/);
    assert.doesNotMatch(code.slice(0, code.indexOf("export function")), /return \{/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "split-large.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ K0: "x", K1: "2", K2: "yes", K3: "off", K4: ".5" }), {
      K0: "x",
      K1: 2,
      K2: true,
      K3: "off",
      K4: 0.5,
      K5: "fallback"
    });
    assert.throws(() => loadEnv({ K0: "", K1: "0", K2: "maybe", K3: "bad", K4: "1e3" }), (error) => {
      assert.match(error.message, /K0 is required/);
      assert.match(error.message, /K1 must be >= 1/);
      assert.match(error.message, /K2 must be a boolean/);
      assert.match(error.message, /K3 must be one of on, off/);
      assert.match(error.message, /K4 must be a strict number/);
      return true;
    });
  });

  it("omits redundant optional missing assignments for split generated targets", async () => {
    const schema = defineEnv({
      K0: str({ optional: true }),
      K1: str({ optional: true }),
      K2: str({ optional: true }),
      K3: str({ optional: true })
    });
    const code = generateValidator(schema, { splitLargeThreshold: 2 });
    assert.doesNotMatch(code, /a\[\d\] = undefined/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "optional-split.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const out = loadEnv({});
    assert.deepEqual(out, { K0: undefined, K1: undefined, K2: undefined, K3: undefined });
    assert.equal(Object.hasOwn(out, "K0"), true);
  });

  it("omits redundant optional requiredWhen assignments only for local and split targets", async () => {
    const requiredWhen = (env) => env.FEATURE === "on";
    const localCode = generateValidator(defineEnv({
      FEATURE: str({ optional: true }),
      GATED: str({ optional: true, requiredWhen })
    }));
    assert.doesNotMatch(localCode, /else _1 = undefined/);

    const splitCode = generateValidator(defineEnv({
      FEATURE: str({ optional: true }),
      A: str({ optional: true, requiredWhen }),
      B: str({ optional: true, requiredWhen }),
      C: str({ optional: true, requiredWhen })
    }), { splitLargeThreshold: 2 });
    assert.doesNotMatch(splitCode, /else a\[\d\] = undefined/);

    const objectShape = {};
    for (let i = 0; i < 128; i++) {
      objectShape[`O_${i}`] = str({ optional: true, requiredWhen });
    }
    const objectCode = generateValidator(defineEnv(objectShape));
    assert.match(objectCode, /else o\.O_0 = undefined/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "optional-required-when.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, localCode, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    const out = loadEnv({ FEATURE: "off" });
    assert.deepEqual(out, { FEATURE: "off", GATED: undefined });
    assert.equal(Object.hasOwn(out, "GATED"), true);
    assert.throws(() => loadEnv({ FEATURE: "on" }), /GATED is required/);
  });

  it("uses direct object assignment for medium generated validators", async () => {
    const shape = {};
    const env = {};
    for (let i = 0; i < 128; i++) {
      shape[`K_${i}`] = str({ min: 1 });
      env[`K_${i}`] = `v${i}`;
    }
    const schema = defineEnv(shape);
    const code = generateValidator(schema);
    assert.match(code, /const o = \{\};/);
    assert.doesNotMatch(code, /let _0/);
    assert.match(code, /o\.K_0 = v/);
    assert.match(code, /return o;/);
    const optionalCode = generateValidator(defineEnv(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`O_${i}`, str({ optional: true })]))));
    assert.match(optionalCode, /o\.O_0 = undefined/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "object-mode.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv(env), Object.fromEntries(Object.keys(env).map((key) => [key, env[key]])));
    assert.throws(() => loadEnv({ ...env, K_3: "" }), /K_3 is required/);
  });

  it("uses direct object assignment at the default split boundary", () => {
    const shape = {};
    for (let i = 0; i < 512; i++) shape[`K_${i}`] = str({ min: 1 });
    const code = generateValidator(defineEnv(shape));
    assert.match(code, /const o = \{\};/);
    assert.doesNotMatch(code, /const a = new Array/);
    assert.match(code, /return o;/);
  });

  it("emits compact boolean checks", () => {
    const schema = defineEnv({
      DEBUG: bool(),
      MODE: oneOf(["on", "off", "production"])
    });
    const code = generateValidator(schema);
    assert.match(code, /v==="true"\|\|v==="1"/);
    assert.match(code, /else if \(v==="false"\|\|v==="0"/);
    assert.match(code, /v === "production"/);
  });

  it("rejects nested list generation instead of emitting broken output", () => {
    const schema = defineEnv({ NESTED: list(list(int())) });
    assert.throws(() => generateValidator(schema), /NESTED: nested list generation is not supported/);
    assert.throws(() => generateTypes(schema), /NESTED: nested list generation is not supported/);
  });

  it("rejects invalid defaults at generation time", () => {
    assert.throws(
      () => generateValidator(defineEnv({ PORT: int({ min: 1, default: 0 }) })),
      /PORT: default does not satisfy validator/
    );
    assert.throws(
      () => generateTypes(defineEnv({ IDS: list(int({ min: 1 }), { default: [1, 0] }) })),
      /IDS: default does not satisfy validator/
    );
  });

  it("rejects malformed spec options at generation time", () => {
    const badMin = int();
    badMin.min = Infinity;
    assert.throws(() => generateValidator({ PORT: badMin }), /PORT: min must be a finite number/);

    const badList = list(str());
    badList.item = {};
    assert.throws(() => generateValidator({ IDS: badList }), /IDS: list item is not a celery-env spec/);

    const badUrl = url({ protocols: ["https"] });
    badUrl.ps = [];
    assert.throws(() => generateValidator({ ORIGIN: badUrl }), /ORIGIN: malformed URL protocol spec/);
  });

  it("can omit process.env default for edge-style generated validators", () => {
    const schema = defineEnv({ PORT: int({ default: 3000 }) });
    const code = generateValidator(schema, { processDefault: false });
    const dts = generateTypes(schema, { processDefault: false });
    assert.match(code, /function loadEnv\(env\)/);
    assert.doesNotMatch(code, /process\.env/);
    assert.match(dts, /function loadEnv\(env: Record<string, string \| undefined>\)/);
  });

  it("emits strict numeric parsing only when requested", async () => {
    const schema = defineEnv({
      PORT: int({ strict: true, min: 1 }),
      RATE: num({ strict: true }),
      RATIO: int({ strict: true, default: 2 })
    });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "strict.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ PORT: "42", RATE: ".5", RATIO: "" }), { PORT: 42, RATE: 0.5, RATIO: 2 });
    assert.throws(() => loadEnv({ PORT: "0x10", RATE: "1" }), /PORT must be a strict integer/);
    assert.throws(() => loadEnv({ PORT: "1e3", RATE: "1" }), /PORT must be a strict integer/);
    assert.throws(() => loadEnv({ PORT: "1", RATE: "1e3" }), /RATE must be a strict number/);
    assert.throws(() => loadEnv({ PORT: "   ", RATE: "1" }), /PORT must be a strict integer/);
  });

  it("emits strict integer scalar scanners for bounded int32 rules", async () => {
    const schema = defineEnv({
      PORT: int({ strict: true, min: 1, max: 65535 }),
      FALLBACK: int({ strict: true, min: 1 })
    });
    const code = generateValidator(schema);
    assert.match(code, /charCodeAt/);
    assert.match(code, /Number\.isInteger\(v\)/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "bounded-strict-int.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ PORT: "+42", FALLBACK: "2147483648" }), {
      PORT: 42,
      FALLBACK: 2147483648
    });
    assert.throws(() => loadEnv({ PORT: "1e3", FALLBACK: "1" }), /PORT must be a strict integer/);
  });

  it("emits strict number scalar scanners in speed mode", async () => {
    const schema = defineEnv({ RATE: num({ strict: true, min: 0, max: 10 }) });
    const code = generateValidator(schema);
    const speedCode = generateValidator(schema, { optimize: "speed" });
    assert.ok(code.includes("/^[+-]?"));
    assert.doesNotMatch(speedCode, /\^\[\\\+\\-\]\?/);
    assert.match(speedCode, /charCodeAt/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "strict-num-speed.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, speedCode, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ RATE: ".5" }), { RATE: 0.5 });
    assert.deepEqual(loadEnv({ RATE: "1." }), { RATE: 1 });
    assert.deepEqual(loadEnv({ RATE: "+1.25" }), { RATE: 1.25 });
    assert.deepEqual(loadEnv({ RATE: "+.5" }), { RATE: 0.5 });
    assert.deepEqual(loadEnv({ RATE: "000.000" }), { RATE: 0 });
    for (const value of [".", "+", "-", "+.", "-.", "1e0", "1..2", "1.2.3", "0x10", "Infinity", "NaN", " 1", "1 "]) {
      assert.throws(() => loadEnv({ RATE: value }), /RATE must be a strict number/);
    }
    assert.throws(() => loadEnv({ RATE: "9".repeat(400) }), /RATE must be a number/);
    assert.throws(() => loadEnv({ RATE: "11" }), /RATE must be <= 10/);
  });

  it("emits strict integer scanners for generic bounded list items", async () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100, default: 1 })) });
    const code = generateValidator(schema);
    assert.match(code, /charCodeAt/);
    assert.doesNotMatch(code, /\^\[\\\+\\-\]\?\\d\+\$/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "generic-list-strict-int.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "1,2,3" }), { IDS: [1, 2, 3] });
    assert.throws(() => loadEnv({ IDS: "1e3,101,x" }), (error) => {
      assert.match(error.message, /IDS\[0\] must be a strict integer/);
      assert.match(error.message, /IDS\[1\] must be <= 100/);
      assert.match(error.message, /IDS\[2\] must be a strict integer/);
      return true;
    });
  });

  it("honors generated list item defaults for empty slots", async () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100, default: 1 })) });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list-item-defaults.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "2,,3" }), { IDS: [2, 1, 3] });
  });

  it("omits redundant generated min checks after string list item missing handlers", async () => {
    const schema = defineEnv({
      WORDS: list(str({ min: 1, default: "fallback" })),
      MAYBE: list(str({ min: 1, optional: true })),
      HOST: str({ min: 1, includes: ".example" }),
      ORIGINS: list(str({ min: 1, includes: ".example" }))
    });
    const code = generateValidator(schema);
    assert.doesNotMatch(code, /WORDS item must have length >= 1/);
    assert.doesNotMatch(code, /MAYBE item must have length >= 1/);
    assert.doesNotMatch(code, /HOST must have length >= 1/);
    assert.doesNotMatch(code, /ORIGINS\[0\] must have length >= 1/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "string-list-item-defaults.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({
      WORDS: "alpha,,beta",
      MAYBE: "a,,b",
      HOST: "api.example",
      ORIGINS: "a.example,b.example"
    }), {
      WORDS: ["alpha", "fallback", "beta"],
      MAYBE: ["a", undefined, "b"],
      HOST: "api.example",
      ORIGINS: ["a.example", "b.example"]
    });
  });

  it("honors generated list item optionals for empty strict-int slots", async () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100, optional: true })) });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "list-item-optionals.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "2,,3" }), { IDS: [2, undefined, 3] });
  });

  it("emits generated string list scanners without changing enum list semantics", async () => {
    const schema = defineEnv({
      ORIGINS: list(str({ startsWith: "https://", includes: ".example" })),
      MODES: list(oneOf(["alpha", "beta", "release", "staging", "preview", "production", "test", "dev"]))
    });
    const code = generateValidator(schema);
    const speedCode = generateValidator(schema, { optimize: "speed" });
    assert.equal(code, speedCode);
    assert.doesNotMatch(code.slice(0, code.indexOf("\"MODES\"")), /x = e < 0 \? v\.slice/);
    assert.match(code, /v\.startsWith/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "speed-list.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({
      ORIGINS: " https://a.example.com,https://b.example.com ",
      MODES: "alpha, release,beta"
    }), {
      ORIGINS: ["https://a.example.com", "https://b.example.com"],
      MODES: ["alpha", "release", "beta"]
    });
    assert.throws(() => loadEnv({
      ORIGINS: "https://a.invalid.com",
      MODES: "alpha"
    }), /ORIGINS\[0\] must include \.example/);
    assert.throws(() => loadEnv({
      ORIGINS: "https://a.example.com",
      MODES: "alpha,gamma"
    }), /MODES\[1\] must be one of alpha, beta, release, staging, preview, production, test, dev/);
  });

  it("uses generated Set lookup for large string enum lists", async () => {
    const values = Array.from({ length: 32 }, (_, i) => `mode_${i}`);
    const schema = defineEnv({
      MODE: list(oneOf(values)),
      SMALL: list(oneOf(["a", "b", "c"]))
    });
    const code = generateValidator(schema);
    assert.match(code, /const S\d+=new Set/);
    assert.match(code, /S\d+\.has/);
    assert.doesNotMatch(code.slice(code.indexOf("v = env.SMALL")), /new Set/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "large-enum-list.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ MODE: "mode_31, mode_0", SMALL: "a,b" }), {
      MODE: ["mode_31", "mode_0"],
      SMALL: ["a", "b"]
    });
    assert.throws(() => loadEnv({ MODE: "mode_31,bad", SMALL: "a" }), /MODE\[1\] must be one of mode_0/);
  });

  it("uses generated int32 checks only when explicit bounds make them safe", async () => {
    const schema = defineEnv({
      UNBOUNDED: int(),
      MIN_ONLY: int({ min: 1 }),
      BOUNDED: int({ min: 1, max: 100 })
    });
    const code = generateValidator(schema);
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "int32-bounds.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ UNBOUNDED: "2147483648", MIN_ONLY: "2147483648", BOUNDED: "100" }), {
      UNBOUNDED: 2147483648,
      MIN_ONLY: 2147483648,
      BOUNDED: 100
    });
    assert.match(code, /Number\.isInteger\(v\)/);
    assert.match(code, /\(v \| 0\) !== v/);
  });

  it("can emit minified generated validators", async () => {
    const schema = defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
      PORT: int({ min: 1, max: 65535 }),
      DEBUG: bool(),
      IDS: list(int({ min: 1 }))
    });
    const readable = generateValidator(schema);
    const minified = generateValidator(schema, { minify: true });
    assert.ok(minified.length < readable.length * 0.9, `${minified.length} should be < 90% of ${readable.length}`);
    assert.doesNotMatch(minified, /Generated by celery-env/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "min.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, minified, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ PORT: "3000", DEBUG: "false", IDS: "1,2,3" }), {
      NODE_ENV: "development",
      PORT: 3000,
      DEBUG: false,
      IDS: [1, 2, 3]
    });
  });

  it("preserves string literals in minified validators", async () => {
    const schema = defineEnv({
      WORD: oneOf(["out", "errors"], { default: "out" }),
      LABEL: str({ default: "errors" })
    });
    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "min-literals.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema, { minify: true }), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({}), { WORD: "out", LABEL: "errors" });
    assert.deepEqual(loadEnv({ WORD: "errors", LABEL: "out" }), { WORD: "errors", LABEL: "out" });
  });

  it("can emit fail-fast generated validators", async () => {
    const schema = defineEnv({
      PORT: int({ min: 1, max: 65535 }),
      API_KEY: str({ min: 8 })
    });
    const code = generateValidator(schema, { failFast: true });
    assert.doesNotMatch(code, /let r/);
    assert.match(code, /function R/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "fail-fast.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ PORT: "3000", API_KEY: "abcdefgh" }), { PORT: 3000, API_KEY: "abcdefgh" });
    assert.throws(
      () => loadEnv({ PORT: "0", API_KEY: "x" }),
      (error) => {
        assert.equal(error.name, "EnvError");
        assert.deepEqual(error.errors, ["PORT must be >= 1"]);
        assert.match(error.message, /Invalid environment:\n- PORT must be >= 1/);
        assert.doesNotMatch(error.message, /API_KEY/);
        return true;
      }
    );
  });

  it("omits aggregate list sentinels from fail-fast generated lists", async () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100 })) });
    const code = generateValidator(schema, { failFast: true });
    assert.doesNotMatch(code, /r\?\./);
    assert.doesNotMatch(code, /const b/);

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "fail-fast-list.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, code, "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ IDS: "1,2,3" }), { IDS: [1, 2, 3] });
    assert.throws(() => loadEnv({ IDS: "1,x,3" }), /IDS\[1\] must be a strict integer/);
  });

  it("emits env-specific defaults and requiredWhen predicates", async () => {
    const schema = defineEnv({
      MODE: str({
        optional: true,
        default: "base",
        devDefault: "dev",
        testDefault: "test",
        desc: "mode",
        example: "dev",
        docs: "https://example.com"
      }),
      SECRET: str({ optional: true, requiredWhen: (env) => env.NODE_ENV === "production" })
    });

    const dir = join(tmpdir(), `celery-env-${process.pid}`);
    const file = join(dir, "env-defaults.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(file, generateValidator(schema, { processDefault: false }), "utf8");

    const { loadEnv } = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    assert.deepEqual(loadEnv({ NODE_ENV: "test" }), { MODE: "test", SECRET: undefined });
    assert.deepEqual(loadEnv({ NODE_ENV: "development" }), { MODE: "dev", SECRET: undefined });
    assert.throws(() => loadEnv({ NODE_ENV: "production" }), /SECRET is required/);
    assert.deepEqual(loadEnv({ NODE_ENV: "production", SECRET: "x" }), { MODE: "base", SECRET: "x" });
  });

  it("validates env-specific defaults at generation time", () => {
    assert.throws(
      () => generateValidator(defineEnv({ PORT: int({ min: 1, devDefault: 0 }) })),
      /PORT: devDefault does not satisfy validator/
    );
    assert.throws(
      () => generateValidator(defineEnv({ PORT: int({ min: 1, testDefault: 0 }) })),
      /PORT: testDefault does not satisfy validator/
    );
  });

  it("emits .env.example content from schema metadata", () => {
    const schema = defineEnv({
      DATABASE_URL: str({
        min: 1,
        desc: "Primary database.",
        docs: "https://example.com/env",
        example: "postgres://user:pass@localhost:5432/app"
      }),
      PORT: int({ default: 3000, min: 1, max: 65535 }),
      MODE: str({ optional: true, devDefault: "dev", testDefault: "test" }),
      IDS: list(int(), { example: [1, 2, 3] })
    });

    assert.equal(generateExample(schema), [
      "# Primary database.",
      "# Docs: https://example.com/env",
      "DATABASE_URL=postgres://user:pass@localhost:5432/app",
      "",
      "PORT=3000",
      "",
      "# Optional",
      "# Development default: dev",
      "# Test default: test",
      "MODE=dev",
      "",
      "IDS=1,2,3",
      ""
    ].join("\n"));
  });

  it("supports explicit CLI generate, example output, and init", async () => {
    const dir = join(tmpdir(), `celery-env-cli-${process.pid}-${Date.now()}`);
    const schema = join(dir, "env.schema.mjs");
    const out = join(dir, "env.mjs");
    const types = join(dir, "env.d.ts");
    const example = join(dir, ".env.example");
    await mkdir(dir, { recursive: true });
    await writeFile(schema, `
      import { defineEnv, int, str } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/index.js")).href)};
      export default defineEnv({
        DATABASE_URL: str({ min: 1, example: "postgres://localhost/app" }),
        PORT: int({ default: 3000 })
      });
    `, "utf8");

    const generated = spawnSync(process.execPath, [
      "src/cli.js",
      "generate",
      "--schema", schema,
      "--out", out,
      "--types", types,
      "--example", example,
      "--no-process-default",
      "--optimize", "speed"
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);

    const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
    assert.deepEqual(mod.loadEnv({ DATABASE_URL: "postgres://localhost/app" }), {
      DATABASE_URL: "postgres://localhost/app",
      PORT: 3000
    });
    assert.match(await readFile(types, "utf8"), /DATABASE_URL/);
    assert.match(await readFile(example, "utf8"), /DATABASE_URL=postgres:\/\/localhost\/app/);

    const initSchema = join(dir, "next.schema.mjs");
    const initialized = spawnSync(process.execPath, [
      "src/cli.js",
      "init",
      "--target", "next",
      "--schema", initSchema
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.match(await readFile(initSchema, "utf8"), /NEXT_PUBLIC_API_URL/);
  });

  it("requires --force for CLI generate overwrites and refuses symlink outputs", async () => {
    const dir = join(tmpdir(), `celery-env-cli-secure-${process.pid}-${Date.now()}`);
    const schema = join(dir, "env.schema.mjs");
    const out = join(dir, "env.mjs");
    const link = join(dir, "link.mjs");
    const target = join(dir, "target.mjs");
    await mkdir(dir, { recursive: true });
    await writeFile(schema, `
      import { defineEnv, str } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/index.js")).href)};
      export default defineEnv({ VALUE: str() });
    `, "utf8");
    await writeFile(out, "existing", "utf8");
    await writeFile(target, "target", "utf8");
    await symlink(target, link);

    const blocked = spawnSync(process.execPath, [
      "src/cli.js",
      "generate",
      "--schema", schema,
      "--out", out
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /already exists/);
    assert.equal(await readFile(out, "utf8"), "existing");

    const forced = spawnSync(process.execPath, [
      "src/cli.js",
      "generate",
      "--schema", schema,
      "--out", out,
      "--force"
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(await readFile(out, "utf8"), /export function loadEnv/);

    const symlinked = spawnSync(process.execPath, [
      "src/cli.js",
      "generate",
      "--schema", schema,
      "--out", link,
      "--force"
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(symlinked.status, 0);
    assert.match(symlinked.stderr, /symlink/);
    assert.equal(await readFile(target, "utf8"), "target");
  });

});
