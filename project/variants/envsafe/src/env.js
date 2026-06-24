import { envsafe, makeValidator } from "envsafe";

const ENVIRONMENTS = ["development", "test", "production"];
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const LOG_FORMATS = ["pretty", "json"];
const PAYMENT_PROVIDERS = ["mock", "stripe"];

const schema = {
  NODE_ENV: enumSchema(ENVIRONMENTS)(),
  APP_NAME: stringSchema()(),
  HOST: stringSchema()(),
  PORT: intSchema(1, 65535)(),
  PUBLIC_URL: urlSchema()(),
  TRUST_PROXY: boolSchema()(),
  SUPPORT_EMAIL: emailSchema()(),

  DATABASE_URL: urlSchema()(),
  DATABASE_POOL_MIN: intSchema(0, 50)(),
  DATABASE_POOL_MAX: intSchema(1, 100)(),
  REDIS_URL: optionalUrlSchema()({ allowEmpty: true }),

  LOG_LEVEL: enumSchema(LOG_LEVELS)(),
  LOG_FORMAT: enumSchema(LOG_FORMATS)(),
  OTEL_ENABLED: boolSchema()(),
  SENTRY_DSN: optionalUrlSchema()({ allowEmpty: true }),

  CORS_ORIGINS: urlListSchema()(),
  RATE_LIMIT_JSON: jsonSchema()(),
  FEATURE_FLAGS: listSchema()({ allowEmpty: true }),
  ALLOWED_TENANTS: listSchema()(),

  PAYMENTS_PROVIDER: enumSchema(PAYMENT_PROVIDERS)(),
  STRIPE_SECRET_KEY: optionalStringSchema()({ allowEmpty: true }),
  WEBHOOK_ENDPOINT: optionalUrlSchema()({ allowEmpty: true }),

  WORKER_CONCURRENCY: intSchema(1, 32)(),
  JOB_QUEUES: listSchema()(),
  ENABLE_SIGNUPS: boolSchema()(),
  SESSION_SECRET: optionalStringSchema()({ allowEmpty: true })
};

export function loadEnv(env = process.env) {
  const input = normalizeInput(env);
  const errors = [];
  let values;

  try {
    values = envsafe(schema, {
      env: input,
      strict: true,
      reporter: throwReporter
    });
  } catch (error) {
    errors.push(...envErrors(error));
    values = fallbackValues(input);
  }

  validateRawSecrets(input, errors);
  validateCrossField(values, errors);

  if (errors.length) throwEnvError(errors);
  return values;
}

function normalizeInput(env) {
  const input = ownEnv(env);
  const nodeEnv = empty(input.NODE_ENV) ? "development" : input.NODE_ENV;

  return {
    NODE_ENV: nodeEnv,
    APP_NAME: fallback(input.APP_NAME, "orders-api"),
    HOST: fallback(input.HOST, "127.0.0.1"),
    PORT: fallback(input.PORT, "3000"),
    PUBLIC_URL: fallback(input.PUBLIC_URL, nodeEnv === "production" ? undefined : "http://localhost:3000"),
    TRUST_PROXY: fallback(input.TRUST_PROXY, "false"),
    SUPPORT_EMAIL: fallback(input.SUPPORT_EMAIL, "support@example.com"),

    DATABASE_URL: optional(input.DATABASE_URL),
    DATABASE_POOL_MIN: fallback(input.DATABASE_POOL_MIN, "1"),
    DATABASE_POOL_MAX: fallback(input.DATABASE_POOL_MAX, "10"),
    REDIS_URL: optional(input.REDIS_URL),

    LOG_LEVEL: fallback(input.LOG_LEVEL, "info"),
    LOG_FORMAT: fallback(input.LOG_FORMAT, nodeEnv === "production" ? "json" : "pretty"),
    OTEL_ENABLED: fallback(input.OTEL_ENABLED, "false"),
    SENTRY_DSN: optional(input.SENTRY_DSN),

    CORS_ORIGINS: fallback(input.CORS_ORIGINS, nodeEnv === "production" ? undefined : "http://localhost:5173"),
    RATE_LIMIT_JSON: fallback(input.RATE_LIMIT_JSON, "{\"windowMs\":60000,\"max\":120}"),
    FEATURE_FLAGS: fallback(input.FEATURE_FLAGS, ""),
    ALLOWED_TENANTS: fallback(input.ALLOWED_TENANTS, "demo"),

    PAYMENTS_PROVIDER: fallback(input.PAYMENTS_PROVIDER, "mock"),
    STRIPE_SECRET_KEY: optional(input.STRIPE_SECRET_KEY),
    WEBHOOK_ENDPOINT: optional(input.WEBHOOK_ENDPOINT),

    WORKER_CONCURRENCY: fallback(input.WORKER_CONCURRENCY, "4"),
    JOB_QUEUES: fallback(input.JOB_QUEUES, "email,billing,reports"),
    ENABLE_SIGNUPS: fallback(input.ENABLE_SIGNUPS, "true"),
    SESSION_SECRET: fallback(input.SESSION_SECRET, nodeEnv === "production" ? "" : "development-only-session-secret")
  };
}

function ownEnv(env) {
  const out = Object.create(null);
  for (const key of Object.keys(env)) out[key] = env[key];
  return out;
}

function empty(value) {
  return value == null || value === "";
}

function fallback(value, fallbackValue) {
  return empty(value) ? fallbackValue : value;
}

function optional(value) {
  return empty(value) ? "" : value;
}

function stringSchema() {
  return makeValidator((value) => {
    if (typeof value !== "string") throw new Error("must be a string");
    return value;
  });
}

function enumSchema(allowed) {
  return makeValidator((value) => {
    if (allowed.includes(value)) return value;
    throw new Error(`must be one of ${allowed.join(", ")}`);
  });
}

function intSchema(min, max) {
  return makeValidator((value) => {
    if (!/^[+-]?\d+$/.test(value)) throw new Error("must be an integer");
    const number = Number(value);
    if (number < min) throw new Error(`must be >= ${min}`);
    if (number > max) throw new Error(`must be <= ${max}`);
    return number;
  });
}

function boolSchema() {
  return makeValidator((value) => {
    if (["true", "1", "yes", "on"].includes(value)) return true;
    if (["false", "0", "no", "off"].includes(value)) return false;
    throw new Error("must be a boolean");
  });
}

function urlSchema() {
  return makeValidator((value) => parseUrl(value));
}

function optionalUrlSchema() {
  return makeValidator((value) => {
    if (empty(value)) return undefined;
    return parseUrl(value);
  });
}

function parseUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error("must be a URL");
  }
}

function emailSchema() {
  return makeValidator((value) => {
    if (!value.includes("@")) throw new Error("must be an email address");
    return value;
  });
}

function listSchema() {
  return makeValidator((value) => {
    if (empty(value)) return [];
    const list = value.split(",").map((item) => item.trim());
    if (list.some((item) => item === "")) throw new Error("must not include empty items");
    return list;
  });
}

function urlListSchema() {
  return makeValidator((value) => {
    if (empty(value)) throw new Error("is required");
    return value.split(",").map((item) => parseUrl(item.trim()));
  });
}

function jsonSchema() {
  return makeValidator((value) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("must be valid JSON");
    }
  });
}

function optionalStringSchema() {
  return makeValidator((value) => {
    if (empty(value)) return undefined;
    if (typeof value !== "string") throw new Error("must be a string");
    return value;
  });
}

function fallbackValues(input) {
  return {
    NODE_ENV: input.NODE_ENV || "development",
    PAYMENTS_PROVIDER: input.PAYMENTS_PROVIDER || "mock",
    DATABASE_POOL_MIN: Number(input.DATABASE_POOL_MIN || 1),
    DATABASE_POOL_MAX: Number(input.DATABASE_POOL_MAX || 10),
    RATE_LIMIT_JSON: { windowMs: 60000, max: 120 }
  };
}

function validateRawSecrets(input, errors) {
  const nodeEnv = input.NODE_ENV || "development";
  const provider = input.PAYMENTS_PROVIDER || "mock";
  const sessionSecret = input.SESSION_SECRET;
  const stripeSecret = input.STRIPE_SECRET_KEY;

  if (nodeEnv === "production" && empty(sessionSecret)) errors.push("SESSION_SECRET is required in production");
  if (nodeEnv === "production" && sessionSecret && sessionSecret.length < 32) errors.push("SESSION_SECRET must be at least 32 characters in production");
  if (provider === "stripe" && empty(stripeSecret)) errors.push("STRIPE_SECRET_KEY is required when PAYMENTS_PROVIDER=stripe");
  if (provider === "stripe" && stripeSecret && stripeSecret.length < 12) errors.push("STRIPE_SECRET_KEY must be at least 12 characters");
}

function validateCrossField(values, errors) {
  if (values.DATABASE_POOL_MIN > values.DATABASE_POOL_MAX) {
    errors.push("DATABASE_POOL_MIN must be <= DATABASE_POOL_MAX");
  }
  const rateLimit = values.RATE_LIMIT_JSON;
  if (!rateLimit || typeof rateLimit !== "object" || Array.isArray(rateLimit)) {
    errors.push("RATE_LIMIT_JSON must be a JSON object");
    return;
  }
  if (!Number.isInteger(rateLimit.windowMs) || rateLimit.windowMs < 1000) errors.push("RATE_LIMIT_JSON.windowMs must be an integer >= 1000");
  if (!Number.isInteger(rateLimit.max) || rateLimit.max < 1) errors.push("RATE_LIMIT_JSON.max must be an integer >= 1");
}

function throwReporter({ errors }) {
  const messages = Object.entries(errors).map(([key, error]) => `${key} ${error.message}`);
  if (messages.length) throwEnvError(messages);
}

function envErrors(error) {
  if (Array.isArray(error.errors)) return error.errors.slice();
  return String(error.message || error)
    .replace(/^Invalid environment:\n- /, "")
    .split("\n- ")
    .filter(Boolean);
}

function throwEnvError(errors) {
  const unique = Array.from(new Set(errors));
  const error = new Error(`Invalid environment:\n- ${unique.join("\n- ")}`);
  error.errors = unique;
  throw error;
}
