import { bool, defineEnv, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({
    protocols: ["postgres", "postgresql"],
    desc: "Server-only database connection string."
  }),
  NEXT_PUBLIC_APP_URL: url({
    protocols: ["https"],
    desc: "Browser-visible application origin.",
    example: "https://app.example.com"
  }),
  NEXT_PUBLIC_ANALYTICS: bool({ default: false }),
  SESSION_SECRET: str({
    optional: true,
    min: 32,
    requiredWhen: (env) => env.NODE_ENV === "production"
  })
});
