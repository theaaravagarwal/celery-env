# TypeScript

You do not need to be a TypeScript expert to use Celery. The main idea is:

1. Write a schema.
2. Generate `src/env.d.ts`.
3. Import `env` or `loadEnv` and let your editor infer the types.

## Generated Types

Generate both JavaScript and declarations:

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts
```

Then import the generated module:

```ts
import { loadEnv } from "./env.mjs";

const env = loadEnv(process.env);

env.PORT;
//  ^ number

env.DATABASE_URL;
//  ^ string
```

## Optional Values

```js
import { defineEnv, url } from "celery-env";

export default defineEnv({
  SENTRY_DSN: url({ optional: true })
});
```

TypeScript sees:

```ts
env.SENTRY_DSN;
// string | undefined
```

## Defaults Remove Undefined

```js
import { defineEnv, int } from "celery-env";

export default defineEnv({
  PORT: int({ default: 3000 })
});
```

TypeScript sees:

```ts
env.PORT;
// number
```

## Inferring From A Schema

If you use runtime mode or want a named type:

```ts
import type { InferEnv } from "celery-env";
import schema from "../env.schema.mjs";

export type Env = InferEnv<typeof schema>;
```

## JSON Types

Generated declarations type `json()` values as `unknown`, because Celery only
validates JSON syntax.

```js
import { defineEnv, json } from "celery-env";

const schema = defineEnv({
  RATE_LIMIT_JSON: json()
});
```

Narrow the value in your app after parsing:

```ts
const rateLimit = env.RATE_LIMIT_JSON;

if (
  rateLimit &&
  typeof rateLimit === "object" &&
  "windowMs" in rateLimit &&
  "max" in rateLimit
) {
  // rateLimit has the fields you checked for here.
}
```
