import envVar from "env-var";

const ENVIRONMENTS = ["development", "test", "production"];
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const LOG_FORMATS = ["pretty", "json"];
const PAYMENT_PROVIDERS = ["mock", "stripe"];

export function loadEnv(env = process.env) {
  const input = ownEnv(env);
  const source = envVar.from(input);
  const errors = [];
  const nodeEnv = enumValue(source, "NODE_ENV", ENVIRONMENTS, "development", errors);
  const paymentsProvider = enumValue(source, "PAYMENTS_PROVIDER", PAYMENT_PROVIDERS, "mock", errors);

  const values = {
    NODE_ENV: nodeEnv,
    APP_NAME: stringValue(source, "APP_NAME", "orders-api", errors),
    HOST: stringValue(source, "HOST", "127.0.0.1", errors),
    PORT: intValue(source, "PORT", 3000, { min: 1, max: 65535 }, errors),
    PUBLIC_URL: urlValue(source, "PUBLIC_URL", nodeEnv === "production" ? undefined : "http://localhost:3000", errors),
    TRUST_PROXY: boolValue(source, "TRUST_PROXY", false, errors),
    SUPPORT_EMAIL: emailValue(source, "SUPPORT_EMAIL", "support@example.com", errors),

    DATABASE_URL: requiredUrl(source, "DATABASE_URL", errors),
    DATABASE_POOL_MIN: intValue(source, "DATABASE_POOL_MIN", 1, { min: 0, max: 50 }, errors),
    DATABASE_POOL_MAX: intValue(source, "DATABASE_POOL_MAX", 10, { min: 1, max: 100 }, errors),
    REDIS_URL: optionalUrl(source, "REDIS_URL", errors),

    LOG_LEVEL: enumValue(source, "LOG_LEVEL", LOG_LEVELS, "info", errors),
    LOG_FORMAT: enumValue(source, "LOG_FORMAT", LOG_FORMATS, nodeEnv === "production" ? "json" : "pretty", errors),
    OTEL_ENABLED: boolValue(source, "OTEL_ENABLED", false, errors),
    SENTRY_DSN: optionalUrl(source, "SENTRY_DSN", errors),

    CORS_ORIGINS: urlListValue(source, "CORS_ORIGINS", nodeEnv === "production" ? undefined : "http://localhost:5173", errors),
    RATE_LIMIT_JSON: jsonValue(source, "RATE_LIMIT_JSON", { windowMs: 60000, max: 120 }, errors),
    FEATURE_FLAGS: listValue(source, "FEATURE_FLAGS", "", errors),
    ALLOWED_TENANTS: listValue(source, "ALLOWED_TENANTS", "demo", errors),

    PAYMENTS_PROVIDER: paymentsProvider,
    STRIPE_SECRET_KEY: secretString(source, "STRIPE_SECRET_KEY", paymentsProvider === "stripe", errors),
    WEBHOOK_ENDPOINT: optionalUrl(source, "WEBHOOK_ENDPOINT", errors),

    WORKER_CONCURRENCY: intValue(source, "WORKER_CONCURRENCY", 4, { min: 1, max: 32 }, errors),
    JOB_QUEUES: listValue(source, "JOB_QUEUES", "email,billing,reports", errors),
    ENABLE_SIGNUPS: boolValue(source, "ENABLE_SIGNUPS", true, errors),
    SESSION_SECRET: sessionSecret(source, "SESSION_SECRET", nodeEnv, errors)
  };

  validateCrossField(values, errors);

  if (errors.length) {
    throwEnvError(errors);
  }

  return values;
}

function ownEnv(env) {
  const out = Object.create(null);
  for (const key of Object.keys(env)) out[key] = env[key];
  return out;
}

function empty(value) {
  return value == null || value === "";
}

function stringValue(source, key, fallback, errors) {
  return read(key, errors, () => {
    const value = source.get(key).default(fallback).asString();
    return empty(value) ? fallback : value;
  }, fallback);
}

function enumValue(source, key, allowed, fallback, errors) {
  const value = source.get(key).default(fallback).asString();
  if (!allowed.includes(value)) errors.push(`${key} must be one of ${allowed.join(", ")}`);
  return value;
}

function intValue(source, key, fallback, bounds, errors) {
  const value = source.get(key).default(String(fallback)).asString();
  if (!/^[+-]?\d+$/.test(value)) {
    errors.push(`${key} must be an integer`);
    return fallback;
  }
  const number = Number(value);
  if (number < bounds.min) errors.push(`${key} must be >= ${bounds.min}`);
  if (number > bounds.max) errors.push(`${key} must be <= ${bounds.max}`);
  return number;
}

function boolValue(source, key, fallback, errors) {
  const value = source.get(key).default(String(fallback)).asString();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  errors.push(`${key} must be a boolean`);
  return fallback;
}

function requiredUrl(source, key, errors) {
  const value = source.get(key).asString();
  if (empty(value)) {
    errors.push(`${key} is required`);
    return undefined;
  }
  return parseUrl(key, value, errors);
}

function optionalUrl(source, key, errors) {
  const value = source.get(key).asString();
  if (empty(value)) return undefined;
  return parseUrl(key, value, errors);
}

function urlValue(source, key, fallback, errors) {
  const value = fallback === undefined ? source.get(key).asString() : source.get(key).default(fallback).asString();
  if (empty(value)) {
    errors.push(`${key} is required`);
    return fallback;
  }
  return parseUrl(key, value, errors);
}

function parseUrl(key, value, errors) {
  try {
    return new URL(value).toString();
  } catch {
    errors.push(`${key} must be a URL`);
    return value;
  }
}

function emailValue(source, key, fallback, errors) {
  const value = stringValue(source, key, fallback, errors);
  if (!value.includes("@")) errors.push(`${key} must be an email address`);
  return value;
}

function listValue(source, key, fallback, errors) {
  const value = source.get(key).default(fallback).asString();
  if (empty(value)) return [];
  const list = value.split(",").map((item) => item.trim());
  if (list.some((item) => item === "")) errors.push(`${key} must not include empty items`);
  return list;
}

function urlListValue(source, key, fallback, errors) {
  const value = fallback === undefined ? source.get(key).asString() : source.get(key).default(fallback).asString();
  if (empty(value)) {
    errors.push(`${key} is required`);
    return [];
  }
  return value.split(",").map((item) => parseUrl(`${key} item`, item.trim(), errors));
}

function jsonValue(source, key, fallback, errors) {
  const value = source.get(key).default(JSON.stringify(fallback)).asString();
  try {
    return JSON.parse(value);
  } catch {
    errors.push(`${key} must be valid JSON`);
    return fallback;
  }
}

function secretString(source, key, required, errors) {
  const value = source.get(key).asString();
  if (empty(value)) {
    if (required) errors.push(`${key} is required when PAYMENTS_PROVIDER=stripe`);
    return undefined;
  }
  if (value.length < 12) errors.push(`${key} must be at least 12 characters`);
  return value;
}

function sessionSecret(source, key, nodeEnv, errors) {
  const fallback = nodeEnv === "production" ? undefined : "development-only-session-secret";
  const value = fallback === undefined ? source.get(key).asString() : source.get(key).default(fallback).asString();
  if (empty(value)) {
    if (nodeEnv === "production") errors.push(`${key} is required in production`);
    return fallback;
  }
  if (nodeEnv === "production" && value.length < 32) errors.push(`${key} must be at least 32 characters in production`);
  return value;
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

function read(key, errors, parse, fallback) {
  try {
    return parse();
  } catch (error) {
    errors.push(`${key} ${normalizeError(error.message)}`);
    return fallback;
  }
}

function normalizeError(message) {
  return message.replace(/^env-var: "[^"]+" /, "");
}

function throwEnvError(errors) {
  const unique = Array.from(new Set(errors));
  const error = new Error(`Invalid environment:\n- ${unique.join("\n- ")}`);
  error.errors = unique;
  throw error;
}
