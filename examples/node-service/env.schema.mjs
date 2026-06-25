import { bool, defineEnv, int, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({
    protocols: ["postgres", "postgresql"],
    desc: "Primary database connection string.",
    example: "postgres://user:pass@localhost:5432/app"
  }),
  PORT: int({ default: 3000, min: 1, max: 65535 }),
  LOG_LEVEL: oneOf(["debug", "info", "warn", "error"], { default: "info" }),
  QUEUE_ENABLED: bool({ default: false }),
  SESSION_SECRET: str({
    optional: true,
    min: 32,
    requiredWhen: (env) => env.NODE_ENV === "production",
    desc: "Required for production sessions."
  })
});
