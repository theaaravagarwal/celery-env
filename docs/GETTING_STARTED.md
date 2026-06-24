# Getting Started

This guide assumes you have a Node project and want one reliable place to define
environment variables.

## 1. Install

```sh
npm install -D celery-env
```

```sh
pnpm add -D celery-env
yarn add -D celery-env
bun add -d celery-env
```

Use a dev dependency when you generate validators. The generated output has no
runtime dependency on `celery-env`.

## 2. Create A Schema

Create `env.schema.mjs` in your project root:

```js
import { bool, defineEnv, int, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], {
    default: "development"
  }),

  DATABASE_URL: url({
    protocols: ["postgres"]
  }),

  PORT: int({
    default: 3000,
    min: 1,
    max: 65535
  }),

  DEBUG: bool({
    default: false
  }),

  SESSION_SECRET: str({
    optional: true,
    requiredWhen: (env) => env.NODE_ENV === "production",
    desc: "Required in production."
  })
});
```

## 3. Generate The Validator

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --example .env.example \
  --minify
```

This creates:

| File | Purpose |
| --- | --- |
| `src/env.mjs` | Runtime validator used by your app. |
| `src/env.d.ts` | Types for editors and TypeScript. |
| `.env.example` | Documented env template. |

Add the command to `package.json` so the workflow is repeatable:

```json
{
  "scripts": {
    "env:generate": "celery-env generate --schema env.schema.mjs --out src/env.mjs --types src/env.d.ts --example .env.example --minify"
  }
}
```

## 4. Load Env Once

```js
import { loadEnv } from "./env.mjs";

export const env = loadEnv(process.env);
```

Use `env` everywhere else instead of reading `process.env` directly.

## 5. Use A Nested App Config

If your app already expects a nested config object, keep the generated env flat
and adapt it in one small file:

```js
import { loadEnv } from "./env.mjs";

export function loadConfig(source = process.env) {
  const env = loadEnv(source);

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT
    },
    database: {
      url: env.DATABASE_URL
    }
  };
}
```

## What To Commit

For most apps, commit all of these:

- `env.schema.mjs`
- `src/env.mjs`
- `src/env.d.ts`
- `.env.example`

Committing generated files keeps deployments simple because production does not
need to run the generator.

## Keep Generated Files In Sync

Regenerate after changing `env.schema.mjs`:

```sh
npm run env:generate
```

In CI, verify generated files are current:

```sh
npm run env:generate
git diff --exit-code src/env.mjs src/env.d.ts .env.example
```

## Next Steps

- Read [Schema API](SCHEMA.md) when adding validators.
- Read [TypeScript](TYPESCRIPT.md) if editor types do not look right.
- Read [Troubleshooting](TROUBLESHOOTING.md) if generation or URL validation
  fails.
