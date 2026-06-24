# Zod Variant

This is the Zod migration of the baseline fixture.

Maintained env files:

- `src/env.js`: Zod schema plus env-string coercion helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape, plus cross-field checks.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses Zod as a normal runtime dependency.
