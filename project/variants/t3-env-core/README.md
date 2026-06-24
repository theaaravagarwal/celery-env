# @t3-oss/env-core Variant

This is the @t3-oss/env-core migration of the baseline fixture.

Maintained env files:

- `src/env.js`: createEnv configuration with Zod validators and env-string
  coercion helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses @t3-oss/env-core as a normal runtime dependency.
