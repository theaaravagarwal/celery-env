# Examples

The examples directory contains small schema fixtures that mirror common app
setups. They are intentionally plain JavaScript so they work in TypeScript and
JavaScript projects.

## Plain Node Service

Use [`examples/node-service/env.schema.mjs`](../examples/node-service/env.schema.mjs)
for API services, workers, and CLIs.

```sh
npx celery-env generate \
  --schema examples/node-service/env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --example .env.example \
  --minify
```

Validate once at startup:

```js
import { loadEnv } from "./env.mjs";

export const env = loadEnv(process.env);
```

## Next.js-Style Schema

Use [`examples/next/env.schema.mjs`](../examples/next/env.schema.mjs) when a
project has server-only variables and `NEXT_PUBLIC_` browser variables.

Generate the validator during development and import the generated output only
from server startup or server-only modules. Celery does not load `.env` files;
let Next.js, your platform, or a dotenv loader populate `process.env` first.

## Runtime-Only Fallback

Use runtime mode when generation is not practical yet:

```js
import schema from "./env.schema.mjs";
import { parseEnv } from "celery-env";

export const env = parseEnv(schema, process.env);
```

Generated mode remains the recommended production path because it avoids loading
the schema library at startup.
