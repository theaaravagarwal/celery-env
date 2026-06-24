import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bool, defineEnv, EnvError, int, list, num, oneOf, parseEnv, str, url } from "../src/index.js";

describe("parseEnv", () => {
  it("parses valid values", () => {
    const schema = defineEnv({
      NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
      PORT: int({ min: 1, max: 65535 }),
      DEBUG: bool({ default: false }),
      DATABASE_URL: url({ protocols: ["https"] }),
      API_KEY: str({ min: 4 }),
      ORIGINS: list(str(), { default: ["https://example.com"] })
    });

    const env = parseEnv(schema, {
      PORT: "3000",
      DEBUG: "true",
      DATABASE_URL: "https://db.example.com",
      API_KEY: "abcd",
      ORIGINS: "a, b,c"
    });

    assert.deepEqual(env, {
      NODE_ENV: "development",
      PORT: 3000,
      DEBUG: true,
      DATABASE_URL: "https://db.example.com",
      API_KEY: "abcd",
      ORIGINS: ["a", "b", "c"]
    });
  });

  it("collects errors without exposing secret values", () => {
    const schema = defineEnv({
      DATABASE_URL: url(),
      PORT: int({ min: 1, max: 65535 }),
      API_KEY: str({ min: 20 })
    });

    assert.throws(
      () => parseEnv(schema, { DATABASE_URL: "nope", PORT: "100000", API_KEY: "secret" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, [
          "DATABASE_URL must be a URL",
          "PORT must be <= 65535",
          "API_KEY must have length >= 20"
        ]);
        assert.equal(error.message.includes("secret"), false);
        return true;
      }
    );
  });

  it("treats empty strings as missing", () => {
    const schema = defineEnv({
      REQUIRED: str(),
      OPTIONAL: str({ optional: true }),
      DEFAULTED: int({ default: 42 })
    });

    assert.throws(() => parseEnv(schema, { REQUIRED: "", OPTIONAL: "", DEFAULTED: "" }), /REQUIRED is required/);
    assert.deepEqual(parseEnv(schema, { REQUIRED: "ok", OPTIONAL: "", DEFAULTED: "" }), {
      REQUIRED: "ok",
      OPTIONAL: undefined,
      DEFAULTED: 42
    });
  });

  it("accepts pre-frozen schema objects", () => {
    const schema = defineEnv(Object.freeze({ PORT: int({ default: 3000 }) }));
    assert.deepEqual(parseEnv(schema, {}), { PORT: 3000 });
  });

  it("rejects invalid schema entries at definition time", () => {
    assert.throws(() => defineEnv({ PORT: {} }), /PORT: schema entry is not a celery-env spec/);
    assert.throws(() => parseEnv({ PORT: {} }, { PORT: "3000" }), /PORT: schema entry is not a celery-env spec/);
    assert.throws(() => int({ requiredWhen: true }), /int\(\) requiredWhen must be a function/);
  });

  it("rejects invalid option shapes at construction time", () => {
    assert.throws(() => str(null), /str\(\) options must be an object/);
    assert.throws(() => str({ min: NaN }), /str\(\) min must be a finite number/);
    assert.throws(() => str({ startsWith: 1 }), /str\(\) startsWith must be a string/);
    assert.throws(() => int({ strict: "yes" }), /int\(\) strict must be a boolean/);
    assert.throws(() => bool({ optional: "yes" }), /bool\(\) optional must be a boolean/);
    assert.throws(() => oneOf([Infinity]), /oneOf\(\) values must be strings, finite numbers, or booleans/);
    assert.throws(() => url({ protocols: ["https:"] }), /url\(\) protocols must be protocol names without ":"/);
    assert.throws(() => list(str(), { separator: 1 }), /list\(\) separator must be a string/);
    assert.throws(() => list(str(), { trim: "yes" }), /list\(\) trim must be a boolean/);
  });

  it("supports opt-in strict numeric parsing", () => {
    const schema = defineEnv({
      PORT: int({ strict: true, min: 1 }),
      RATE: num({ strict: true }),
      RATIO: int({ strict: true, default: 2 }),
      SCALE: int({ strict: true, optional: true })
    });

    assert.deepEqual(parseEnv(schema, { PORT: "42", RATE: ".5", RATIO: "", SCALE: "" }), {
      PORT: 42,
      RATE: 0.5,
      RATIO: 2,
      SCALE: undefined
    });
    assert.equal(parseEnv(schema, { PORT: "42", RATE: "1.", RATIO: "", SCALE: "" }).RATE, 1);
    assert.equal(parseEnv(schema, { PORT: "42", RATE: "+.5", RATIO: "", SCALE: "" }).RATE, 0.5);
    assert.throws(() => parseEnv(schema, { PORT: "0x10", RATE: "1" }), /PORT must be a strict integer/);
    assert.throws(() => parseEnv(schema, { PORT: "1e3", RATE: "1" }), /PORT must be a strict integer/);
    assert.throws(() => parseEnv(schema, { PORT: "1", RATE: "1e3" }), /RATE must be a strict number/);
    assert.throws(() => parseEnv(schema, { PORT: "1", RATE: "." }), /RATE must be a strict number/);
    assert.throws(() => parseEnv(schema, { PORT: "1", RATE: "+." }), /RATE must be a strict number/);
    assert.throws(() => parseEnv(schema, { PORT: "   ", RATE: "1" }), /PORT must be a strict integer/);
  });

  it("reports runtime list item errors with indexes", () => {
    const schema = defineEnv({
      IDS: list(int({ min: 1 })),
      FLAGS: list(bool())
    });

    assert.throws(
      () => parseEnv(schema, { IDS: "1,0,3", FLAGS: "true,maybe,false" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, [
          "IDS[1] must be >= 1",
          "FLAGS[1] must be a boolean"
        ]);
        return true;
      }
    );
  });

  it("keeps runtime list item defaults and optionals for empty slots", () => {
    const schema = defineEnv({
      IDS: list(int({ default: 7 })),
      NAMES: list(str({ optional: true }))
    });

    assert.deepEqual(parseEnv(schema, { IDS: "1,,3", NAMES: "a,,c" }), {
      IDS: [1, 7, 3],
      NAMES: ["a", undefined, "c"]
    });
  });

  it("uses runtime strict-int list scanning with static defaults and optionals", () => {
    const schema = defineEnv({
      IDS: list(int({ strict: true, min: 1, max: 100, default: 7 })),
      MAYBE: list(int({ strict: true, min: 1, max: 100, optional: true }))
    });

    assert.deepEqual(parseEnv(schema, { IDS: "1,,3", MAYBE: "4,,6" }), {
      IDS: [1, 7, 3],
      MAYBE: [4, undefined, 6]
    });
    assert.throws(
      () => parseEnv(schema, { IDS: "0,,x,101", MAYBE: "1,,z" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "IDS[0] must be >= 1",
          "IDS[2] must be a strict integer",
          "IDS[3] must be <= 100",
          "MAYBE[2] must be a strict integer"
        ]);
        return true;
      }
    );
  });

  it("preserves runtime list separator semantics", () => {
    assert.deepEqual(
      parseEnv(defineEnv({ IDS: list(int({ default: 7 })) }), { IDS: ",1,,2," }),
      { IDS: [7, 1, 7, 2, 7] }
    );
    assert.deepEqual(
      parseEnv(defineEnv({ IDS: list(int({ min: 1 }), { separator: "::" }) }), { IDS: "1::2::3" }),
      { IDS: [1, 2, 3] }
    );
    assert.deepEqual(
      parseEnv(defineEnv({ CHARS: list(str(), { separator: "", trim: false }) }), { CHARS: "a😀b" }).CHARS,
      "a😀b".split("")
    );
    assert.deepEqual(
      parseEnv(defineEnv({ WORDS: list(str({ min: 2 }), { trim: false }) }), { WORDS: " a, b " }),
      { WORDS: [" a", " b "] }
    );
    assert.deepEqual(
      parseEnv(defineEnv({ WORDS: list(str({ min: 1, default: "x" }), { trim: false }) }), { WORDS: " a,,b " }),
      { WORDS: [" a", "x", "b "] }
    );
  });

  it("uses runtime string list validation without changing errors", () => {
    const schema = defineEnv({
      WORDS: list(str({ min: 2, startsWith: "a", includes: "z" })),
      RAW: list(str({ min: 2 }), { trim: false })
    });

    assert.deepEqual(parseEnv(schema, { WORDS: "az,azz", RAW: " a, b " }), {
      WORDS: ["az", "azz"],
      RAW: [" a", " b "]
    });
    assert.throws(
      () => parseEnv(schema, { WORDS: ",a,bb,aa", RAW: "x, y" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, [
          "WORDS[0] is required",
          "WORDS[1] must have length >= 2",
          "WORDS[2] must start with a",
          "WORDS[3] must include z",
          "RAW[0] must have length >= 2"
        ]);
        return true;
      }
    );
  });

  it("uses runtime string list validation with static defaults and optionals", () => {
    const schema = defineEnv({
      WORDS: list(str({ min: 2, startsWith: "a", default: "az" })),
      MAYBE: list(str({ min: 2, optional: true }))
    });

    assert.deepEqual(parseEnv(schema, { WORDS: "az,,ab", MAYBE: "hi,,ok" }), {
      WORDS: ["az", "az", "ab"],
      MAYBE: ["hi", undefined, "ok"]
    });
    assert.throws(
      () => parseEnv(schema, { WORDS: "bb,,a", MAYBE: "x,,ok" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "WORDS[0] must start with a",
          "WORDS[2] must have length >= 2",
          "MAYBE[0] must have length >= 2"
        ]);
        return true;
      }
    );
  });

  it("keeps runtime list aggregate error order", () => {
    const schema = defineEnv({ IDS: list(int({ min: 1 })) });
    assert.throws(
      () => parseEnv(schema, { IDS: "0,1,x" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "IDS[0] must be >= 1",
          "IDS[2] must be an integer"
        ]);
        return true;
      }
    );
  });

  it("uses runtime strict-int list scanning without changing errors", () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: -5, max: 100 })) });
    assert.deepEqual(parseEnv(schema, { IDS: " +1, -5 ,42" }), { IDS: [1, -5, 42] });
    assert.throws(
      () => parseEnv(schema, { IDS: "1e3,101,x" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, [
          "IDS[0] must be a strict integer",
          "IDS[1] must be <= 100",
          "IDS[2] must be a strict integer"
        ]);
        return true;
      }
    );
  });

  it("preserves trim false for runtime strict-int list scanning", () => {
    const schema = defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100 }), { trim: false }) });
    assert.deepEqual(parseEnv(schema, { IDS: "1,2" }), { IDS: [1, 2] });
    assert.throws(() => parseEnv(schema, { IDS: "1, 2" }), /IDS\[1\] must be a strict integer/);
    assert.deepEqual(
      parseEnv(defineEnv({ IDS: list(int({ strict: true, min: 1, max: 100, default: 7 }), { trim: false }) }), { IDS: "1,,2" }),
      { IDS: [1, 7, 2] }
    );
  });

  it("uses runtime strict-number list scanning with static defaults and optionals", () => {
    const schema = defineEnv({
      RATES: list(num({ strict: true, min: 0, max: 10, default: 1.5 })),
      MAYBE: list(num({ strict: true, optional: true }))
    });

    assert.deepEqual(parseEnv(schema, { RATES: ".5,,10", MAYBE: "+.5,,1." }), {
      RATES: [0.5, 1.5, 10],
      MAYBE: [0.5, undefined, 1]
    });
    assert.throws(
      () => parseEnv(schema, { RATES: "1e3,11,.", MAYBE: "1,,x" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "RATES[0] must be a strict number",
          "RATES[1] must be <= 10",
          "RATES[2] must be a strict number",
          "MAYBE[2] must be a strict number"
        ]);
        return true;
      }
    );
  });

  it("preserves trim false for runtime strict-number list scanning", () => {
    const schema = defineEnv({ RATES: list(num({ strict: true, min: 0, max: 10 }), { trim: false }) });
    assert.deepEqual(parseEnv(schema, { RATES: ".5,1." }), { RATES: [0.5, 1] });
    assert.throws(() => parseEnv(schema, { RATES: ".5, 1" }), /RATES\[1\] must be a strict number/);
  });

  it("uses runtime boolean list scanning without changing errors", () => {
    const schema = defineEnv({ FLAGS: list(bool()) });
    assert.deepEqual(parseEnv(schema, { FLAGS: " true,0,yes,off " }), { FLAGS: [true, false, true, false] });
    assert.throws(
      () => parseEnv(schema, { FLAGS: "true,maybe,false" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, ["FLAGS[1] must be a boolean"]);
        return true;
      }
    );
  });

  it("uses runtime boolean list scanning with static defaults and optionals", () => {
    const schema = defineEnv({
      FLAGS: list(bool({ default: true })),
      MAYBE: list(bool({ optional: true }))
    });
    assert.deepEqual(parseEnv(schema, { FLAGS: "false,,true", MAYBE: "true,,0" }), {
      FLAGS: [false, true, true],
      MAYBE: [true, undefined, false]
    });
    assert.throws(
      () => parseEnv(schema, { FLAGS: "maybe,,no", MAYBE: "yes,,wat" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "FLAGS[0] must be a boolean",
          "MAYBE[2] must be a boolean"
        ]);
        return true;
      }
    );
  });

  it("preserves trim false for runtime boolean list scanning", () => {
    const schema = defineEnv({ FLAGS: list(bool(), { trim: false }) });
    assert.deepEqual(parseEnv(schema, { FLAGS: "true,false" }), { FLAGS: [true, false] });
    assert.throws(() => parseEnv(schema, { FLAGS: "true, false" }), /FLAGS\[1\] must be a boolean/);
    assert.deepEqual(
      parseEnv(defineEnv({ FLAGS: list(bool({ default: false }), { trim: false }) }), { FLAGS: "true,,false" }),
      { FLAGS: [true, false, false] }
    );
  });

  it("uses runtime enum list scanning without changing errors", () => {
    const schema = defineEnv({
      MODES: list(oneOf(["alpha", "beta", "release"])),
      MIXED: list(oneOf(["0", 1, false]))
    });

    assert.deepEqual(parseEnv(schema, { MODES: "alpha, beta", MIXED: "0,1,false" }), {
      MODES: ["alpha", "beta"],
      MIXED: ["0", 1, false]
    });
    assert.throws(
      () => parseEnv(schema, { MODES: "alpha,,bad", MIXED: "2" }),
      (error) => {
        assert.equal(error instanceof EnvError, true);
        assert.deepEqual(error.errors, [
          "MODES[1] is required",
          "MODES[2] must be one of alpha, beta, release",
          "MIXED[0] must be one of 0, 1, false"
        ]);
        return true;
      }
    );
  });

  it("uses runtime enum list scanning with static defaults and optionals", () => {
    const schema = defineEnv({
      MODES: list(oneOf(["alpha", "beta", "release"], { default: "alpha" })),
      MIXED: list(oneOf([1, 2, true], { optional: true }))
    });

    assert.deepEqual(parseEnv(schema, { MODES: "beta,,release", MIXED: "1,,true" }), {
      MODES: ["beta", "alpha", "release"],
      MIXED: [1, undefined, true]
    });
    assert.throws(
      () => parseEnv(schema, { MODES: "bad,,beta", MIXED: "1,,nope" }),
      (error) => {
        assert.deepEqual(error.errors, [
          "MODES[0] must be one of alpha, beta, release",
          "MIXED[2] must be one of 1, 2, true"
        ]);
        return true;
      }
    );
  });

  it("uses large string enum lookup without changing mixed enum semantics", () => {
    const values = Array.from({ length: 12 }, (_, i) => `mode_${i}`);
    const schema = defineEnv({
      MODE: oneOf(values),
      MIXED: oneOf([1, "1"])
    });

    assert.deepEqual(parseEnv(schema, { MODE: "mode_11", MIXED: "1" }), {
      MODE: "mode_11",
      MIXED: 1
    });
    assert.throws(() => parseEnv(schema, { MODE: "missing", MIXED: "1" }), /MODE must be one of mode_0/);
  });

  it("supports env-specific defaults, requiredWhen, and metadata", () => {
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

    assert.deepEqual(parseEnv(schema, { NODE_ENV: "test" }), { MODE: "test", SECRET: undefined });
    assert.deepEqual(parseEnv(schema, { NODE_ENV: "development" }), { MODE: "dev", SECRET: undefined });
    assert.throws(() => parseEnv(schema, { NODE_ENV: "production" }), /SECRET is required/);
    assert.deepEqual(parseEnv(schema, { NODE_ENV: "production", SECRET: "x" }), { MODE: "base", SECRET: "x" });
  });
});
