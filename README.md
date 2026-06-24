# celery-env

<p align="center">
  <img src="docs/assets/celery-mark.svg" alt="celery-env" width="96" height="96">
</p>

<p align="center">
  <strong>Environment validation that compiles to tiny standalone JavaScript.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/celery-env"><img alt="npm" src="https://img.shields.io/npm/v/celery-env?color=0f766e"></a>
  <a href="https://github.com/theaaravagarwal/celery-env/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/theaaravagarwal/celery-env/ci.yml?branch=main"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-0f766e">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-black"></a>
</p>

Celery validates `process.env` with a schema you can read, then generates a
small validator you can ship without a runtime dependency. It is built for app
configuration: defaults, production-only secrets, typed output, good error
messages, and fast startup.

## Install

```sh
npm install -D celery-env
```

Other package managers:

```sh
pnpm add -D celery-env
yarn add -D celery-env
bun add -d celery-env
```

## 60-Second Setup

Create a schema:

```js
// env.schema.mjs
import { bool, defineEnv, int, oneOf, str, url } from "celery-env";

export default defineEnv({
  NODE_ENV: oneOf(["development", "test", "production"], { default: "development" }),
  DATABASE_URL: url({ protocols: ["postgres"] }),
  PORT: int({ default: 3000, min: 1, max: 65535 }),
  DEBUG: bool({ default: false }),
  SESSION_SECRET: str({
    optional: true,
    requiredWhen: (env) => env.NODE_ENV === "production"
  })
});
```

Generate the validator:

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --example .env.example \
  --minify
```

Use it at app startup:

```js
// src/config.js
import { loadEnv } from "./env.mjs";

export const env = loadEnv(process.env);
```

That is the main path: write `env.schema.mjs`, generate `src/env.mjs`, and use
the typed result everywhere else.

## When To Use Celery

Use Celery when you want env validation to be:

- focused on app configuration instead of general object validation;
- generated once and cheap at startup;
- dependency-free in production;
- typed without hand-written config types;
- strict about missing production secrets without printing secret values.

If you already use Zod for forms, API payloads, or general data validation,
keep using it there. Celery is for the narrower `process.env` problem where
defaults, examples, generated files, and startup cost matter.

## Why Use It

- **Generated validator**: no schema walk during app startup.
- **Zero runtime dependencies** in generated mode.
- **Small output**: the measured small generated validator is 526 gzip bytes.
- **Typed config** through generated `.d.ts` files or `InferEnv`.
- **Env-specific rules** like `devDefault`, `testDefault`, and `requiredWhen`.
- **Secret-safe errors** that do not print rejected secret values.
- **Runtime mode** available when you do not want a build step.

## Runtime Mode

Generated mode is recommended for apps, but direct parsing is available:

```js
import { defineEnv, int, parseEnv, str } from "celery-env";

const schema = defineEnv({
  DATABASE_URL: str({ min: 1 }),
  PORT: int({ default: 3000 })
});

export const env = parseEnv(schema, process.env);
```

## Benchmarks

Current local report: Node v26.3.0, macOS arm64, Apple M3.

| Metric | Result |
| --- | ---: |
| Valid real-schema geometric mean | 1.50x over best external competitor |
| Real `process.env` geometric mean | 1.14x over best external competitor |
| Invalid real-schema geometric mean | 1.32x over best external competitor |
| Cold first validation | 2.42x faster than best external competitor |
| Generated validator size | 526 gzip bytes |
| Smallest external bundle gap | 2.15x smaller |

Competitors measured include Zod, Valibot, Envalid, Envsafe, env-var, T3 Env
Core, Valienv, env-schema, env-type-validator, safe-env-vars, and Convict where
the benchmark applies. The claim is specific to this env-validation corpus.

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [Schema API](docs/SCHEMA.md)
- [CLI](docs/CLI.md)
- [TypeScript](docs/TYPESCRIPT.md)
- [Runtime Mode](docs/RUNTIME.md)
- [Comparison](docs/COMPARISON.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Benchmarks](docs/BENCHMARKS.md)
- [Migration Guide](docs/MIGRATION.md)
- [Security](SECURITY.md)

## License

MIT
