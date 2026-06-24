# Envsafe Variant

This is the Envsafe migration of the baseline fixture.

Maintained env files:

- `src/env.js`: Envsafe schema plus env-string normalization helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape, plus cross-field checks.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses Envsafe as a normal runtime dependency.
