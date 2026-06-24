const ENVIRONMENTS = new Set(["development", "test", "production"]);
const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);
const LOG_FORMATS = new Set(["pretty", "json"]);
const PAYMENT_PROVIDERS = new Set(["mock", "stripe"]);

export function loadConfig(env = process.env) {
  const errors = [];
  const nodeEnv = enumValue(env, "NODE_ENV", ENVIRONMENTS, "development", errors);
  const paymentsProvider = enumValue(env, "PAYMENTS_PROVIDER", PAYMENT_PROVIDERS, "mock", errors);

  const config = {
    app: {
      name: stringValue(env, "APP_NAME", "orders-api", errors),
      nodeEnv,
      host: stringValue(env, "HOST", "127.0.0.1", errors),
      port: intValue(env, "PORT", 3000, { min: 1, max: 65535 }, errors),
      publicUrl: urlValue(env, "PUBLIC_URL", nodeEnv === "production" ? undefined : "http://localhost:3000", errors),
      trustProxy: boolValue(env, "TRUST_PROXY", false, errors),
      supportEmail: emailValue(env, "SUPPORT_EMAIL", "support@example.com", errors)
    },
    database: {
      url: requiredUrl(env, "DATABASE_URL", errors),
      poolMin: intValue(env, "DATABASE_POOL_MIN", 1, { min: 0, max: 50 }, errors),
      poolMax: intValue(env, "DATABASE_POOL_MAX", 10, { min: 1, max: 100 }, errors),
      redisUrl: optionalUrl(env, "REDIS_URL", errors)
    },
    logging: {
      level: enumValue(env, "LOG_LEVEL", LOG_LEVELS, "info", errors),
      format: enumValue(env, "LOG_FORMAT", LOG_FORMATS, nodeEnv === "production" ? "json" : "pretty", errors),
      otelEnabled: boolValue(env, "OTEL_ENABLED", false, errors),
      sentryDsn: optionalUrl(env, "SENTRY_DSN", errors)
    },
    http: {
      corsOrigins: urlListValue(env, "CORS_ORIGINS", nodeEnv === "production" ? undefined : "http://localhost:5173", errors),
      rateLimit: jsonValue(env, "RATE_LIMIT_JSON", { windowMs: 60000, max: 120 }, validateRateLimit, errors),
      sessionSecret: secretValue(env, "SESSION_SECRET", nodeEnv, errors),
      enableSignups: boolValue(env, "ENABLE_SIGNUPS", true, errors),
      allowedTenants: listValue(env, "ALLOWED_TENANTS", "demo", errors)
    },
    payments: {
      provider: paymentsProvider,
      stripeSecretKey: conditionalSecret(env, "STRIPE_SECRET_KEY", paymentsProvider === "stripe", errors),
      webhookEndpoint: optionalUrl(env, "WEBHOOK_ENDPOINT", errors)
    },
    worker: {
      concurrency: intValue(env, "WORKER_CONCURRENCY", 4, { min: 1, max: 32 }, errors),
      queues: listValue(env, "JOB_QUEUES", "email,billing,reports", errors),
      featureFlags: listValue(env, "FEATURE_FLAGS", "", errors)
    }
  };

  if (config.database.poolMin > config.database.poolMax) {
    errors.push("DATABASE_POOL_MIN must be <= DATABASE_POOL_MAX");
  }

  if (errors.length) {
    const error = new Error(`Invalid environment:\n- ${errors.join("\n- ")}`);
    error.errors = errors;
    throw error;
  }

  return config;
}

function raw(env, key) {
  return Object.hasOwn(env, key) ? env[key] : undefined;
}

function missing(value) {
  return value == null || value === "";
}

function stringValue(env, key, fallback, errors) {
  const value = raw(env, key);
  if (missing(value)) return fallback;
  if (typeof value !== "string") errors.push(`${key} must be a string`);
  return value;
}

function enumValue(env, key, allowed, fallback, errors) {
  const value = raw(env, key);
  if (missing(value)) return fallback;
  if (!allowed.has(value)) errors.push(`${key} must be one of ${Array.from(allowed).join(", ")}`);
  return value;
}

function intValue(env, key, fallback, bounds, errors) {
  const value = raw(env, key);
  if (missing(value)) return fallback;
  if (!/^[+-]?\d+$/.test(value)) {
    errors.push(`${key} must be an integer`);
    return fallback;
  }
  const number = Number(value);
  if (number < bounds.min) errors.push(`${key} must be >= ${bounds.min}`);
  if (number > bounds.max) errors.push(`${key} must be <= ${bounds.max}`);
  return number;
}

function boolValue(env, key, fallback, errors) {
  const value = raw(env, key);
  if (missing(value)) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  errors.push(`${key} must be a boolean`);
  return fallback;
}

function requiredUrl(env, key, errors) {
  const value = raw(env, key);
  if (missing(value)) {
    errors.push(`${key} is required`);
    return undefined;
  }
  return parseUrl(key, value, errors);
}

function optionalUrl(env, key, errors) {
  const value = raw(env, key);
  if (missing(value)) return undefined;
  return parseUrl(key, value, errors);
}

function urlValue(env, key, fallback, errors) {
  const value = raw(env, key);
  if (missing(value)) {
    if (fallback === undefined) errors.push(`${key} is required`);
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

function emailValue(env, key, fallback, errors) {
  const value = stringValue(env, key, fallback, errors);
  if (!value.includes("@")) errors.push(`${key} must be an email address`);
  return value;
}

function listValue(env, key, fallback, errors) {
  const value = raw(env, key);
  const source = missing(value) ? fallback : value;
  if (missing(source)) return [];
  const list = source.split(",").map((item) => item.trim()).filter(Boolean);
  if (!list.length) errors.push(`${key} must include at least one value`);
  return list;
}

function urlListValue(env, key, fallback, errors) {
  return listValue(env, key, fallback, errors).map((value) => parseUrl(`${key} item`, value, errors));
}

function jsonValue(env, key, fallback, validate, errors) {
  const value = raw(env, key);
  if (missing(value)) return fallback;
  try {
    const parsed = JSON.parse(value);
    validate(key, parsed, errors);
    return parsed;
  } catch {
    errors.push(`${key} must be valid JSON`);
    return fallback;
  }
}

function validateRateLimit(key, value, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${key} must be a JSON object`);
    return;
  }
  if (!Number.isInteger(value.windowMs) || value.windowMs < 1000) errors.push(`${key}.windowMs must be an integer >= 1000`);
  if (!Number.isInteger(value.max) || value.max < 1) errors.push(`${key}.max must be an integer >= 1`);
}

function secretValue(env, key, nodeEnv, errors) {
  const value = raw(env, key);
  if (missing(value)) {
    if (nodeEnv === "production") errors.push(`${key} is required in production`);
    return "development-only-session-secret";
  }
  if (nodeEnv === "production" && value.length < 32) errors.push(`${key} must be at least 32 characters in production`);
  return value;
}

function conditionalSecret(env, key, required, errors) {
  const value = raw(env, key);
  if (missing(value)) {
    if (required) errors.push(`${key} is required when PAYMENTS_PROVIDER=stripe`);
    return undefined;
  }
  if (value.length < 12) errors.push(`${key} must be at least 12 characters`);
  return value;
}
