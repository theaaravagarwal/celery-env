# Migration Baseline

Do not add Celery here yet. This file records what the future migration should
measure.

## Measurement Questions

- How many files change to centralize env validation?
- How many lines of hand-written parsing disappear?
- How many direct `process.env` reads remain?
- How many tests need updates?
- Can the generated config be used from the API server and worker without
  runtime dependencies?
- How clear are errors for missing production-only secrets?

## Current Baseline

- Config parser: `src/config.js`
- Server entry: `src/server.js`
- Worker entry: `src/worker.js`
- Direct env-read audit: `npm run audit:env`
- Test command: `npm test`

## Expected Migration Shape

Later, the migration should probably introduce:

- `env.schema.mjs`
- generated `src/env.mjs`
- generated `src/env.d.ts`
- one import site for server config
- one import site for worker config
- removal or shrinking of `src/config.js`

That is intentionally not implemented yet.
