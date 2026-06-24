# Benchmarks

Benchmark dependencies are kept out of the root package so `celery-env` stays
dependency-free. The public package ships the headline report and claim rules,
not the local benchmark lab.

## Current Headline

Current report: Node v26.3.0, macOS arm64, Apple M3.

| Metric | Result |
| --- | ---: |
| Valid real-schema geometric mean | 1.50x over best external competitor |
| Real `process.env` geometric mean | 1.14x over best external competitor |
| Invalid real-schema geometric mean | 1.32x over best external competitor |
| Cold first validation | 2.42x faster than best external competitor |
| Generated validator size | 526 gzip bytes |
| Smallest external bundle gap | 2.15x smaller |

## What Is Measured

- Synthetic small, medium, and large schemas.
- Realistic API, web, worker, list-heavy, and JSON-heavy env schemas.
- Frozen plain env objects and real `process.env`.
- Invalid input with aggregate errors.
- Cold import/setup/first validation.
- Shipped gzip bundle size.

## Competitors

The benchmark corpus includes Zod, Valibot, Envalid, Envsafe, env-var, T3 Env
Core, Valienv, env-schema, env-type-validator, safe-env-vars, and Convict where
the benchmark applies.

## Claim Rules

Use precise benchmark claims:

- Good: "1.50x over the best external competitor on the real-schema corpus."
- Good: "526 gzip bytes for the measured small generated validator."
- Avoid: "Celery is always 50x faster."

Env validation is workload-dependent, especially when reading real
`process.env`.
