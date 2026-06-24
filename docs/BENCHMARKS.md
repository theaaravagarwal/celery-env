# Benchmarks

Benchmarks live in `sandbox/bench` so competitor dependencies never enter the
root package.

## Run The Report

```sh
cd sandbox/bench
npm install
npm run report
```

The report writes:

- `sandbox/bench/artifacts/report.md`
- `sandbox/bench/artifacts/report.json`

## Current Headline

Current local report: Node v26.3.0, macOS arm64, Apple M3.

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
