# celery-env Benchmark Report

Generated: 2026-06-24T15:48:49.920Z

Runtime: node v26.3.0 / V8 14.6.202.34-node.20 / darwin/arm64 / Apple M3

## Scorecard

| Metric | Result |
| --- | --- |
| Valid real-schema geometric mean | 1,411,473 generated / 940,564 best external competitor (1.5x) |
| process.env real-schema geometric mean | 228,570 generated / 200,908 best external competitor (1.14x) |
| Invalid real-schema geometric mean | 112,361 generated / 84,841 best external competitor (1.32x) |
| Cold first validation | 1.849 ms generated / 4.466 ms best external competitor (2.42x faster) |
| Shipped gzip | 526 B generated / 1,130 B best external competitor (2.15x smaller) |

## Synthetic Hot Matrix

| Case | Generated | Runtime | Zod | Valibot | Best external gap |
| --- | --- | --- | --- | --- | --- |
| small | 6,952,958 | 2,079,528 | 2,082,616 | 1,088,093 | 2.24x |
| medium | 146,069 | 53,978 | 27,240 | 22,338 | 2.81x |
| large | 18,651 | 8,212 | 3,331 | 4,266 | 2.3x |
| invalid small | 138,842 | 115,861 | 34,479 | 115,143 | 1.21x |
| strict numeric | 8,930,291 | 3,892,788 | 0 | 0 | n/a |

## Real Schemas

| Case | Generated ops/sec | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| api | 4,990,119 | 1,656,506 | 1,230,100 | 982,139 | 135,387 | 2,754,795 | 49,109 | 587,356 | 1.81x |
| web | 1,085,365 | 795,193 | 702,616 | 617,718 | 137,944 | 904,817 | 54,001 | 449,490 | 1.2x |
| worker | 1,966,099 | 1,220,450 | 944,758 | 801,491 | 144,573 | 1,468,081 | 55,639 | 522,710 | 1.34x |
| list-heavy | 371,785 | 171,936 | 51,127 | 57,319 | 80,320 | 162,991 | 43,744 | 46,950 | 2.28x |
| json-heavy | 1,415,073 | 1,019,600 | 883,217 | 699,097 | 141,863 | 1,234,177 | 54,978 | 491,157 | 1.15x |

## Real Schemas with process.env

| Case | Generated ops/sec | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| api | 256,899 | 218,005 | 217,259 | 153,538 | 100,322 | 239,661 | 42,699 | 246,918 | 1.04x |
| web | 229,601 | 205,588 | 202,022 | 150,534 | 102,527 | 220,670 | 48,002 | 227,646 | 1.01x |
| worker | 258,098 | 229,377 | 221,474 | 163,029 | 107,994 | 251,435 | 48,961 | 252,068 | 1.02x |
| list-heavy | 165,936 | 106,616 | 41,298 | 43,524 | 64,756 | 98,134 | 37,968 | 41,013 | 1.69x |
| json-heavy | 246,962 | 198,369 | 139,447 | 96,359 | 63,284 | 165,249 | 46,981 | 235,418 | 1.05x |

## Invalid Real Schemas

| Case | Generated ops/sec | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| api | 140,170 | 119,503 | 32,038 | 105,113 | 14,880 | 17,266 | 28,924 | 10,785 | 1.33x |
| web | 61,610 | 53,555 | 24,862 | 47,647 | 16,155 | 19,536 | 32,302 | 10,813 | 1.29x |
| worker | 132,436 | 114,456 | 35,016 | 105,778 | 16,823 | 20,415 | 32,560 | 12,688 | 1.25x |
| list-heavy | 124,817 | 105,260 | 40,323 | 92,946 | 21,679 | 21,231 | 32,965 | 7,235 | 1.34x |
| json-heavy | 125,455 | 110,492 | 88,350 | 89,272 | 14,956 | 18,597 | 33,055 | 10,641 | 1.41x |

## Speed Mode

| Case | Default ops/sec | Speed ops/sec | Speedup |
| --- | --- | --- | --- |
| strict numeric | 7,803,263 | 8,930,291 | 1.14x |
| invalid strict numeric | 147,761 | 150,232 | 1.02x |

## Cold First Validation

| Case | Import ms | Setup ms | First validate ms | Total ms |
| --- | --- | --- | --- | --- |
| celery generated | 1.751 | 0 | 0.084 | 1.849 |
| celery runtime | 2.232 | 0.153 | 0.213 | 2.598 |
| zod | 29.57 | 3.473 | 1.039 | 33.999 |
| valibot | 6.315 | 0.354 | 0.259 | 6.925 |
| envalid | 9.265 | 0.026 | 0.321 | 9.598 |
| envsafe | 5.491 | 0.04 | 0.163 | 5.694 |
| valienv | 4.326 | 0.02 | 0.118 | 4.466 |
| env-var | 7.287 | 0 | 0.391 | 7.679 |
| safe-env-vars | 8.118 | 0.066 | 0.231 | 8.416 |
| env-type-validator | 27.408 | 0.071 | 0.406 | 27.876 |
| t3-env core | 28.903 | 2.771 | 0.602 | 32.366 |
| env-schema | 40.766 | 0.007 | 2.441 | 43.223 |
| convict | 8.149 | 0 | 1.819 | 9.997 |

## Shipped Bundle Size

| Case | Raw bytes | Gzip bytes |
| --- | --- | --- |
| celery-generated | 1,209 | 526 |
| celery-runtime | 7,795 | 2,779 |
| zod | 75,748 | 20,894 |
| zod-mini | 17,340 | 5,810 |
| valibot | 5,682 | 2,055 |
| valienv | 2,278 | 1,130 |
| envsafe | 11,155 | 3,292 |
| envalid | 21,428 | 7,318 |
| env-var | 7,652 | 2,969 |
| t3-env-core | 70,266 | 19,531 |

## Claim Guidance

- Strong claim: generated celery-env is faster than common validator-based env parsing in these real-schema Node benchmarks.
- Strong claim: generated celery-env ships a tiny standalone validator for the measured schema.
- Strong claim: runtime celery-env beats Zod and Valibot on the valid real-schema corpus in this Node run.
- Be specific with ratios; wins vary by schema shape and real process.env access is much slower than frozen plain objects.
- Keep compile/generation cost separate from hot validation cost.
