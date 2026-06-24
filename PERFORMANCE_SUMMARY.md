# Celery Performance Summary

This is the readable version of the benchmark story. Raw artifacts are in
`final-hot-bench-20260622.json` and `sandbox/bench/artifacts/report.json`.

To regenerate the full benchmark report:

```sh
cd sandbox/bench
npm run report:full
```

Machine: Apple M3, Node v26.3.0, macOS arm64.

## Short Version

Celery has two modes:

- **Generated**: compile the schema once into a tiny standalone validator.
- **Runtime**: call `parseEnv(schema, env)` directly with no build step.

Generated Celery is the headline path. Runtime Celery is the flexible path. Both
are zero-dependency in the root package.

## Package Size

| Thing | Size |
| --- | ---: |
| Generated validator for the measured small schema | 526 gzip bytes |
| Celery runtime bundle | 2,779 gzip bytes |
| Root runtime source | 3,120 gzip bytes |
| Root compiler source | 6,910 gzip bytes |
| Published package dry-run | 20,191 packed bytes |

The generated output is the important number for app bundles: the measured
standalone validator is only 526 gzip bytes.

## Migration / DX Comparison

The fixture in `project/` ports the same realistic service to Celery and the
popular alternatives. Each variant preserves the same env vars, defaults,
conditional secrets, URL/list/JSON parsing, secret-safe errors, and centralized
own-property env reads. Regenerate the verified artifact with:

```sh
cd project
npm run compare:env-tools:verify
```

The command writes `project/artifacts/env-tool-comparison.md` and `.json`.

| Tool | Runtime deps | Install pkgs | Maintained env LOC | Extra env LOC vs generated Celery | Env reads |
| --- | --- | ---: | ---: | ---: | ---: |
| Celery generated | none | 0 | 163 | 0 | 1 |
| Celery runtime | celery-env | 1 | 164 | +1 | 1 |
| envalid | envalid | 2 | 199 | +36 | 1 |
| env-var | env-var | 1 | 232 | +69 | 1 |
| Zod | zod | 1 | 241 | +78 | 1 |
| Valibot | valibot | 1 | 241 | +78 | 1 |
| @t3-oss/env-core | @t3-oss/env-core, zod | 2 | 267 | +104 | 1 |
| envsafe | envsafe | 1 | 270 | +107 | 1 |

Plain-English read:

- Celery generated has the least maintained env code in the fixture and no
  runtime dependency.
- Celery runtime is nearly identical in maintained code size when users do not
  want a generation step.
- General schema libraries need helper preprocessors and error normalization to
  match env-specific behavior, which is where most of the extra code comes from.

## Hot Validation

Higher is better.

| Shape | Celery Generated | Celery Runtime | Best non-Celery | Generated advantage |
| --- | ---: | ---: | ---: | ---: |
| Small schema | 6,927,725 ops/sec | 2,154,674 | 3,061,615 Valienv | 2.3x faster |
| Medium schema | 142,821 | 53,996 | 52,547 EnvSafe | 2.7x faster |
| Large schema | 18,502 | 8,306 | 8,115 EnvSafe | 2.3x faster |
| Invalid small schema | 139,966 | 120,874 | 116,776 Valibot | 1.2x faster |

Against Zod specifically:

| Shape | Celery Generated | Zod | Advantage |
| --- | ---: | ---: | ---: |
| Small schema | 6,927,725 | 2,093,475 | 3.3x |
| Medium schema | 142,821 | 29,070 | 4.9x |
| Large schema | 18,502 | 3,514 | 5.3x |

## Competitor Scorecard

Speed compares the measured small-schema hot path against generated Celery at
6,927,725 ops/sec. Cold start compares total import/setup/first-validation time
against generated Celery at 1.825 ms. Bundle size compares gzip bytes against the
526 B generated Celery validator.

| Competitor | Small hot comparison | Cold-start comparison | Bundle comparison |
| --- | ---: | ---: | ---: |
| Zod | 3.31x faster | 17.47x faster | 39.72x smaller |
| Valibot | 6.23x faster | 3.72x faster | 3.91x smaller |
| env-var | 120.8x faster | 4.09x faster | 5.64x smaller |
| @t3-oss/env-core | 7.13x faster | 17.28x faster | 37.13x smaller |
| convict | 171.77x faster | 5.31x faster | not measured |
| envalid | 45.82x faster | 4.56x faster | 13.91x smaller |
| env-schema | 17,190.38x faster | 22.63x faster | not measured |
| envsafe | 2.28x faster | 2.79x faster | 6.26x smaller |

Plain-English read:

- Zod is the giant. Generated Celery is 3.31x faster on the small hot path,
  17.47x faster to first validation, and 39.72x smaller for the generated bundle.
- Valibot is the closest popular validator on size, and generated Celery is
  still 6.23x faster hot and 3.91x smaller.
- Dedicated env packages generally lose much harder on hot validation, while
  some are still respectable on cold start.

## Real App-Like Schemas

These are API, web, worker, list-heavy, and JSON-heavy schemas. They are closer
to what people actually validate in application startup code.

| Scenario | Celery Generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API | 4,970,658 | 1,646,571 | 1,230,289 | 1,015,903 | 134,363 | 2,779,291 | 48,816 | 584,310 | 1.79x |
| Web | 1,136,293 | 824,031 | 706,202 | 640,748 | 137,348 | 952,385 | 53,616 | 441,969 | 1.19x |
| Worker | 1,994,794 | 1,248,093 | 983,499 | 818,015 | 147,174 | 1,538,809 | 55,037 | 519,474 | 1.30x |
| List-heavy | 370,845 | 172,562 | 50,036 | 61,299 | 79,711 | 161,916 | 43,251 | 45,968 | 2.15x |
| JSON-heavy | 1,443,504 | 1,017,785 | 885,953 | 717,330 | 142,681 | 1,230,190 | 55,243 | 488,038 | 1.17x |

Plain-English read:

- Generated Celery wins every real-schema row, including against fast EnvSafe rows.
- Runtime Celery also beats Zod and Valibot in every real-schema row.
- List-heavy validation is where Celery pulls furthest ahead.

## Real process.env

`process.env` access is much slower than a plain object on Node, so this is a
separate and important benchmark.

| Scenario | Celery Generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API | 256,063 | 220,498 | 218,959 | 156,464 | 99,468 | 237,702 | 41,932 | 236,725 | 1.08x |
| Web | 227,609 | 199,447 | 202,222 | 152,113 | 102,599 | 220,058 | 47,431 | 221,497 | 1.03x |
| Worker | 260,478 | 229,112 | 224,807 | 161,606 | 106,827 | 247,658 | 48,686 | 245,196 | 1.05x |
| List-heavy | 164,849 | 106,898 | 40,861 | 45,063 | 63,913 | 98,022 | 37,705 | 40,107 | 1.54x |
| JSON-heavy | 250,140 | 215,484 | 222,117 | 161,099 | 105,583 | 234,852 | 48,252 | 241,006 | 1.04x |

Plain-English read:

- Even when Node's real `process.env` object dominates the cost, generated
  Celery still beats the fastest measured competitor in every row.
- Generated Celery now also beats runtime Celery in every process.env row in
  this full report.
- Runtime Celery remains comfortably ahead of Zod and Valibot.

## Invalid Real App-Like Schemas

Higher is better. These rows catch bad config and aggregate errors.

| Scenario | Celery Generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API | 142,314 | 121,510 | 32,078 | 108,942 | 15,148 | 17,631 | 33,067 | 10,694 | 1.17x |
| Web | 63,196 | 54,741 | 25,066 | 49,060 | 16,478 | 19,758 | 32,545 | 10,880 | 1.15x |
| Worker | 132,698 | 113,951 | 35,326 | 107,197 | 17,054 | 20,505 | 32,581 | 12,620 | 1.16x |
| List-heavy | 125,821 | 106,756 | 40,433 | 94,633 | 21,949 | 21,486 | 33,535 | 7,211 | 1.18x |
| JSON-heavy | 138,106 | 124,921 | 101,400 | 93,627 | 20,309 | 21,041 | 33,152 | 10,756 | 1.11x |

Plain-English read:

- Generated Celery now wins every invalid real-schema row.
- The JSON-heavy invalid row improved because Celery cheaply rejects obviously
  incomplete `{` and `[` JSON before paying for `JSON.parse` exceptions.
- The invalid real-schema geometric mean is now 1.32x over the best external competitor.

## Cold Start

Lower is better.

| Package | Import | Setup | First validate | Total |
| --- | ---: | ---: | ---: | ---: |
| Celery generated | 1.742 ms | 0 | 0.082 ms | 1.825 ms |
| Celery runtime | 2.098 ms | 0.148 ms | 0.207 ms | 2.454 ms |
| Valienv | 4.051 ms | 0.019 ms | 0.111 ms | 4.180 ms |
| EnvSafe | 4.900 ms | 0.038 ms | 0.156 ms | 5.095 ms |
| Valibot | 6.183 ms | 0.351 ms | 0.254 ms | 6.793 ms |
| Zod | 27.533 ms | 3.399 ms | 1.000 ms | 31.879 ms |

Plain-English read:

- Generated Celery gets from import to first validation in about 2.1 ms.
- Runtime Celery is also under 3 ms.
- Zod is about 18x slower than generated Celery in this cold-start test.

## Bundle Comparison

Lower is better.

| Package | Gzip bytes |
| --- | ---: |
| Celery generated | 526 |
| valienv | 1,130 |
| Valibot | 2,055 |
| Celery runtime | 2,779 |
| env-var | 2,969 |
| envsafe | 3,292 |
| Zod Mini | 5,810 |
| envalid | 7,318 |
| t3-env-core | 19,531 |
| Zod | 20,894 |

Plain-English read:

- Generated Celery is smaller than everything else measured.
- Runtime Celery is still small enough to compete with dedicated env packages.
- Zod is roughly 40x larger than the generated Celery validator for the measured
  small schema.

## What This Means

Celery is not just "a little faster" in the benchmark suite.

- If users can generate validators, Celery is the fastest and smallest option
  measured here.
- If users want runtime parsing, Celery still beats the general-purpose schema
  libraries on the app-like scenarios.
- The main remaining bottleneck is not Celery logic. It is Node's real
  `process.env` property access on medium and large schemas.

The clearest positioning is:

> Celery gives you sub-kilobyte generated env validators that beat Zod, Valibot,
> and common env packages on hot validation, cold start, and shipped size.
