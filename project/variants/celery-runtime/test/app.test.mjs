import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { createWorker } from "../src/worker.js";

const env = {
  NODE_ENV: "test",
  APP_NAME: "fixture-api",
  DATABASE_URL: "postgres://user:pass@localhost:5432/orders",
  PUBLIC_URL: "http://localhost:3000",
  SESSION_SECRET: "test-secret",
  LOG_LEVEL: "error",
  JOB_QUEUES: "email,billing",
  WORKER_CONCURRENCY: "2"
};

describe("app", () => {
  it("serves health JSON", async () => {
    const app = await createApp(env);
    const response = new FakeResponse();

    await app({ method: "GET", url: "/health" }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      ok: true,
      app: "fixture-api",
      version: "0.0.0",
      database: "configured",
      telemetry: { sentry: "none", traces: false }
    });
  });

  it("creates a worker from env", () => {
    const worker = createWorker(env);

    assert.deepEqual(worker.queues, ["email", "billing"]);
    assert.equal(worker.concurrency, 2);
    assert.deepEqual(worker.runOnce(), [
      { queue: "email", handled: 1 },
      { queue: "billing", handled: 1 }
    ]);
  });
});

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headers = {};
  body = "";

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(body) {
    this.body = body;
    this.emit("finish");
  }
}
