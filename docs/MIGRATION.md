# Migration Guide

Use this guide when adding Celery to an existing app.

## Step 1. Find Env Reads

Search for direct env access:

```sh
rg "process\\.env|env\\.[A-Z_]+"
```

The goal is one central module that reads env and exports validated config.

## Step 2. Write A Flat Schema

Keep schema keys close to actual env var names:

```js
export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({ protocols: ["postgres"] }),
  PORT: int({ default: 3000 })
});
```

## Step 3. Generate

```sh
npx celery-env generate --schema env.schema.mjs --out src/env.mjs --types src/env.d.ts --example .env.example --minify
```

## Step 4. Keep Your Existing Shape

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

## Step 5. Remove Direct Env Reads

Use the validated config everywhere else.

## Local Fixture

This working copy may include a local ignored `project/` fixture comparing
Celery against Zod, Valibot, Envalid, Envsafe, env-var, and T3 Env Core. It is
kept out of the public source tree so the package repository stays focused.

```sh
npm --prefix project run compare:env-tools:verify
```
