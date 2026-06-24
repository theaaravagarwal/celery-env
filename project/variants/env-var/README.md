# env-var Variant

This is the env-var migration of the baseline fixture.

Maintained env files:

- `src/env.js`: env-var accessors plus explicit validation helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses env-var as a normal runtime dependency.
