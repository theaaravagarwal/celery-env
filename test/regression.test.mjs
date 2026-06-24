import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { bool, defineEnv, EnvError, int, json, list, num, oneOf, parseEnv, str, url } from "../src/index.js";
import { generateExample, generateTypes, generateValidator } from "../src/compiler.js";

describe("parseEnv regression matrix", () => {
  const accepted = [
    ["str basic", str(), "hello", "hello"],
    ["str min boundary", str({ min: 3 }), "abc", "abc"],
    ["str max boundary", str({ max: 3 }), "abc", "abc"],
    ["str startsWith", str({ startsWith: "pg://" }), "pg://db", "pg://db"],
    ["str includes", str({ includes: "token" }), "has-token-value", "has-token-value"],
    ["str optional missing", str({ optional: true }), undefined, undefined],
    ["str default missing", str({ default: "fallback" }), undefined, "fallback"],
    ["int decimal", int(), "42", 42],
    ["int signed", int(), "-7", -7],
    ["int hex non-strict", int(), "0x10", 16],
    ["int min boundary", int({ min: 5 }), "5", 5],
    ["int max boundary", int({ max: 5 }), "5", 5],
    ["int strict plus", int({ strict: true }), "+5", 5],
    ["int strict negative", int({ strict: true }), "-5", -5],
    ["num decimal", num(), "1.25", 1.25],
    ["num dot", num({ strict: true }), ".25", 0.25],
    ["num trailing dot", num({ strict: true }), "1.", 1],
    ["num signed dot", num({ strict: true }), "+.25", 0.25],
    ["num min max", num({ min: -1, max: 1 }), "0.5", 0.5],
    ["bool true text", bool(), "true", true],
    ["bool one", bool(), "1", true],
    ["bool yes", bool(), "yes", true],
    ["bool on", bool(), "on", true],
    ["bool false text", bool(), "false", false],
    ["bool zero", bool(), "0", false],
    ["bool no", bool(), "no", false],
    ["bool off", bool(), "off", false],
    ["string enum", oneOf(["dev", "prod"]), "prod", "prod"],
    ["mixed enum number", oneOf([1, 2, "three"]), "2", 2],
    ["mixed enum boolean", oneOf([true, false, "auto"]), "true", true],
    ["url any protocol", url(), "redis://localhost:6379", "redis://localhost:6379"],
    ["url allowed protocol", url({ protocols: ["https", "postgres"] }), "postgres://db", "postgres://db"],
    ["json object", json(), "{\"a\":1}", { a: 1 }],
    ["json array", json(), "[1,2,3]", [1, 2, 3]],
    ["json null", json(), "null", null],
    ["json whitespace object", json(), " {\"a\":1} ", { a: 1 }]
  ];

  for (const [name, rule, input, expected] of accepted) {
    it(`accepts ${name}`, () => {
      const schema = defineEnv({ VALUE: rule });
      const env = input === undefined ? {} : { VALUE: input };
      assert.deepEqual(parseEnv(schema, env), { VALUE: expected });
    });
  }

  const rejected = [
    ["required missing", str(), {}, ["VALUE is required"]],
    ["str min", str({ min: 3 }), { VALUE: "ab" }, ["VALUE must have length >= 3"]],
    ["str max", str({ max: 3 }), { VALUE: "abcd" }, ["VALUE must have length <= 3"]],
    ["str startsWith", str({ startsWith: "pg://" }), { VALUE: "mysql://db" }, ["VALUE must start with pg://"]],
    ["str includes", str({ includes: "token" }), { VALUE: "missing" }, ["VALUE must include token"]],
    ["int invalid", int(), { VALUE: "abc" }, ["VALUE must be an integer"]],
    ["int fractional", int(), { VALUE: "1.5" }, ["VALUE must be an integer"]],
    ["int min", int({ min: 3 }), { VALUE: "2" }, ["VALUE must be >= 3"]],
    ["int max", int({ max: 3 }), { VALUE: "4" }, ["VALUE must be <= 3"]],
    ["strict int exponent", int({ strict: true }), { VALUE: "1e3" }, ["VALUE must be a strict integer"]],
    ["strict int hex", int({ strict: true }), { VALUE: "0x10" }, ["VALUE must be a strict integer"]],
    ["strict int sign only", int({ strict: true }), { VALUE: "+" }, ["VALUE must be a strict integer"]],
    ["num invalid", num(), { VALUE: "abc" }, ["VALUE must be a number"]],
    ["strict num exponent", num({ strict: true }), { VALUE: "1e3" }, ["VALUE must be a strict number"]],
    ["strict num dot only", num({ strict: true }), { VALUE: "." }, ["VALUE must be a strict number"]],
    ["strict num sign dot", num({ strict: true }), { VALUE: "+." }, ["VALUE must be a strict number"]],
    ["bool invalid", bool(), { VALUE: "maybe" }, ["VALUE must be a boolean"]],
    ["enum invalid", oneOf(["a", "b"]), { VALUE: "c" }, ["VALUE must be one of a, b"]],
    ["url invalid", url(), { VALUE: "nope" }, ["VALUE must be a URL"]],
    ["url protocol invalid", url({ protocols: ["https"] }), { VALUE: "http://x.test" }, ["VALUE must use protocol https"]],
    ["json invalid", json(), { VALUE: "{" }, ["VALUE must be valid JSON"]]
  ];

  for (const [name, rule, env, errors] of rejected) {
    it(`rejects ${name}`, () => {
      assert.throws(
        () => parseEnv(defineEnv({ VALUE: rule }), env),
        (error) => {
          assert.equal(error instanceof EnvError, true);
          assert.deepEqual(error.errors, errors);
          return true;
        }
      );
    });
  }

  const listAccepted = [
    ["strings trimmed", list(str({ min: 1 })), " a, b ,c ", ["a", "b", "c"]],
    ["strings trim false", list(str({ min: 2 }), { trim: false }), " a, b ", [" a", " b "]],
    ["strings empty separator", list(str(), { separator: "", trim: false }), "a😀b", "a😀b".split("")],
    ["string defaults", list(str({ default: "x" })), "a,,c", ["a", "x", "c"]],
    ["string optionals", list(str({ optional: true })), "a,,c", ["a", undefined, "c"]],
    ["ints", list(int({ min: 1 })), "1,2,3", [1, 2, 3]],
    ["ints wide separator", list(int(), { separator: "::" }), "1::2::3", [1, 2, 3]],
    ["strict ints", list(int({ strict: true, min: -5, max: 5 })), "-5,0,+5", [-5, 0, 5]],
    ["strict int defaults", list(int({ strict: true, min: 1, max: 9, default: 7 })), "1,,9", [1, 7, 9]],
    ["strict nums", list(num({ strict: true, min: 0, max: 2 })), ".5,1.,+1.5", [0.5, 1, 1.5]],
    ["strict num optionals", list(num({ strict: true, optional: true })), ".5,,1.", [0.5, undefined, 1]],
    ["bools", list(bool()), "true,0,yes,off", [true, false, true, false]],
    ["bool defaults", list(bool({ default: true })), "false,,true", [false, true, true]],
    ["enums", list(oneOf(["alpha", "beta", "release"])), "alpha,beta,release", ["alpha", "beta", "release"]],
    ["enum defaults", list(oneOf(["alpha", "beta"], { default: "alpha" })), "beta,,alpha", ["beta", "alpha", "alpha"]],
    ["mixed enums", list(oneOf([1, false, "auto"])), "1,false,auto", [1, false, "auto"]],
    ["urls", list(url({ protocols: ["https"] })), "https://a.test,https://b.test", ["https://a.test", "https://b.test"]],
    ["json list generic", list(json()), "{\"a\":1},[2]", [{ a: 1 }, [2]]]
  ];

  for (const [name, rule, input, expected] of listAccepted) {
    it(`accepts list ${name}`, () => {
      assert.deepEqual(parseEnv(defineEnv({ VALUE: rule }), { VALUE: input }), { VALUE: expected });
    });
  }

  const listRejected = [
    ["strings empty", list(str()), ",a", ["VALUE[0] is required"]],
    ["strings min", list(str({ min: 2 })), "ok,x", ["VALUE[1] must have length >= 2"]],
    ["strings startsWith", list(str({ startsWith: "a" })), "a,b", ["VALUE[1] must start with a"]],
    ["strings includes", list(str({ includes: "z" })), "az,aa", ["VALUE[1] must include z"]],
    ["ints min", list(int({ min: 1 })), "1,0,x", ["VALUE[1] must be >= 1", "VALUE[2] must be an integer"]],
    ["strict ints", list(int({ strict: true, min: 1, max: 9 })), "1,1e1,10", ["VALUE[1] must be a strict integer", "VALUE[2] must be <= 9"]],
    ["strict nums", list(num({ strict: true, min: 0, max: 2 })), ".5,1e1,3", ["VALUE[1] must be a strict number", "VALUE[2] must be <= 2"]],
    ["bools", list(bool()), "true,maybe,false", ["VALUE[1] must be a boolean"]],
    ["enums", list(oneOf(["a", "b"])), "a,c,b", ["VALUE[1] must be one of a, b"]],
    ["urls", list(url({ protocols: ["https"] })), "https://a.test,http://b.test,nope", ["VALUE[1] must use protocol https", "VALUE[2] must be a URL"]],
    ["json", list(json()), "{\"ok\":true},{", ["VALUE[1] must be valid JSON"]]
  ];

  for (const [name, rule, input, errors] of listRejected) {
    it(`rejects list ${name}`, () => {
      assert.throws(
        () => parseEnv(defineEnv({ VALUE: rule }), { VALUE: input }),
        (error) => {
          assert.equal(error instanceof EnvError, true);
          assert.deepEqual(error.errors, errors);
          return true;
        }
      );
    });
  }
});

describe("generated validator regression matrix", () => {
  const parityCases = [
    ["scalar string", { VALUE: str({ min: 2, max: 4 }) }, { VALUE: "abc" }],
    ["scalar int", { VALUE: int({ min: -10, max: 10 }) }, { VALUE: "-3" }],
    ["scalar strict int", { VALUE: int({ strict: true, min: -10, max: 10 }) }, { VALUE: "+3" }],
    ["scalar num", { VALUE: num({ min: 0, max: 2 }) }, { VALUE: "1.25" }],
    ["scalar strict num", { VALUE: num({ strict: true, min: 0, max: 2 }) }, { VALUE: ".25" }, { optimize: "speed" }],
    ["scalar bool", { VALUE: bool() }, { VALUE: "off" }],
    ["scalar enum string", { VALUE: oneOf(["dev", "prod"]) }, { VALUE: "prod" }],
    ["scalar enum mixed", { VALUE: oneOf([1, false, "auto"]) }, { VALUE: "false" }],
    ["scalar url", { VALUE: url({ protocols: ["https", "postgres"] }) }, { VALUE: "postgres://db" }],
    ["scalar json", { VALUE: json() }, { VALUE: "{\"ok\":true}" }],
    ["default", { VALUE: str({ default: "fallback" }) }, {}],
    ["optional", { VALUE: str({ optional: true }) }, {}],
    ["dev default", { NODE_ENV: str({ default: "development" }), VALUE: str({ devDefault: "dev" }) }, { NODE_ENV: "development" }],
    ["test default", { NODE_ENV: str({ default: "test" }), VALUE: str({ testDefault: "test" }) }, { NODE_ENV: "test" }],
    ["requiredWhen false", { FEATURE: str({ default: "off" }), VALUE: str({ optional: true, requiredWhen: (env) => env.FEATURE === "on" }) }, { FEATURE: "off" }],
    ["string list", { VALUE: list(str({ min: 1 })) }, { VALUE: " a, b,c " }],
    ["strict int list", { VALUE: list(int({ strict: true, min: 1, max: 9 })) }, { VALUE: "1,+2,9" }],
    ["strict num list", { VALUE: list(num({ strict: true, min: 0, max: 2 })) }, { VALUE: ".5,1.,+1.5" }, { optimize: "speed" }],
    ["bool list", { VALUE: list(bool()) }, { VALUE: "true,0,yes,off" }],
    ["enum list", { VALUE: list(oneOf(["alpha", "beta", "release"])) }, { VALUE: "alpha,beta,release" }],
    ["large enum list", { VALUE: list(oneOf(Array.from({ length: 20 }, (_, i) => `v${i}`))) }, { VALUE: "v0,v9,v19" }],
    ["url list", { VALUE: list(url({ protocols: ["https"] })) }, { VALUE: "https://a.test,https://b.test" }],
    ["empty separator string list", { VALUE: list(str(), { separator: "", trim: false }) }, { VALUE: "a😀b" }],
    ["wide separator int list", { VALUE: list(int(), { separator: "::" }) }, { VALUE: "1::2::3" }],
    ["split validator", splitShape(40), splitEnv(40), { splitLargeThreshold: 16, optimize: "speed" }],
    ["object mode validator", splitShape(128), splitEnv(128)]
  ];

  for (const [name, shape, env, options] of parityCases) {
    it(`matches runtime for ${name}`, async () => {
      const schema = defineEnv(shape);
      const generated = await compile(schema, options);
      assert.deepEqual(generated.loadEnv(env), parseEnv(schema, env));
    });
  }

  const invalidParityCases = [
    ["scalar aggregate", { A: int({ min: 2 }), B: bool(), C: str({ min: 3 }) }, { A: "1", B: "maybe", C: "x" }],
    ["strict numeric aggregate", { A: int({ strict: true }), B: num({ strict: true }) }, { A: "1e3", B: "+." }, { optimize: "speed" }],
    ["json aggregate", { A: json(), B: json(), C: json() }, { A: "{", B: "[", C: "null" }],
    ["url aggregate", { A: url(), B: url({ protocols: ["https"] }) }, { A: "nope", B: "http://x.test" }],
    ["split aggregate", splitShape(40), { ...splitEnv(40), K_0: "", K_1: "0", K_2: "maybe", K_3: "bad" }, { splitLargeThreshold: 16 }]
  ];

  for (const [name, shape, env, options] of invalidParityCases) {
    it(`matches runtime errors for ${name}`, async () => {
      const schema = defineEnv(shape);
      const generated = await compile(schema, options);
      const runtime = captureRuntime(schema, env);
      const standalone = captureGenerated(generated.loadEnv, env);
      assert.deepEqual(standalone, runtime);
    });
  }

  const generatedListErrorCases = [
    ["list aggregate", { A: list(int({ min: 1 })), B: list(bool()) }, { A: "0,x", B: "true,maybe" }, ["A[0] must be >= 1", "A[1] must be an integer", "B[1] must be a boolean"]],
    ["strict int list aggregate", { A: list(int({ strict: true, min: 1, max: 9 })) }, { A: "0,1e1,10" }, ["A[0] must be >= 1", "A[1] must be a strict integer", "A[2] must be <= 9"]],
    ["strict num list aggregate", { A: list(num({ strict: true, min: 0, max: 2 })) }, { A: "-1,1e1,3" }, ["A[0] must be >= 0", "A[1] must be a strict number", "A[2] must be <= 2"], { optimize: "speed" }],
    ["string list aggregate", { A: list(str({ min: 2, startsWith: "a", includes: "z" })) }, { A: ",a,bb,aa" }, ["A[0] must have length >= 2", "A[1] must have length >= 2", "A[2] must start with a", "A[3] must include z"]],
    ["enum list aggregate", { A: list(oneOf(["a", "b"])) }, { A: "a,c,b" }, ["A[1] must be one of a, b"]]
  ];

  for (const [name, shape, env, errors, options] of generatedListErrorCases) {
    it(`collects generated list errors for ${name}`, async () => {
      const generated = await compile(defineEnv(shape), options);
      assert.deepEqual(captureGenerated(generated.loadEnv, env), errors);
    });
  }

  const codeShapeCases = [
    ["minified has no extra whitespace", defineEnv({ A: str({ default: "x" }), B: int({ min: 1 }) }), { minify: true }, (code) => {
      assert.equal(code.includes("\n"), false);
      assert.match(code, /export function loadEnv/);
    }],
    ["no process default", defineEnv({ A: str() }), { processDefault: false }, (code) => {
      assert.match(code, /function loadEnv\(env\)/);
      assert.doesNotMatch(code, /process\.env/);
    }],
    ["custom function name", defineEnv({ A: str() }), { functionName: "readConfig" }, (code) => {
      assert.match(code, /export function readConfig/);
      assert.match(code, /export default readConfig/);
    }],
    ["fail fast throws immediately", defineEnv({ A: str(), B: str() }), { failFast: true }, (code) => {
      assert.match(code, /function R/);
      assert.doesNotMatch(code, /r \?\?=/);
    }],
    ["object mode keeps own optional properties", defineEnv(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`K_${i}`, str({ optional: true })]))), {}, (code) => {
      assert.match(code, /const o = \{\}/);
      assert.match(code, /o\.K_0 = undefined/);
    }],
    ["split mode uses slot array", defineEnv(splitShape(40)), { splitLargeThreshold: 16 }, (code) => {
      assert.match(code, /const a = new Array\(40\)/);
      assert.match(code, /function _c0/);
    }]
  ];

  for (const [name, schema, options, check] of codeShapeCases) {
    it(`emits expected code shape for ${name}`, () => {
      check(generateValidator(schema, options));
    });
  }
});

describe("compiler support output regression matrix", () => {
  const typeCases = [
    ["required string", { VALUE: str() }, /readonly VALUE: string/],
    ["optional string", { VALUE: str({ optional: true }) }, /readonly VALUE: string \| undefined/],
    ["default string", { VALUE: str({ default: "x" }) }, /readonly VALUE: string;/],
    ["number", { VALUE: num() }, /readonly VALUE: number/],
    ["boolean", { VALUE: bool() }, /readonly VALUE: boolean/],
    ["enum", { VALUE: oneOf(["a", "b"]) }, /readonly VALUE: "a" \| "b"/],
    ["list", { VALUE: list(int()) }, /readonly VALUE: readonly number\[\]/],
    ["bad identifier", { "BAD-NAME": str() }, /readonly "BAD-NAME": string/]
  ];

  for (const [name, shape, pattern] of typeCases) {
    it(`generates types for ${name}`, () => {
      assert.match(generateTypes(defineEnv(shape)), pattern);
    });
  }

  const exampleCases = [
    ["default", { VALUE: str({ default: "x" }) }, /VALUE=x/],
    ["dev default", { VALUE: str({ devDefault: "dev" }) }, /# Development default: dev/],
    ["test default", { VALUE: str({ testDefault: "test" }) }, /# Test default: test/],
    ["optional", { VALUE: str({ optional: true }) }, /# Optional/],
    ["docs", { VALUE: str({ docs: "https:\/\/example.com" }) }, /# Docs: https:\/\/example.com/],
    ["description", { VALUE: str({ desc: "hello\nworld" }) }, /# hello\n# world/],
    ["list default", { VALUE: list(int(), { default: [1, 2, 3] }) }, /VALUE=1,2,3/],
    ["json default", { VALUE: json({ default: { a: 1 } }) }, /VALUE=\{"a":1\}/]
  ];

  for (const [name, shape, pattern] of exampleCases) {
    it(`generates examples for ${name}`, () => {
      assert.match(generateExample(defineEnv(shape)), pattern);
    });
  }

  it("rejects nested generated lists", () => {
    assert.throws(() => generateValidator(defineEnv({ VALUE: list(list(str())) })), /nested list/);
  });

  it("rejects native requiredWhen source in generated validators", () => {
    assert.throws(
      () => generateValidator(defineEnv({ VALUE: str({ optional: true, requiredWhen: Array.isArray }) })),
      /source-serializable/
    );
  });

  it("rejects unknown optimize modes", () => {
    assert.throws(() => generateValidator(defineEnv({ VALUE: str() }), { optimize: "turbo" }), /Unknown optimize mode/);
  });
});

async function compile(schema, options) {
  const dir = join(tmpdir(), `celery-env-regression-${process.pid}`);
  const file = join(dir, `case-${compile.next++}.mjs`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, generateValidator(schema, options), "utf8");
  return import(`${pathToFileURL(file).href}?t=${Date.now()}-${compile.next}`);
}
compile.next = 0;

function captureRuntime(schema, env) {
  try {
    parseEnv(schema, env);
  } catch (error) {
    assert.equal(error instanceof EnvError, true);
    return error.errors;
  }
  throw new Error("expected runtime validation to fail");
}

function captureGenerated(loadEnv, env) {
  try {
    loadEnv(env);
  } catch (error) {
    assert.equal(error.name, "EnvError");
    assert.ok(Array.isArray(error.errors));
    return error.errors;
  }
  throw new Error("expected generated validation to fail");
}

function splitShape(count) {
  const shape = {};
  for (let i = 0; i < count; i += 4) {
    shape[`K_${i}`] = str({ min: 1 });
    shape[`K_${i + 1}`] = int({ min: 1, max: 100 });
    shape[`K_${i + 2}`] = bool();
    shape[`K_${i + 3}`] = oneOf(["on", "off"]);
  }
  return shape;
}

function splitEnv(count) {
  const env = {};
  for (let i = 0; i < count; i += 4) {
    env[`K_${i}`] = `v${i}`;
    env[`K_${i + 1}`] = "42";
    env[`K_${i + 2}`] = "true";
    env[`K_${i + 3}`] = "on";
  }
  return env;
}
