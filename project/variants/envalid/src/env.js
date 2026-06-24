import { bool, cleanEnv, json, makeValidator, str } from "envalid";

const ENVIRONMENTS = ["development", "test", "production"];
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const LOG_FORMATS = ["pretty", "json"];
const PAYMENT_PROVIDERS = ["mock", "stripe"];

const strictInt = makeValidator((value) => {
  if (!/^[+-]?\d+$/.test(value)) throw new Error("must be an integer");
  return Number(value);
});

const normalizedUrl = makeValidator((value) => {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error("must be a URL");
  }
});

const stringList = makeValidator((value) => {
  if (value === "") return [];
  const list = value.split(",").map((item) => item.trim());
  if (list.some((item) => item === "")) throw new Error("must not include empty items");
  return list;
});

const urlList = makeValidator((value) => {
  if (value === "") throw new Error("is required");
  return value.split(",").map((item) => {
    try {
      return new URL(item.trim()).toString();
    } catch {
      throw new Error("must be a URL");
    }
  });
});

export function loadEnv(env = process.env) {
  const input = normalizeInput(env);
  const errors = [];
  let values;

  try {
    values = cleanEnv(input, validators(valuesForRequiredWhen(input)), {
      reporter: ({ errors: reported }) => {
        const entries = Object.entries(reported);
        if (entries.length) throwEnvError(entries.map(([key, error]) => `${key} ${normalizeMessage(error.message)}`));
      }
    });
  } catch (error) {
    errors.push(...extractErrors(error));
    values = fallbackValues(input);
  }

  validateRawSecrets(input, errors);
  validateCrossField(values, errors);

  if (errors.length) throwEnvError(errors);
  return values;
}

function validators(requiredInput) {
  return {
    NODE_ENV: str({ choices: ENVIRONMENTS, default: "development" }),
    APP_NAME: str({ default: "orders-api" }),
    HOST: str({ default: "127.0.0.1" }),
    PORT: strictInt({ default: 3000, choices: range(1, 65535) }),
    PUBLIC_URL: normalizedUrl({
      devDefault: "http://localhost:3000",
      requiredWhen: () => requiredInput.NODE_ENV === "production"
    }),
    TRUST_PROXY: bool({ default: false }),
    SUPPORT_EMAIL: str({ default: "support@example.com" }),

    DATABASE_URL: normalizedUrl(),
    DATABASE_POOL_MIN: strictInt({ default: 1, choices: range(0, 50) }),
    DATABASE_POOL_MAX: strictInt({ default: 10, choices: range(1, 100) }),
    REDIS_URL: normalizedUrl({ default: undefined }),

    LOG_LEVEL: str({ choices: LOG_LEVELS, default: "info" }),
    LOG_FORMAT: str({ choices: LOG_FORMATS, default: requiredInput.NODE_ENV === "production" ? "json" : "pretty" }),
    OTEL_ENABLED: bool({ default: false }),
    SENTRY_DSN: normalizedUrl({ default: undefined }),

    CORS_ORIGINS: urlList({ default: requiredInput.NODE_ENV === "production" ? undefined : ["http://localhost:5173"] }),
    RATE_LIMIT_JSON: json({ default: { windowMs: 60000, max: 120 } }),
    FEATURE_FLAGS: stringList({ default: [] }),
    ALLOWED_TENANTS: stringList({ default: ["demo"] }),

    PAYMENTS_PROVIDER: str({ choices: PAYMENT_PROVIDERS, default: "mock" }),
    STRIPE_SECRET_KEY: str({
      default: undefined,
      requiredWhen: () => requiredInput.PAYMENTS_PROVIDER === "stripe"
    }),
    WEBHOOK_ENDPOINT: normalizedUrl({ default: undefined }),

    WORKER_CONCURRENCY: strictInt({ default: 4, choices: range(1, 32) }),
    JOB_QUEUES: stringList({ default: ["email", "billing", "reports"] }),
    ENABLE_SIGNUPS: bool({ default: true }),
    SESSION_SECRET: str({
      devDefault: "development-only-session-secret",
      requiredWhen: () => requiredInput.NODE_ENV === "production"
    })
  };
}

function normalizeInput(env) {
  const input = ownEnv(env);
  if (empty(input.NODE_ENV)) input.NODE_ENV = "development";
  return input;
}

function ownEnv(env) {
  const out = Object.create(null);
  for (const key of Object.keys(env)) out[key] = env[key];
  return out;
}

function valuesForRequiredWhen(input) {
  return {
    NODE_ENV: input.NODE_ENV || "development",
    PAYMENTS_PROVIDER: input.PAYMENTS_PROVIDER || "mock"
  };
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
  if (values.DATABASE_POOL_MIN > values.DATABASE_POOL_MAX) errors.push("DATABASE_POOL_MIN must be <= DATABASE_POOL_MAX");
  const rateLimit = values.RATE_LIMIT_JSON;
  if (!rateLimit || typeof rateLimit !== "object" || Array.isArray(rateLimit)) {
    errors.push("RATE_LIMIT_JSON must be a JSON object");
    return;
  }
  if (!Number.isInteger(rateLimit.windowMs) || rateLimit.windowMs < 1000) errors.push("RATE_LIMIT_JSON.windowMs must be an integer >= 1000");
  if (!Number.isInteger(rateLimit.max) || rateLimit.max < 1) errors.push("RATE_LIMIT_JSON.max must be an integer >= 1");
}

function extractErrors(error) {
  return Array.isArray(error.errors) ? error.errors : [String(error.message || error)];
}

function normalizeMessage(message) {
  if (/required/.test(message) || /Missing/.test(message)) return "is required";
  return message || "is invalid";
}

function throwEnvError(errors) {
  const unique = Array.from(new Set(errors));
  const error = new Error(`Invalid environment:\n- ${unique.join("\n- ")}`);
  error.errors = unique;
  throw error;
}

function empty(value) {
  return value == null || value === "";
}

function range(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
}
