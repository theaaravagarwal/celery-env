# Envalid Variant

This is the Envalid migration of the baseline fixture.

Maintained env files:

- `src/env.js`: Envalid schema plus env-string normalization helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape, plus cross-field checks.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses Envalid as a normal runtime dependency.
