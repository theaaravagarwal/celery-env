import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { connectDatabase } from "./db.js";
import { createLogger } from "./logger.js";
import { telemetryStatus } from "./observability.js";

export async function createApp(env = process.env) {
  const config = loadConfig(env);
  const logger = createLogger(config.logging);
  const database = connectDatabase(config.database, env);
  const version = await readVersion();

  return async function handle(request, response) {
    const url = new URL(request.url, config.app.publicUrl);

    if (url.pathname === "/health") {
      return json(response, 200, {
        ok: true,
        app: config.app.name,
        version,
        database: database.status,
        telemetry: telemetryStatus(env)
      });
    }

    if (url.pathname === "/config") {
      logger.debug("serving redacted config");
      return json(response, 200, redactConfig(config));
    }

    if (url.pathname === "/signup" && request.method === "POST") {
      if (!config.http.enableSignups) return json(response, 403, { error: "signups disabled" });
      return json(response, 202, { accepted: true });
    }

    return json(response, 404, { error: "not found" });
  };
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function redactConfig(config) {
  return {
    app: config.app,
    database: {
      ...config.database,
      url: redactUrl(config.database.url)
    },
    logging: config.logging,
    http: {
      ...config.http,
      sessionSecret: "[redacted]"
    },
    payments: {
      ...config.payments,
      stripeSecretKey: config.payments.stripeSecretKey ? "[redacted]" : undefined
    },
    worker: config.worker
  };
}

function redactUrl(value) {
  if (!value) return value;
  const url = new URL(value);
  if (url.password) url.password = "redacted";
  return url.toString();
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}
