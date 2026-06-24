# Env Tool Comparison Plan

This directory is the baseline project. Tool migrations should be added under
`variants/<tool-name>` so each implementation can be reviewed, tested, and
measured without rewriting the baseline.

## Tools To Compare

The initial set is:

- `celery generated`
- `celery runtime`
- `zod`
- `valibot`
- `envalid`
- `envsafe`
- `env-var`
- `@t3-oss/env-core`

These are listed in `comparison.config.json`.

## Variant Rules

Each variant should be a runnable copy of this project with only the env tooling
migration applied.

Required commands:

```sh
npm test
npm run audit:env
```

Optional commands:

```sh
npm run generate
npm run typecheck
```

Do not change app behavior to make a tool look better. The migrated project must
still support the same env vars, defaults, conditional requirements, URL/list/JSON
parsing, secret-safe errors, server entry, and worker entry.

## Metrics

Run:

```sh
npm run compare:env-tools
```

For release evidence, run:

```sh
npm run compare:env-tools:verify
```

That command runs `npm test` and `npm run audit:env` for the baseline and every
variant, then writes:

- `artifacts/env-tool-comparison.md`
- `artifacts/env-tool-comparison.json`

The comparison script reports:

- variant status: missing or present
- runtime dependency names
- dev dependency names
- app LOC, excluding env-maintained files
- env-maintained LOC, excluding generated files
- env-maintained LOC delta against the Celery generated variant
- generated LOC
- test LOC
- direct env-read hits
- installed runtime package count from `package-lock.json`
- test and env-read audit pass/fail when run with `--verify`
- file count

Manual review should also score:

- setup steps from blank baseline
- whether config types are inferred
- whether error messages are useful
- whether secrets are excluded from errors
- whether generated/runtime output can run in server and worker entrypoints
- whether the package adds install scripts or large transitive dependency trees

## Baseline Snapshot

Current manual baseline:

- 13 env-read hits across source files
- 23 env variables in `.env.example`
- hand-written parser in `src/config.js`
- 6 passing tests

Current Celery generated variant:

- 1 env-read hit in source files
- 0 runtime dependencies
- `celery-env` as a dev dependency for regeneration
- 127 app LOC, 163 env-maintained LOC, 368 generated LOC, 173 test LOC
- generated `src/env.mjs`, `src/env.d.ts`, and `.env.example`

Current Zod variant:

- 1 env-read hit in source files after centralizing env input
- `zod` as a runtime dependency
- 127 app LOC, 241 env-maintained LOC, 0 generated LOC, 173 test LOC
- a runtime `src/env.js` schema with manual preprocessors and error formatting

Current full variant snapshot:

| Tool | Runtime deps | Install pkgs | App LOC | Env LOC | Env LOC vs gen | Generated LOC | Test LOC | Env reads |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| manual process.env | none | 0 | 134 | 179 | +16 | 0 | 123 | 13 |
| celery generated | none | 0 | 127 | 163 | 0 | 368 | 173 | 1 |
| celery runtime | celery-env | 1 | 127 | 164 | +1 | 0 | 173 | 1 |
| zod | zod | 1 | 127 | 241 | +78 | 0 | 173 | 1 |
| valibot | valibot | 1 | 127 | 241 | +78 | 0 | 173 | 1 |
| envalid | envalid | 2 | 127 | 199 | +36 | 0 | 173 | 1 |
| envsafe | envsafe | 1 | 127 | 270 | +107 | 0 | 173 | 1 |
| env-var | env-var | 1 | 127 | 232 | +69 | 0 | 173 | 1 |
| @t3-oss/env-core | @t3-oss/env-core, zod | 2 | 127 | 267 | +104 | 0 | 173 | 1 |

The goal for Celery is not just benchmark speed. It should reduce custom parser
code, centralize env reads, keep errors safe, and make the migration feel smaller
than the popular alternatives.
