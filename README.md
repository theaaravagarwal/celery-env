# celery-env

<p align="center">
  <img src="docs/assets/celery-mark.svg" alt="celery-env" width="96" height="96">
</p>

<p align="center">
  <strong>Type-safe process.env validation that compiles to tiny standalone JavaScript.</strong>
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

Generated mode:

```sh
npm install -D celery-env
```

Runtime mode:

```sh
npm install celery-env
```

Other package managers:

```sh
pnpm add -D celery-env
yarn add -D celery-env
bun add -d celery-env
```

## 60-Second Setup

Infer a schema from existing env files and source references:

```sh
npx celery-env infer --schema env.schema.mjs
```

This writes a starter schema and refuses overwrite unless you pass `--force`.
Review it before generating; inference cannot know every production-only rule.

Or create a schema manually:

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

Celery validates the env object you pass. Load `.env` with your platform,
shell, or `dotenv` before calling `loadEnv`.

That is the main path: infer or write `env.schema.mjs`, generate `src/env.mjs`,
and use the typed result everywhere else.

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

## Quick Comparison

| Choose | When |
| --- | --- |
| Celery generated mode | You want a committed standalone validator, generated TypeScript declarations, generated `.env.example`, no production dependency, or lower cold-start cost. |
| Celery runtime mode | You like Celery's schema API but cannot add generation yet. |
| Zod | You need general object, form, API, or nested data validation. |
| Envalid / Envsafe / env-var | You want mature runtime-only env validation with no generated files. |

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

Snapshot: Node v26.3.0, macOS arm64, Apple M3, generated on 2026-06-24. Higher
ops/sec is better; lower milliseconds and bytes are better. Generated-mode
numbers exclude compile/generation cost.

| Tool / mode | Real schemas ops/sec | Real `process.env` ops/sec | Invalid ops/sec | Cold first validation | Gzip snapshot |
| --- | ---: | ---: | ---: | ---: | ---: |
| Celery generated | 1,411,473 | 228,570 | 112,361 | 1.849 ms | 526 B |
| Celery runtime | 776,241 | 185,124 | 96,846 | 2.598 ms | 2,779 B |
| Zod | 516,820 | 141,126 | 39,760 | 33.999 ms | 20,894 B |
| Valibot | 454,925 | 109,584 | 84,841 | 6.925 ms | 2,055 B |
| Envalid | 125,202 | 85,436 | 16,731 | 9.598 ms | 7,318 B |
| Envsafe | 940,564 | 184,818 | 19,359 | 5.694 ms | 3,292 B |
| env-var | 51,287 | 44,727 | 31,922 | 7.679 ms | 2,969 B |
| T3 Env Core | 316,627 | 168,740 | 10,264 | 32.366 ms | 19,531 B |

The benchmark corpus includes realistic API, web, worker, list-heavy, and
JSON-heavy env schemas. Results are workload-specific; real `process.env` access
narrows some gaps compared with frozen plain env objects.

Package metadata snapshot. Celery is this branch's `npm pack --dry-run`;
competitors were checked with `npm view` on 2026-06-25.

| Package | Version checked | Runtime deps | Unpacked npm size | Files |
| --- | ---: | ---: | ---: | ---: |
| `celery-env` | 0.1.2 + infer | 0 | 117.7 kB | 26 |
| `zod` | 4.4.3 | 0 | 4.56 MB | 718 |
| `valibot` | 1.4.1 | 0 | 1.84 MB | 9 |
| `envalid` | 8.2.0 | 1 | 88.8 kB | 39 |
| `envsafe` | 2.0.3 | 0 | 91.4 kB | 27 |
| `env-var` | 7.5.0 | 0 | 42.9 kB | 30 |

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [Schema API](docs/SCHEMA.md)
- [CLI](docs/CLI.md)
- [TypeScript](docs/TYPESCRIPT.md)
- [Examples](docs/EXAMPLES.md)
- [Runtime Mode](docs/RUNTIME.md)
- [Comparison](docs/COMPARISON.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Benchmarks](docs/BENCHMARKS.md)
- [Migration Guide](docs/MIGRATION.md)
- [Security](SECURITY.md)

## License

MIT
