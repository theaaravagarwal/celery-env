# Comparison

Celery is not a replacement for general validation libraries. It is a focused
tool for environment configuration.

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

## Choosing A Mode

| Use Case | Recommended Mode |
| --- | --- |
| Production app or service | Generated |
| Serverless or cold-start-sensitive app | Generated |
| CLI script or small internal tool | Runtime |
| Prototype before deciding schema shape | Runtime |
| App with no build/generate step allowed | Runtime |

## What Celery Does Not Do

- It does not load `.env` files. Use your platform, shell, or a dotenv loader.
- It does not validate arbitrary request bodies or form data.
- It does not validate the internal shape of `json()` values.
- It does not make untrusted schema files safe to execute.

Schema files are application code.
