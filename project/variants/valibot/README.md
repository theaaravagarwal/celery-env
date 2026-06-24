# Valibot Variant

This is the Valibot migration of the baseline fixture.

Maintained env files:

- `src/env.js`: Valibot schema plus env-string coercion helpers.
- `src/config.js`: adapter from flat validated env values to the app's existing
  nested config shape.

Run:

```sh
npm test
npm run audit:env
```

This variant intentionally uses Valibot as a normal runtime dependency.
