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

## Infer A Schema

```sh
npx celery-env infer --schema env.schema.mjs
```

Use `infer` when a project already has `.env` files or source code that reads
env vars. It discovers `.env.example`, `.env`, `.env.local`, and common source
directories by default. It writes a starter schema and refuses overwrite unless
you pass `--force`.

You can pass sources explicitly:

```sh
npx celery-env infer \
  --schema env.schema.mjs \
  --env .env.example \
  --scan src
```

Inference is conservative. Ambiguous values become `str({ min: 1 })`. Only
example, sample, or template env files can emit `example` metadata; local env
values and secret-looking values are not copied into the generated schema.
Safe example values can infer enums and string-list item enums.
Review the result for project-specific constraints such as `requiredWhen`,
`min`, `max`, or stricter URL protocols.

## Generate

```sh
npx celery-env generate \
  --schema env.schema.mjs \
  --out src/env.mjs \
  --types src/env.d.ts \
  --example .env.example
```

Use `generate` after editing `env.schema.mjs`.

## Infer Flags

| Flag | Meaning |
| --- | --- |
| `--schema <file>` | Schema file to write. |
| `--env <file>` | Env file to read for `infer`. Repeatable. |
| `--scan <path>` | File or directory to scan for `infer`. Repeatable. |
| `--force` | Overwrite an existing schema file. |
| `--version`, `-v` | Print the installed CLI version. |

## Generate Flags

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
| `--version`, `-v` | Print the installed CLI version. |

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
