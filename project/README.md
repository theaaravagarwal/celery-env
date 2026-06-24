# Celery Migration Fixture

This is a deliberately ordinary Node service before adopting `celery-env`.
It already runs, has tests, and uses raw/manual `process.env` parsing.

The goal is to measure how easy it is to add Celery to an existing project, not
to showcase Celery yet. There is no Celery import in this directory.

## Run

```sh
npm test
npm run audit:env
npm run compare:env-tools
node src/server.js
```

The app is dependency-free so future migrations can compare only env tooling
changes.

## Current Config Surface

The project has 23 env vars covering:

- strings and enums: `NODE_ENV`, `APP_NAME`, `LOG_LEVEL`, `PAYMENTS_PROVIDER`
- integers: `PORT`, `DATABASE_POOL_MIN`, `DATABASE_POOL_MAX`, `WORKER_CONCURRENCY`
- booleans: `OTEL_ENABLED`, `ENABLE_SIGNUPS`, `TRUST_PROXY`
- URLs: `PUBLIC_URL`, `DATABASE_URL`, `REDIS_URL`, `WEBHOOK_ENDPOINT`, `SENTRY_DSN`
- lists: `CORS_ORIGINS`, `FEATURE_FLAGS`, `ALLOWED_TENANTS`, `JOB_QUEUES`
- JSON: `RATE_LIMIT_JSON`
- conditional requirements: `SESSION_SECRET` in production, `STRIPE_SECRET_KEY`
  when `PAYMENTS_PROVIDER=stripe`

## Known Pre-Migration Pain

- Env parsing is hand-written in `src/config.js`.
- Some modules still read `process.env` directly.
- Error formatting, default handling, URL parsing, and conditional requirements
  are custom logic that would need to be re-verified whenever env vars change.
- Type information is implicit; editors cannot infer the validated config shape.

Use this as the baseline when comparing Celery against Zod, envalid, envsafe,
Valibot, or other "easy setup" packages.

See `COMPARISON_PLAN.md` for the migration scoring rules. Future migrations
should live under `variants/<tool-name>` so `npm run compare:env-tools` can
score Celery, Zod, Valibot, envalid, envsafe, env-var, and T3 Env against the
same baseline.
