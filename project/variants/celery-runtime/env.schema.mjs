import { bool, defineEnv, int, json, list, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], {
    default: "development",
    desc: "Current runtime environment."
  }),
  APP_NAME: str({ default: "orders-api" }),
  HOST: str({ default: "127.0.0.1" }),
  PORT: int({ default: 3000, min: 1, max: 65535, strict: true }),
  PUBLIC_URL: url({
    devDefault: "http://localhost:3000",
    requiredWhen: (env) => env.NODE_ENV === "production"
  }),
  TRUST_PROXY: bool({ default: false }),
  SUPPORT_EMAIL: str({ default: "support@example.com", includes: "@" }),

  DATABASE_URL: url(),
  DATABASE_POOL_MIN: int({ default: 1, min: 0, max: 50, strict: true }),
  DATABASE_POOL_MAX: int({ default: 10, min: 1, max: 100, strict: true }),
  REDIS_URL: url({ optional: true }),

  LOG_LEVEL: oneOf(["debug", "info", "warn", "error"], { default: "info" }),
  LOG_FORMAT: oneOf(["pretty", "json"], { devDefault: "pretty", default: "json" }),
  OTEL_ENABLED: bool({ default: false }),
  SENTRY_DSN: url({ optional: true }),

  CORS_ORIGINS: list(url(), {
    default: ["http://localhost:5173"]
  }),
  RATE_LIMIT_JSON: json({
    default: { windowMs: 60000, max: 120 }
  }),
  FEATURE_FLAGS: list(str({ min: 1 }), {
    default: []
  }),
  ALLOWED_TENANTS: list(str({ min: 1 }), {
    default: ["demo"]
  }),

  PAYMENTS_PROVIDER: oneOf(["mock", "stripe"], {
    default: "mock"
  }),
  STRIPE_SECRET_KEY: str({
    optional: true,
    requiredWhen: (env) => env.PAYMENTS_PROVIDER === "stripe"
  }),
  WEBHOOK_ENDPOINT: url({ optional: true }),

  WORKER_CONCURRENCY: int({ default: 4, min: 1, max: 32, strict: true }),
  JOB_QUEUES: list(str({ min: 1 }), {
    default: ["email", "billing", "reports"]
  }),
  ENABLE_SIGNUPS: bool({ default: true }),
  SESSION_SECRET: str({
    devDefault: "development-only-session-secret-value",
    requiredWhen: (env) => env.NODE_ENV === "production"
  })
});
