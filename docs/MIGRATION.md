# Migration Guide

Use this guide when adding Celery to an existing app.

## Step 1. Infer A Starter Schema

```sh
npx celery-env infer --schema env.schema.mjs
```

This reads existing env files and static source references. Review the generated
schema before using it in production.

## Step 2. Find Env Reads

Search for direct env access:

```sh
rg "process\\.env|env\\.[A-Z_]+"
```

The goal is one central module that reads env and exports validated config.

## Step 3. Tighten The Flat Schema

Keep schema keys close to actual env var names:

```js
import { defineEnv, int, oneOf, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({ protocols: ["postgres"] }),
  PORT: int({ default: 3000 })
});
```

## Step 4. Generate

```sh
npx celery-env generate --schema env.schema.mjs --out src/env.mjs --types src/env.d.ts --example .env.example --minify
```

## Step 5. Keep Your Existing Shape

If your app already expects nested config, adapt once:

```js
import { loadEnv } from "./env.mjs";

export function loadConfig(source = process.env) {
  const env = loadEnv(source);

  return {
    app: { port: env.PORT },
    database: { url: env.DATABASE_URL }
  };
}
```

## Step 6. Remove Direct Env Reads

Use the validated config everywhere else.
