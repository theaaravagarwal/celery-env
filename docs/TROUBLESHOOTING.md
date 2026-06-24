# Troubleshooting

## `celery-env` Is Not Found On npm

Before the first public publish, npm returns `E404` for `celery-env`. After
publish, this should work:

```sh
npm view celery-env version
```

## The CLI Refuses To Overwrite A File

Generation does not overwrite existing files unless you pass `--force`.

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --force
```

## TypeScript Cannot Find The Generated Types

Generate declarations with `--types` and import the generated module path:

```sh
npx celery-env generate --schema env.schema.mjs --out src/env.mjs --types src/env.d.ts
```

```ts
import { loadEnv } from "./env.mjs";
```

The `.d.ts` file must sit next to the generated `.mjs` file with the same base
name.

## A URL Protocol Is Rejected

Write protocols without the colon:

```js
url({ protocols: ["postgres"] })
```

Use `postgres`, not `postgres:`.

## A Production Secret Is Missing

Use `requiredWhen` for values that are optional in development but required in
production:

```js
SESSION_SECRET: str({
  optional: true,
  requiredWhen: (env) => env.NODE_ENV === "production"
})
```

Keep `requiredWhen` self-contained. Generated validators serialize the function
source, so it should not close over local variables.

## `json()` Is Typed As `unknown`

Celery only checks that the env value is valid JSON. It does not validate the
object shape inside the JSON string. Narrow or validate the parsed value in your
app before using fields from it.

## Generated Mode Feels Like Too Much

Use runtime mode:

```js
import { defineEnv, int, parseEnv, str } from "celery-env";

const schema = defineEnv({
  DATABASE_URL: str({ min: 1 }),
  PORT: int({ default: 3000 })
});

export const env = parseEnv(schema, process.env);
```
