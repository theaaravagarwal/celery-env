# Comparison

Celery is not a replacement for general validation libraries. It is a focused
tool for environment configuration.

## Quick Decision Guide

| Choose | When |
| --- | --- |
| Celery generated mode | You want a committed standalone validator, generated TypeScript declarations, generated `.env.example`, no production dependency, or lower cold-start cost. |
| Celery runtime mode | You like Celery's schema API but cannot add generation yet. |
| Zod | You already need general object validation, nested data validation, or shared schemas beyond `process.env`. |
| Envalid / Envsafe / env-var | You want a mature runtime-only env validator with no generated files or build step. |
| Stay with your current tool | Env validation is not on the startup path and generated artifacts would add workflow friction. |

## Celery vs Zod

Zod is excellent for general TypeScript validation: forms, API payloads,
domain objects, JSON data, and reusable schemas across an app.

Celery is narrower. It validates `process.env`, then can generate a standalone
validator and declaration file for production startup.

| Question | Celery | Zod |
| --- | --- | --- |
| Main job | Validate env config. | Validate general data. |
| Schema shape | One key per env var. | Any object/data shape. |
| Generated validator | Yes. | No. |
| Production runtime dependency | None in generated mode. | `zod`. |
| `.env.example` generation | Built in. | Build yourself. |
| Env-specific defaults | Built in. | Build yourself. |
| Secret-safe env errors | Built in. | Build yourself. |
| Ecosystem size | Small and focused. | Large and mature. |

Use Zod when you need general validation. Use Celery when the thing being
validated is application configuration.

## Celery vs Envalid / Envsafe / env-var

These libraries are purpose-built for env validation and are good defaults for
runtime validation.

Celery's main difference is generated mode:

- the schema stays in development code;
- the generated validator can be committed;
- production can run without loading the schema library;
- TypeScript declarations can be generated from the same schema;
- `.env.example` can be generated from schema metadata.

## Generated vs Runtime Mode

| Question | Generated mode | Runtime mode |
| --- | --- | --- |
| Production dependency on `celery-env` | No | Yes |
| Build or generate step | Yes | No |
| Startup cost | Lowest | Schema parsed at runtime |
| Generated `.d.ts` | Yes | Use `InferEnv` |
| Generated `.env.example` | Yes | Only if you run the CLI |
| Best fit | Services, serverless, production apps | Scripts, prototypes, no-build projects |

## Choose Another Tool When

| Need | Better Fit |
| --- | --- |
| General object, form, API, or nested JSON validation | Zod |
| Runtime-only env validation with no generated artifacts | Envalid / Envsafe / env-var |
| Built-in `.env` file loading | dotenv plus a validator |
| Maximum ecosystem maturity | Zod or established env validators |
| No schema execution during build or generation | A static config format or runtime-only validator |

## Package Footprint

This table is npm package metadata, not benchmark speed:

| Package | Version Checked | Runtime Deps | Unpacked npm Size | Files |
| --- | ---: | ---: | ---: | ---: |
| `celery-env` | 0.1.1 | 0 | 94.1 kB | 20 |
| `zod` | 4.4.3 | 0 | 4.56 MB | 718 |
| `valibot` | 1.4.1 | 0 | 1.84 MB | 9 |
| `envalid` | 8.2.0 | 1 | 88.8 kB | 39 |
| `envsafe` | 2.0.3 | 0 | 91.4 kB | 27 |
| `env-var` | 7.5.0 | 0 | 42.9 kB | 30 |

Checked with `npm view` on 2026-06-25.

## What Celery Does Not Do

- It does not load `.env` files. Use your platform, shell, or a dotenv loader.
- It does not validate arbitrary request bodies or form data.
- It does not validate the internal shape of `json()` values.
- It does not make untrusted schema files safe to execute.

Schema files are application code.
