import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { defineEnv, int, json, list, parseEnv, str, url } from "../src/index.js";
import { generateExample, generateTypes, generateValidator } from "../src/compiler.js";

describe("security hardening", () => {
  it("does not leak rejected secret values", () => {
    const schema = defineEnv({
      API_KEY: str({ min: 20 }),
      PORT: int({ min: 1 })
    });

    assert.throws(
      () => parseEnv(schema, { API_KEY: "super-secret-token", PORT: "0" }),
      (error) => {
        assert.equal(error.message.includes("super-secret-token"), false);
        assert.deepEqual(error.errors, [
          "API_KEY must have length >= 20",
          "PORT must be >= 1"
        ]);
        return true;
      }
    );
  });

  it("keeps runtime __proto__ schema keys as own data properties", () => {
    const schema = defineEnv(Object.defineProperty({ SAFE: str() }, "__proto__", {
      value: str({ optional: true }),
      enumerable: true
    }));
    const env = Object.defineProperty({ SAFE: "ok" }, "__proto__", {
      value: "owned-proto-value",
      enumerable: true
    });

    const parsed = parseEnv(schema, env);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.equal(Object.hasOwn(parsed, "__proto__"), true);
    assert.equal(parsed.__proto__, "owned-proto-value");
    assert.equal({}.polluted, undefined);
  });

  it("treats inherited runtime __proto__ as missing", () => {
    const schema = defineEnv(Object.defineProperty({}, "__proto__", {
      value: str({ optional: true }),
      enumerable: true
    }));

    const parsed = parseEnv(schema, {});
    assert.equal(Object.hasOwn(parsed, "__proto__"), true);
    assert.equal(parsed.__proto__, undefined);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  });

  it("treats inherited runtime object-prototype keys as missing", () => {
    const schema = defineEnv({
      constructor: str({ optional: true }),
      toString: str({ optional: true })
    });

    assert.deepEqual(parseEnv(schema, {}), {
      constructor: undefined,
      toString: undefined
    });
  });

  it("does not use inherited runtime NODE_ENV for env-specific defaults", () => {
    const schema = defineEnv({ VALUE: str({ testDefault: "test-value", devDefault: "dev-value" }) });
    const env = Object.create({ NODE_ENV: "test" });

    assert.deepEqual(parseEnv(schema, env), { VALUE: "dev-value" });
  });

  it("does not let Object.prototype options change runtime validation", () => {
    try {
      Object.prototype.optional = true;
      Object.prototype.default = "polluted";
      Object.prototype.min = 99;
      Object.prototype.t = 0;

      const schema = defineEnv({ SECRET: str() });
      assert.throws(() => parseEnv(schema, {}), /SECRET is required/);
      assert.deepEqual(parseEnv(defineEnv({ VALUE: str() }), { VALUE: "ok" }), { VALUE: "ok" });
      assert.equal(parseEnv(defineEnv({ VALUE: str() }), { VALUE: "ok" }).VALUE, "ok");
      assert.equal(parseEnv(defineEnv({ VALUE: str({ min: 2 }) }), { VALUE: "ok" }).VALUE, "ok");
      assert.throws(() => defineEnv({ BAD: {} }), /schema entry is not a celery-env spec/);
    } finally {
      delete Object.prototype.optional;
      delete Object.prototype.default;
      delete Object.prototype.min;
      delete Object.prototype.t;
    }
  });

  it("does not use inherited url protocol options", () => {
    try {
      Object.prototype.protocols = ["https"];
      const schema = defineEnv({ ENDPOINT: url({}) });

      assert.deepEqual(parseEnv(schema, { ENDPOINT: "http://example.com" }), {
        ENDPOINT: "http://example.com"
      });
    } finally {
      delete Object.prototype.protocols;
    }
  });

  it("does not use inherited runtime NODE_ENV for requiredWhen", () => {
    const schema = defineEnv({
      SECRET: str({ optional: true, requiredWhen: (env) => env.NODE_ENV === "production" })
    });
    const env = Object.create({ NODE_ENV: "production" });

    assert.deepEqual(parseEnv(schema, env), { SECRET: undefined });
  });

  it("keeps generated __proto__ keys as own data properties", async () => {
    const schema = defineEnv(Object.defineProperty({ SAFE: str() }, "__proto__", {
      value: str(),
      enumerable: true
    }));
    const generated = await compile(schema);
    const env = Object.defineProperty({ SAFE: "ok" }, "__proto__", {
      value: "generated-proto-value",
      enumerable: true
    });

    const parsed = generated.loadEnv(env);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.equal(Object.hasOwn(parsed, "__proto__"), true);
    assert.equal(parsed.__proto__, "generated-proto-value");
    assert.equal({}.polluted, undefined);
  });

  it("treats inherited generated object-prototype keys as missing", async () => {
    const schema = defineEnv({
      constructor: str({ optional: true }),
      toString: str({ optional: true })
    });
    const generated = await compile(schema);

    assert.deepEqual(generated.loadEnv({}), {
      constructor: undefined,
      toString: undefined
    });
  });

  it("does not use inherited generated NODE_ENV for env-specific defaults", async () => {
    const schema = defineEnv({ VALUE: str({ testDefault: "test-value", devDefault: "dev-value" }) });
    const generated = await compile(schema);
    const env = Object.create({ NODE_ENV: "test" });

    assert.deepEqual(generated.loadEnv(env), { VALUE: "dev-value" });
  });

  it("does not use inherited generated NODE_ENV for requiredWhen", async () => {
    const schema = defineEnv({
      SECRET: str({ optional: true, requiredWhen: (env) => env.NODE_ENV === "production" })
    });
    const generated = await compile(schema);
    const env = Object.create({ NODE_ENV: "production" });

    assert.deepEqual(generated.loadEnv(env), { SECRET: undefined });
  });

  it("does not use object-assignment mode for schemas with __proto__ keys", () => {
    const shape = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`K_${i}`, str({ optional: true })]));
    Object.defineProperty(shape, "__proto__", { value: str({ optional: true }), enumerable: true });
    const code = generateValidator(defineEnv(shape));
    assert.doesNotMatch(code, /const o = \{\};/);
    assert.match(code, /\["__proto__"\]/);
  });

  it("escapes hostile schema keys in generated validators", async () => {
    const key = `x"];globalThis.__celeryPwned=1;//`;
    const schema = defineEnv({ [key]: str() });
    const generated = await compile(schema);

    delete globalThis.__celeryPwned;
    assert.deepEqual(generated.loadEnv({ [key]: "safe" }), { [key]: "safe" });
    assert.equal(globalThis.__celeryPwned, undefined);
  });

  it("rejects hostile generated function names", () => {
    const schema = defineEnv({ VALUE: str() });
    assert.throws(
      () => generateValidator(schema, { functionName: "loadEnv;globalThis.__celeryPwned=1;//" }),
      /functionName must be a JavaScript identifier/
    );
    assert.throws(
      () => generateValidator(schema, { functionName: "default" }),
      /functionName must be a JavaScript identifier/
    );
    for (const name of ["package", "interface", "implements", "private", "protected", "public", "static", "eval", "arguments"]) {
      assert.throws(
        () => generateValidator(schema, { functionName: name }),
        /functionName must be a JavaScript identifier/
      );
      assert.throws(
        () => generateTypes(schema, { functionName: name }),
        /functionName must be a JavaScript identifier/
      );
    }
    assert.equal(globalThis.__celeryPwned, undefined);
  });

  it("rejects non-expression requiredWhen functions for generated validators", () => {
    const method = { requiredWhen(env) { return env.NODE_ENV === "production"; } }.requiredWhen;
    const schema = defineEnv({ SECRET: str({ optional: true, requiredWhen: method }) });

    assert.throws(() => generateValidator(schema), /requiredWhen must serialize to a function expression/);
  });

  it("rejects JSON defaults that would not survive generated serialization", () => {
    const invalid = [
      () => 1,
      Symbol("x"),
      new Date("2020-01-01T00:00:00.000Z"),
      NaN,
      Infinity,
      { a: undefined },
      [, "hole"]
    ];

    for (const value of invalid) {
      assert.throws(
        () => generateValidator(defineEnv({ VALUE: json({ default: value }) })),
        /VALUE: default does not satisfy validator/
      );
    }
    assert.throws(
      () => generateValidator(defineEnv({ VALUE: json({ default: 1n }) })),
      /VALUE: default does not satisfy validator/
    );
    assert.doesNotThrow(() => generateValidator(defineEnv({
      VALUE: json({ default: { ok: true, list: [1, "x", null] } })
    })));
  });

  it("does not bypass object-mode generated json validation through inherited object keys", async () => {
    for (const key of ["toString", "constructor", "hasOwnProperty"]) {
      const shape = Object.fromEntries(Array.from({ length: 127 }, (_, i) => [`K_${i}`, str({ default: "x" })]));
      shape[key] = json();
      const generated = await compile(defineEnv(shape));

      assert.throws(() => generated.loadEnv({ [key]: "{" }), /must be valid JSON/);
    }
  });

  it("does not bypass generated list(json()) validation through Array.prototype", async () => {
    const generated = await compile(defineEnv({ VALUE: list(json()) }));
    try {
      Array.prototype[0] = { polluted: true };
      assert.throws(() => generated.loadEnv({ VALUE: "{" }), /VALUE\[0\] must be valid JSON/);
    } finally {
      delete Array.prototype[0];
    }
  });

  it("escapes generated .env.example line breaks and unsafe keys", () => {
    const schema = defineEnv({
      "BAD\nKEY": str({
        desc: "first\nSECOND=bad",
        docs: "https://docs.example\nTHIRD=bad",
        devDefault: "dev\nFOURTH=bad",
        example: "value\nFIFTH=bad"
      })
    });

    assert.equal(generateExample(schema), [
      "# first",
      "# SECOND=bad",
      "# Docs: https://docs.example",
      "# THIRD=bad",
      "# Development default: dev\\nFOURTH=bad",
      "BAD_KEY=value\\nFIFTH=bad",
      ""
    ].join("\n"));
  });
});

async function compile(schema) {
  const dir = join(tmpdir(), `celery-env-security-${process.pid}`);
  const file = join(dir, `env-${compile.next++}.mjs`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, generateValidator(schema), "utf8");
  return import(`${pathToFileURL(file).href}?t=${Date.now()}-${compile.next}`);
}
compile.next = 0;
