# Celery Generated Variant

This is the generated-mode Celery migration of the baseline fixture.

Maintained env files:

- `env.schema.mjs`: the Celery schema.
- `src/config.js`: a small adapter from flat env vars to the app's existing
  nested config shape, plus the cross-field checks that are outside Celery's
  current schema model.

Generated files:

- `src/env.mjs`
- `src/env.d.ts`
- `.env.example`

Run:

```sh
npm run generate
npm test
npm run audit:env
```

The generated validator imports no runtime dependencies. `celery-env` is only a
dev dependency for regeneration.
