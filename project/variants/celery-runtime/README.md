# Celery Runtime Variant

This is the runtime-mode Celery migration of the baseline fixture. It uses the
same schema as generated mode, but calls `parseEnv(schema, env)` at startup
instead of committing generated validator output.

Maintained env files:

- `env.schema.mjs`: the Celery schema.
- `src/config.js`: a small adapter from flat env vars to the app's existing
  nested config shape, plus the cross-field checks that are outside Celery's
  current schema model.

Run:

```sh
npm test
npm run audit:env
```

Because this variant calls Celery at runtime, `celery-env` is a runtime
dependency here. Generated mode keeps `celery-env` as a dev dependency only.
