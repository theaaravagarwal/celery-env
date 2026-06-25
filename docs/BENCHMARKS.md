# Benchmarks

Benchmark dependencies are kept out of the root package so `celery-env` stays
dependency-free. The public package ships the headline report and claim rules,
not the local benchmark lab.

## Current Headline

Snapshot: Node v26.3.0, V8 14.6.202.34-node.20, macOS arm64, Apple M3,
generated on 2026-06-24. Higher ops/sec is better; lower milliseconds and bytes
are better. Generated-mode numbers exclude compile/generation cost.

| Tool / mode | Primary use | Generated no-dep validator | Real schemas ops/sec geom mean | Real `process.env` ops/sec geom mean | Invalid ops/sec geom mean | Cold first validation | Gzip snapshot |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Celery generated | Env config | Yes | 1,411,473 | 228,570 | 112,361 | 1.849 ms | 526 B |
| Celery runtime | Env config | No | 776,241 | 185,124 | 96,846 | 2.598 ms | 2,779 B |
| Zod | General validation | No | 516,820 | 141,126 | 39,760 | 33.999 ms | 20,894 B |
| Valibot | General validation | No | 454,925 | 109,584 | 84,841 | 6.925 ms | 2,055 B |
| Envalid | Env validation | No | 125,202 | 85,436 | 16,731 | 9.598 ms | 7,318 B |
| Envsafe | Env validation | No | 940,564 | 184,818 | 19,359 | 5.694 ms | 3,292 B |
| env-var | Env accessors | No | 51,287 | 44,727 | 31,922 | 7.679 ms | 2,969 B |
| T3 Env Core | Typed env schema | No | 316,627 | 168,740 | 10,264 | 32.366 ms | 19,531 B |

Summary against the best external per-case baseline:

| Metric | Celery generated | Best external per-case baseline | Result |
| --- | ---: | ---: | ---: |
| Valid real-schema geometric mean | 1,411,473 ops/sec | 940,564 ops/sec | 1.50x |
| Real `process.env` geometric mean | 228,570 ops/sec | 200,908 ops/sec | 1.14x |
| Invalid real-schema geometric mean | 112,361 ops/sec | 84,841 ops/sec | 1.32x |
| Cold first validation | 1.849 ms | 4.466 ms | 2.42x faster |
| Shipped gzip snapshot | 526 B | 1,130 B | 2.15x smaller |

These are results from the env-validation corpus. They are useful for choosing
a tool, but they are not a guarantee for every schema, host runtime, or
deployment shape.

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

Snapshot dependency versions:

| Package | Version |
| --- | ---: |
| `zod` | 4.4.3 |
| `valibot` | 1.4.1 |
| `envalid` | 8.2.0 |
| `envsafe` | 2.0.3 |
| `env-var` | 7.5.0 |
| `@t3-oss/env-core` | 0.13.11 |
| `valienv` | 1.1.0 |
| `env-schema` | 7.0.0 |
| `env-type-validator` | 1.0.1 |
| `safe-env-vars` | 1.0.8 |
| `convict` | 6.2.5 |

## Package Metadata

Package footprint is separate from runtime speed. Celery is this branch's
`npm pack --dry-run`; competitors were checked with `npm view` on 2026-06-25.

| Package | Version Checked | Runtime Deps | Unpacked npm Size | Files |
| --- | ---: | ---: | ---: | ---: |
| `celery-env` | 0.1.4 | 0 | 119.2 kB | 26 |
| `zod` | 4.4.3 | 0 | 4.56 MB | 718 |
| `valibot` | 1.4.1 | 0 | 1.84 MB | 9 |
| `envalid` | 8.2.0 | 1 | 88.8 kB | 39 |
| `envsafe` | 2.0.3 | 0 | 91.4 kB | 27 |
| `env-var` | 7.5.0 | 0 | 42.9 kB | 30 |

Celery's generated validator size can be much smaller than the package size
because generated mode ships only the emitted validator in production code.

## Reproducibility

The published package intentionally does not ship the local benchmark lab or
competitor dependencies. Public docs keep the benchmark summary and claim rules
so the npm package stays small and dependency-free.

The local benchmark lab lives outside the published package. A refresh should
rerun the benchmark corpus, then update only the summarized public tables and
metadata in this document and the README.

When refreshing claims, record:

- `celery-env` version or commit;
- Node version, operating system, CPU, and date;
- competitor package versions;
- whether the row uses frozen env objects or real `process.env`;
- whether errors are aggregate or fail-fast;
- generated validator gzip size separately from npm package size.

## Claim Rules

Use precise benchmark claims:

- Good: "1.50x over the best external per-case baseline on the real-schema corpus."
- Good: "526 gzip bytes for the measured small generated validator."
- Avoid: "Celery is always 50x faster."

Env validation is workload-dependent, especially when reading real
`process.env`.
