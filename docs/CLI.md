# CLI

The CLI creates schemas and generated validator files.

## Initialize A Schema

```sh
npx celery-env init --target node --schema env.schema.mjs
```

Use `init` when starting from scratch. It writes a small schema with common
Node app variables.

Targets:

| Target | Use For |
| --- | --- |
| `node` | Regular Node apps and services. |
| `next` | Next.js projects. |
| `vite` | Vite projects and edge-style environments. |

## Generate

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --example .env.example
```

Use `generate` after editing `env.schema.mjs`.

## Flags

| Flag | Meaning |
| --- | --- |
| `--schema <file>` | Schema module to import. |
| `--out <file>` | Generated validator output path. |
| `--types <file>` | Generated `.d.ts` output path. |
| `--example <file>` | Generated `.env.example` output path. |
| `--function-name <name>` | Generated function name. Default: `loadEnv`. |
| `--no-process-default` | Do not default to `process.env` in generated output. |
| `--minify` | Emit smaller generated JavaScript. |
| `--fail-fast` | Throw on the first error instead of aggregating errors. |
| `--force` | Overwrite existing generated files. |
| `--optimize speed` | Emit larger speed-prioritized code for supported cases. |

## Recommended App Command

Add a script:

```json
{
  "scripts": {
    "env:generate": "celery-env generate --schema env.schema.mjs --out src/env.mjs --types src/env.d.ts --example .env.example --minify --force"
  }
}
```

Run it whenever the schema changes:

```sh
npm run env:generate
```

Generated files are regular source files. Commit them when you want production
deployments to run without the generator.
