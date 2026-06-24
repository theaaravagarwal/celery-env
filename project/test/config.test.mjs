import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/orders",
  PUBLIC_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret"
};

describe("loadConfig", () => {
  it("loads defaults for a test environment", () => {
    const config = loadConfig(baseEnv);

    assert.equal(config.app.nodeEnv, "test");
    assert.equal(config.app.port, 3000);
    assert.equal(config.database.poolMax, 10);
    assert.deepEqual(config.worker.queues, ["email", "billing", "reports"]);
    assert.deepEqual(config.http.rateLimit, { windowMs: 60000, max: 120 });
  });

  it("parses booleans, lists, URLs, integers, and JSON", () => {
    const config = loadConfig({
      ...baseEnv,
      PORT: "8080",
      TRUST_PROXY: "yes",
      ENABLE_SIGNUPS: "off",
      CORS_ORIGINS: "https://app.example.com, https://admin.example.com",
      RATE_LIMIT_JSON: "{\"windowMs\":30000,\"max\":50}",
      WORKER_CONCURRENCY: "12",
      FEATURE_FLAGS: "a,b,c",
      REDIS_URL: "redis://localhost:6379"
    });

    assert.equal(config.app.port, 8080);
    assert.equal(config.app.trustProxy, true);
    assert.equal(config.http.enableSignups, false);
    assert.equal(config.http.corsOrigins[1], "https://admin.example.com/");
    assert.deepEqual(config.http.rateLimit, { windowMs: 30000, max: 50 });
    assert.equal(config.worker.concurrency, 12);
    assert.deepEqual(config.worker.featureFlags, ["a", "b", "c"]);
    assert.equal(config.database.redisUrl, "redis://localhost:6379");
  });

  it("aggregates errors without leaking secret values", () => {
    assert.throws(
      () => loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "not a url",
        PORT: "99999",
        SESSION_SECRET: "short",
        PAYMENTS_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_bad",
        RATE_LIMIT_JSON: "{\"windowMs\":1,\"max\":0}"
      }),
      (error) => {
        assert.match(error.message, /DATABASE_URL must be a URL/);
        assert.match(error.message, /SESSION_SECRET must be at least 32 characters/);
        assert.match(error.message, /STRIPE_SECRET_KEY must be at least 12 characters/);
        assert.equal(error.message.includes("sk_bad"), false);
        assert.equal(error.message.includes("short"), false);
        return true;
      }
    );
  });

  it("ignores inherited env properties", () => {
    const env = Object.create({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://inherited.example.com/db"
    });
    env.DATABASE_URL = baseEnv.DATABASE_URL;

    const config = loadConfig(env);
    assert.equal(config.app.nodeEnv, "development");
    assert.equal(config.database.url, "postgres://user:pass@localhost:5432/orders");
  });
});
