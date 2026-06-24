import { parseEnv } from "celery-env";
import schema from "../env.schema.mjs";

export function loadConfig(env) {
  const sourceEnv = env ?? process.env;
  const values = loadRuntimeEnv(sourceEnv);
  const errors = [];
  validateRateLimit("RATE_LIMIT_JSON", values.RATE_LIMIT_JSON, errors);

  if (values.DATABASE_POOL_MIN > values.DATABASE_POOL_MAX) {
    errors.push("DATABASE_POOL_MIN must be <= DATABASE_POOL_MAX");
  }
  if (values.NODE_ENV === "production" && values.SESSION_SECRET.length < 32) {
    errors.push("SESSION_SECRET must be at least 32 characters in production");
  }
  if (values.STRIPE_SECRET_KEY !== undefined && values.STRIPE_SECRET_KEY.length < 12) {
    errors.push("STRIPE_SECRET_KEY must be at least 12 characters");
  }

  if (errors.length) {
    throwEnvError(errors);
  }

  return {
    app: {
      name: values.APP_NAME,
      nodeEnv: values.NODE_ENV,
      host: values.HOST,
      port: values.PORT,
      publicUrl: normalizeUrl(values.PUBLIC_URL),
      trustProxy: values.TRUST_PROXY,
      supportEmail: values.SUPPORT_EMAIL
    },
    database: {
      url: normalizeUrl(values.DATABASE_URL),
      poolMin: values.DATABASE_POOL_MIN,
      poolMax: values.DATABASE_POOL_MAX,
      redisUrl: optionalUrl(values.REDIS_URL)
    },
    logging: {
      level: values.LOG_LEVEL,
      format: values.LOG_FORMAT,
      otelEnabled: values.OTEL_ENABLED,
      sentryDsn: optionalUrl(values.SENTRY_DSN)
    },
    http: {
      corsOrigins: values.CORS_ORIGINS.map(normalizeUrl),
      rateLimit: values.RATE_LIMIT_JSON,
      sessionSecret: values.SESSION_SECRET,
      enableSignups: values.ENABLE_SIGNUPS,
      allowedTenants: values.ALLOWED_TENANTS
    },
    payments: {
      provider: values.PAYMENTS_PROVIDER,
      stripeSecretKey: values.STRIPE_SECRET_KEY,
      webhookEndpoint: optionalUrl(values.WEBHOOK_ENDPOINT)
    },
    worker: {
      concurrency: values.WORKER_CONCURRENCY,
      queues: values.JOB_QUEUES,
      featureFlags: values.FEATURE_FLAGS
    }
  };
}

function loadRuntimeEnv(env) {
  try {
    return parseEnv(schema, env);
  } catch (error) {
    const errors = generatedErrors(error);
    validateRawSecrets(env, errors);
    throwEnvError(errors);
  }
}

function normalizeUrl(value) {
  return new URL(value).toString();
}

function optionalUrl(value) {
  return value === undefined ? undefined : normalizeUrl(value);
}

function validateRateLimit(key, value, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${key} must be a JSON object`);
    return;
  }
  if (!Number.isInteger(value.windowMs) || value.windowMs < 1000) errors.push(`${key}.windowMs must be an integer >= 1000`);
  if (!Number.isInteger(value.max) || value.max < 1) errors.push(`${key}.max must be an integer >= 1`);
}

function generatedErrors(error) {
  if (Array.isArray(error.errors)) return error.errors.slice();
  return String(error.message || error)
    .replace(/^Invalid environment:\n- /, "")
    .split("\n- ")
    .filter(Boolean);
}

function validateRawSecrets(env, errors) {
  const nodeEnv = raw(env, "NODE_ENV") || "development";
  const provider = raw(env, "PAYMENTS_PROVIDER") || "mock";
  const sessionSecret = raw(env, "SESSION_SECRET");
  const stripeSecret = raw(env, "STRIPE_SECRET_KEY");

  if (nodeEnv === "production" && sessionSecret && sessionSecret.length < 32) {
    errors.push("SESSION_SECRET must be at least 32 characters in production");
  }
  if (provider === "stripe" && stripeSecret && stripeSecret.length < 12) {
    errors.push("STRIPE_SECRET_KEY must be at least 12 characters");
  }
}

function raw(env, key) {
  return Object.hasOwn(env, key) ? env[key] : undefined;
}

function throwEnvError(errors) {
  const unique = Array.from(new Set(errors));
  const error = new Error(`Invalid environment:\n- ${unique.join("\n- ")}`);
  error.errors = unique;
  throw error;
}
