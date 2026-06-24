# Benchmark Notes

Benchmarks live in `sandbox/bench` so competitor dependencies never enter the root package.

```sh
cd sandbox/bench
npm install
npm run report
npm run report:full
npm run parity
npm run runtime-matrix
npm run split-large
npm run split-v2
```

`BENCH_TIME` and `BENCH_WARMUP` can override individual hot benchmark scripts. The report runner also accepts explicit flags:

```sh
npm run report -- --time 150 --warmup 75 --cold-runs 7
npm run report:full
```

The artifact-backed public report is written to `sandbox/bench/artifacts/report.md` and `sandbox/bench/artifacts/report.json`. It now includes a scorecard, synthetic hot matrix, valid real-schema rows, real `process.env` rows, invalid real-schema rows, cold-start medians, shipped bundle size, and claim guidance.

## Current Local Report

- Date: 2026-06-24
- Runtime: Node v26.3.0, V8 14.6.202.34-node.20, darwin/arm64, Apple M3
- Root runtime size: `src/index.js` is 3,120 gzip bytes
- Root compiler size: `src/compiler.js` is 6,910 gzip bytes
- Publish dry-run: 10 files, 17,207 packed bytes

Real-schema hot validation from `npm run report`:

| Case | Celery generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| api | 4,990,119 | 1,656,506 | 1,230,100 | 982,139 | 135,387 | 2,754,795 | 49,109 | 587,356 | 1.81x |
| web | 1,085,365 | 795,193 | 702,616 | 617,718 | 137,944 | 904,817 | 54,001 | 449,490 | 1.20x |
| worker | 1,966,099 | 1,220,450 | 944,758 | 801,491 | 144,573 | 1,468,081 | 55,639 | 522,710 | 1.34x |
| list-heavy | 371,785 | 171,936 | 51,127 | 57,319 | 80,320 | 162,991 | 43,744 | 46,950 | 2.28x |
| json-heavy | 1,415,073 | 1,019,600 | 883,217 | 699,097 | 141,863 | 1,234,177 | 54,978 | 491,157 | 1.15x |

Real-schema `process.env` rows from `sandbox/bench/real-schemas.mjs`:

| Case | Celery generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| api | 256,899 | 218,005 | 217,259 | 153,538 | 100,322 | 239,661 | 42,699 | 246,918 | 1.04x |
| web | 229,601 | 205,588 | 202,022 | 150,534 | 102,527 | 220,670 | 48,002 | 227,646 | 1.01x |
| worker | 258,098 | 229,377 | 221,474 | 163,029 | 107,994 | 251,435 | 48,961 | 252,068 | 1.02x |
| list-heavy | 165,936 | 106,616 | 41,298 | 43,524 | 64,756 | 98,134 | 37,968 | 41,013 | 1.69x |
| json-heavy | 246,962 | 198,369 | 139,447 | 96,359 | 63,284 | 165,249 | 46,981 | 235,418 | 1.05x |

Invalid real-schema rows from `sandbox/bench/real-schemas.mjs`:

| Case | Celery generated | Runtime | Zod | Valibot | Envalid | Envsafe | env-var | T3 Env | Best external gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| api | 140,170 | 119,503 | 32,038 | 105,113 | 14,880 | 17,266 | 28,924 | 10,785 | 1.33x |
| web | 61,610 | 53,555 | 24,862 | 47,647 | 16,155 | 19,536 | 32,302 | 10,813 | 1.29x |
| worker | 132,436 | 114,456 | 35,016 | 105,778 | 16,823 | 20,415 | 32,560 | 12,688 | 1.25x |
| list-heavy | 124,817 | 105,260 | 40,323 | 92,946 | 21,679 | 21,231 | 32,965 | 7,235 | 1.34x |
| json-heavy | 125,455 | 110,492 | 88,350 | 89,272 | 14,956 | 18,597 | 33,055 | 10,641 | 1.41x |

Focused actual `process.env` rows from `process-env-explicit-20260622.json`:

| Case | Ops/sec | Mean us |
| --- | ---: | ---: |
| celery generated explicit small | 603,711 | 1.66 |
| celery runtime explicit small | 484,386 | 2.07 |
| celery generated default-arg small | 589,120 | 1.70 |
| celery runtime default-arg small | 485,907 | 2.06 |
| celery generated explicit strict numeric | 1,489,381 | 0.67 |
| celery generated speed explicit strict numeric | 1,575,315 | 0.64 |
| celery runtime explicit strict numeric | 1,173,077 | 0.85 |

Focused medium/large-schema `process.env` rows from `final-hot-bench-20260622.json`:

| Case | Ops/sec | Mean us |
| --- | ---: | ---: |
| celery generated medium plain object | 247,235 | 4.16 |
| celery runtime medium plain object | 111,503 | 9.11 |
| celery generated explicit `process.env` medium | 12,715 | 78.80 |
| celery runtime explicit `process.env` medium | 10,075 | 99.43 |
| celery generated default `process.env` medium | 12,794 | 78.32 |
| celery runtime default `process.env` medium | 10,104 | 99.13 |
| celery generated large plain object | 22,228 | 45.32 |
| celery runtime large plain object | 13,273 | 76.89 |
| celery generated explicit `process.env` large | 1,449 | 690.28 |
| celery runtime explicit `process.env` large | 1,276 | 785.07 |
| celery generated default `process.env` large | 1,467 | 682.02 |
| celery runtime default `process.env` large | 1,273 | 787.60 |

Interpretation: real `process.env` property access dominates medium and large synthetic-schema validation cost on Node v26.3.0/macOS, but generated output remains ahead of runtime for both explicit and default `process.env` calls in this smoke run.

Rejected generated `process.env` access-shape variants from `process-env-generated-shapes-20260622.json`:

| Case | Current ops/sec | Candidate ops/sec | Current gzip | Candidate gzip |
| --- | ---: | ---: | ---: | ---: |
| 160-field destructure explicit `process.env` | 12,349 | 12,319 | 2,738 | 3,149 |
| 640-field destructure explicit `process.env` | 1,443 | 1,361 | 12,937 | 14,952 |
| 640-field snapshot-if explicit `process.env` | 1,443 | 415 | 12,937 | 12,963 |
| 640-field manual default `process.env` | 1,464 | 1,490 | 12,937 | 12,961 |

Interpretation: destructuring bloats generated output without improving real `process.env`, snapshotting is much slower because copying `process.env` dominates, and manual default-parameter lowering is too small to justify larger generated output.

Focused generated split and return-shape follow-up rows from `split-v2-current-20260622.json` and `generated-shapes-current-20260622.json`:

| Case | Current best ops/sec | Note |
| --- | ---: | --- |
| split-v2 160 groups / 640 fields | 16,603 | split helpers beat unsplit 10,915 in this short run |
| split-v2 320 groups / 1280 fields | 8,132 | split threshold 256 beat unsplit 5,433, but threshold 128 regressed |
| generated-shapes 160 groups / 640 fields | 13,582 | local registers beat array slots and direct object assignment |
| generated-shapes 320 groups / 1280 fields | 6,237 | local registers beat array slots and direct object assignment |

Interpretation: helper splitting still has large-schema upside, but return-shape changes are not a clean win on this Node/macOS run. Keep production large-schema changes behind focused split/cold-start evidence instead of switching broadly to object or array return shapes.

Focused split cold-start rows from `split-cold-current-20260622.json` and `split-cold-high-threshold-20260622.json`:

| Case | Gzip bytes | Import ms | First validate ms | Total ms |
| --- | ---: | ---: | ---: | ---: |
| unsplit 160 groups / 640 fields | 14,323 | 3.641 | 5.538 | 9.184 |
| split-512 160 groups / 640 fields | 12,937 | 3.612 | 5.456 | 9.086 |
| split-768 160 groups / 640 fields | 14,323 | 3.659 | 5.534 | 9.221 |
| unsplit 320 groups / 1280 fields | 28,440 | 5.744 | 11.112 | 16.838 |
| split-512 320 groups / 1280 fields | 25,313 | 5.485 | 10.859 | 16.307 |
| split-1024 320 groups / 1280 fields | 25,313 | 5.431 | 10.842 | 16.295 |

Interpretation: current split output helps cold import/first-validate modestly and shrinks generated gzip for large schemas. Raising the split threshold above the 640-field case falls back to unsplit output and loses the cold-size benefit, so no split-threshold increase is accepted.

Focused URL/missing-branch rows from the latest optimization pass:

| Artifact | Case | Ops/sec |
| --- | --- | ---: |
| `list-url-switch-all-20260622.json` | generated list url protocols 20 | 141,122 |
| `list-url-switch-all-20260622.json` | generated list url protocols 200 | 14,413 |
| `list-url-baseline-multiproto-20260622.json` | old generated list url multiproto 200 | 13,756 |
| `list-url-switch-multiproto-20260622.json` | switch generated list url multiproto 200 | 14,305 |
| `runtime-missing-nodeenv-cache-20260622.json` | old missing production defaults | 3,897,227 |
| `runtime-missing-nodeenv-cache-20260622.json` | new missing production defaults | 4,054,650 |

Rejected URL runtime prototype: a single-protocol direct-compare path pushed runtime gzip to 2,918 bytes, above the 2,900-byte gate, so it was reverted before benchmark acceptance.

Rejected generated URL-list trim-bound scanner from `list-url-trim-bounds-proto-20260622.json`:

| Case | Current ops/sec | Candidate ops/sec | Current gzip | Candidate gzip |
| --- | ---: | ---: | ---: | ---: |
| single protocol 20 | 125,658 | 125,967 | 431 | 570 |
| single protocol 200 | 12,624 | 12,748 | 431 | 570 |
| multi protocol 20 | 124,867 | 124,931 | 437 | 576 |
| multi protocol 200 | 12,515 | 12,508 | 437 | 576 |

The candidate used segment trim bounds but still called `new URL()` on the trimmed string. Since `new URL()` dominates, throughput was effectively tied while emitted validators grew by about 139 gzip bytes, so the current generated URL-list path remains preferable.

Focused runtime strict scanner rows from `runtime-strict-scanner-paired-20260622.json`:

| Case | Old runtime | New runtime |
| --- | ---: | ---: |
| strict int bounded valid | 8,965,275 | 10,281,307 |
| strict int bounded invalid | 93,683 | 135,122 |
| strict num `.5` valid | 6,632,311 | 7,149,568 |
| strict num `1.25` valid | 6,324,431 | 7,699,138 |
| strict num `123` valid | 8,968,799 | 9,892,944 |
| strict num `1.` valid | 6,649,772 | 8,311,120 |
| strict num `+.5` valid | 6,727,804 | 7,675,854 |

Focused generated speed-mode strict `num()` cleanup from `generated-strict-num-else-if-paired-20260622.json`:

| Case | Old | New |
| --- | ---: | ---: |
| emitted speed validator gzip | 429 bytes | 421 bytes |
| strict num `1.25` speed row | 12,647,075 | 13,316,652 |
| strict num `123` speed row | 22,617,584 | 23,140,369 |
| strict num `1.` speed row | 16,544,738 | 16,828,660 |
| strict num `+.5` speed row | 14,484,563 | 14,860,276 |

Focused strict `num()` list rows from `list-strict-num-coverage-20260622.json`:

| Case | Ops/sec | Mean us |
| --- | ---: | ---: |
| generated list strict num 20 | 503,075 | 2.03 |
| generated list strict num speed 20 | 576,323 | 1.75 |
| runtime list strict num 20 | 486,537 | 2.06 |
| generated list strict num 200 | 51,489 | 19.52 |
| generated list strict num speed 200 | 56,802 | 17.65 |
| runtime list strict num 200 | 51,739 | 19.39 |

Focused runtime strict `num()` list rows after the slice-based runtime fast path in `runtime-strict-num-list-slice-fastpath-20260622.json`:

| Case | Ops/sec | Mean us |
| --- | ---: | ---: |
| generated list strict num speed 20 | 583,235 | 1.72 |
| runtime list strict num 20 | 542,047 | 1.85 |
| generated list strict num speed 200 | 57,122 | 17.55 |
| runtime list strict num 200 | 55,832 | 17.96 |

Generated return-shape boundary rows from `object-boundary-generated-shapes-20260622.json`:

| 512-field shape | Ops/sec | Raw bytes | Gzip bytes |
| --- | ---: | ---: | ---: |
| locals-return | 14,910 | 140,302 | 11,550 |
| array-slots | 15,331 | 139,654 | 10,338 |
| object-assign | 26,600 | 135,054 | 7,950 |

Focused enum-list rows from `enum-list-baseline-20260622.json`:

| 200-item case | Generated ops/sec | Runtime ops/sec | Generated gzip |
| --- | ---: | ---: | ---: |
| string3 valid | 79,682 | 69,353 | 404 |
| string8 valid | 63,573 | 58,260 | 433 |
| string32 valid | 34,584 | 60,084 | 556 |
| mixed8 valid | 109,117 | 74,774 | 463 |
| string32 invalid-last | 28,919 | 42,985 | 556 |

Focused enum-list rows after compact generated Set output from `generated-enum-list-set-compact-20260622.json`:

| 200-item case | Generated ops/sec | Runtime ops/sec | Generated gzip |
| --- | ---: | ---: | ---: |
| string8 valid | 72,865 | 67,517 | 433 |
| string32 valid | 74,431 | 71,630 | 704 |
| string32 invalid-last | 50,004 | 44,298 | 704 |
| mixed8 valid | 132,024 | 102,557 | 463 |

Threshold follow-up rows from `generated-enum-list-threshold15-string12-20260622.json` and `generated-enum-list-threshold8-string12-20260622.json`:

| 200-item case | Threshold >15 generated ops/sec | Threshold >8 generated ops/sec |
| --- | ---: | ---: |
| string12 valid | 123,982 | 73,644 |
| string12 invalid-last | 68,118 | 49,463 |
| string16 valid | 66,539 | 74,043 |
| string16 invalid-last | 46,569 | 49,565 |

Interpretation: keep the generated enum-list `Set` threshold at more than 15 all-string values. Lowering it to more than 8 saves 1 compiler gzip byte in the prototype but moves 12-value string enums onto the slower emitted `Set` shape.

Rejected generated enum-list length-bucketed segment scanner from `enum-list-segment-proto-20260622.json`:

| 200-item case | Current ops/sec | Segment ops/sec | Current gzip | Segment gzip |
| --- | ---: | ---: | ---: | ---: |
| string8 valid | 73,510 | 32,514 | 432 | 582 |
| string12 valid | 122,482 | 78,263 | 453 | 611 |
| string16 valid | 74,330 | 37,478 | 629 | 634 |
| string32 valid | 74,307 | 13,744 | 702 | 721 |

The segment prototype used trim bounds plus length-bucketed `startsWith()` checks to avoid valid-path slicing, but it was slower and larger for every tested enum size. The current equality-chain and generated `Set` outputs remain better on Node v26.3.0/macOS.

Focused generated string-list item default rows from `list-variants-next-baseline-20260622.json`, `list-variants-skipmin-default-20260622.json`, and `list-variants-generated-str-default-segment-proto-20260622.json`:

| 200-item case | Baseline generated ops/sec | Min-trim generated ops/sec | Segment-proto generated ops/sec |
| --- | ---: | ---: | ---: |
| str item default | 168,264 | 173,252 | 168,052 |

The accepted min-trim removes a redundant generated `min: 1` item check when a static item default already handles empty segments, shrinking the focused generated validator from 762 raw / 411 gzip bytes to 676 raw / 377 gzip bytes. The broader generated string segment-default prototype was rejected because it exceeded the compiler gzip gate and did not improve the 200-item row.

Focused generated string-list item optional rows from `generated-string-optional-min-trim-paired-20260622.json` and `list-variants-string-optional-min-trim-20260622.json`:

| Case | Old generated | New generated |
| --- | ---: | ---: |
| optional generated raw bytes | 761 | 675 |
| optional generated gzip bytes | 408 | 378 |
| optional generated 200 ops/sec | 169,366 | 169,912 |

The optional min-trim removes the same redundant generated `min: 1` check after the empty-item optional branch. It is primarily an emitted-size win; the paired hot row is effectively tied.

Focused generated `includes` string min-trim rows from `generated-includes-min-trim-paired-20260622.json`:

| Case | Old generated | New generated |
| --- | ---: | ---: |
| list raw bytes | 1,287 | 1,202 |
| list gzip bytes | 562 | 538 |
| list 200 ops/sec | 109,670 | 109,901 |

The `includes` min-trim removes a redundant generated `min` check when the required substring length already implies the minimum string length. Like the optional min-trim, it is primarily an emitted-size win.

Focused generated segment length trim from `generated-segment-length-trim-20260622.json`:

| Case | Old generated | New generated |
| --- | ---: | ---: |
| raw bytes | 1,409 | 1,405 |
| gzip bytes | 599 | 598 |

The segment length trim emits `z - a` instead of `(z - a)` inside generated string-list scanners where operator precedence already makes the parentheses unnecessary.

Focused generated declaration return trim from `generated-types-return-env-20260622.json`:

| Case | Old generated | New generated |
| --- | ---: | ---: |
| declaration raw bytes | 329 | 319 |

Generated `.d.ts` output now returns `Env` directly instead of `Readonly<Env>`. `Env` already has readonly properties, so this preserves the public readonly result shape while reducing generated declaration output and compiler source size.

Focused source byte recovery from `source-byte-recovery-20260622-late.json`:

| File | Old raw/gzip | New raw/gzip |
| --- | ---: | ---: |
| `src/index.js` | 12,853 / 2,898 | 12,805 / 2,888 |
| `src/compiler.js` | 26,008 / 5,493 | 25,980 / 5,486 |
| `README.md` | 4,060 raw bytes | 3,821 raw bytes |
| package dry-run | 12,405 packed bytes | 12,323 packed bytes |

The late byte-recovery pass compacted source formatting in `spec()`, runtime numeric/list helpers, boolean literal returns, the indexed key formatter, compiler optimize-option validation, split infinity literals, and the compiler-only `prop()` ternary. It also trimmed redundant published README prose. Tests and publish validation stayed green.

Accepted aggregate-sentinel cleanup from `runtime-field-guard-before-20260622.json`, `runtime-field-guard-after-20260622.json`, and `generated-list-sentinel-after-20260622.json`:

| Case | Before ops/sec | After ops/sec |
| --- | ---: | ---: |
| runtime medium | 107,489 | 110,746 |
| runtime `process.env` medium | 10,405 | 10,469 |
| runtime enum optional list 200 | 87,352 | 123,820 |
| generated enum optional list 200 | 98,963 | 137,899 |
| generated empty-separator string list 200 | 3,429,121 | 4,676,858 |

Top-level runtime parsing and list helpers now assign parsed values directly and still throw the same aggregate errors before returning on invalid input. Generated list validators do the same for their internal list arrays. This reduced runtime size to 2,853 gzip bytes before the later missing-branch guard, and reduced compiler size to 5,456 gzip bytes.

Accepted missing-branch `NODE_ENV` guard from `missing-defaults-before-20260622.json` and `missing-defaults-after-20260622.json`:

| Case | Before ops/sec | After ops/sec |
| --- | ---: | ---: |
| runtime `process.env` default 40 | 42,559 | 76,171 |
| runtime `process.env` optional 40 | 41,183 | 75,509 |
| runtime `process.env` default 160 | 10,106 | 17,052 |
| runtime `process.env` optional 160 | 10,095 | 17,121 |
| runtime `process.env` devDefault 160 | 10,098 | 10,126 |

Runtime now reads `env.NODE_ENV` only for missing rules that actually use `devDefault` or `testDefault`. Plain-object dev/test-default rows lose a few percent from the extra branch, but real `process.env` default/optional missing schemas improve by roughly 69%-83%.

Rejected generated scanner inequality trim from `generated-qne-trim-20260622.json`:

| Case | Old gzip bytes | New gzip bytes | Old ops/sec | New ops/sec |
| --- | ---: | ---: | ---: | ---: |
| strict num speed | 422 | 423 | 11,268,107 | 11,378,861 |
| strict int scalar | 448 | 449 | 21,426,259 | 22,240,350 |
| strict int list | 674 | 674 | 195,038 | 194,317 |

The `q != length` emission was rejected because it spent compiler gzip budget and worsened scalar generated gzip for only noise-level throughput movement.

Rejected generated strict-number list segment scanner from `strict-num-list-segment-proto-20260622.json`:

| Case | Current ops/sec | Segment ops/sec |
| --- | ---: | ---: |
| short 20 | 568,008 | 566,595 |
| long 200 | 55,775 | 55,096 |
| spaced 200 | 60,323 | 59,134 |
| long decimal 200 | 41,957 | 44,261 |
| invalid-last 200 | 40,743 | 40,760 |

The segment scanner avoided item slicing during syntax validation, but it grew the focused emitted validator from 1,367 raw / 558 gzip bytes to 1,917 raw / 676 gzip bytes and only improved the long-decimal row. It remains a sandbox probe in `sandbox/bench/strict-num-list-segment.mjs`, not a compiler change.

Rejected generated bool-list segment scanner rows from `list-generated-bool-segment-proto-20260622.json`:

| Case | Ops/sec |
| --- | ---: |
| generated list bool 20 | 1,292,179 |
| generated list bool 200 | 135,032 |

The bool segment scanner was rejected because it pushed compiler gzip to 5,611 bytes and the focused rows did not beat the existing generated bool-list path.

Current scalar enum audit rows from `enum-current-after-min-trims-20260622.json`:

| Case | Generated ops/sec | Runtime ops/sec |
| --- | ---: | ---: |
| string2 | 16,457,537 | 14,538,933 |
| string8 | 20,332,104 | 16,148,744 |
| string32 | 17,759,795 | 16,555,925 |
| mixed8 | 19,721,423 | 12,412,353 |

Interpretation: scalar enum speed-mode redesign is not the current best target. Generated scalar enums are ahead in the current short audit, and previous threshold/bucket prototypes remain rejected unless a future runtime changes this shape.

Cold first-validation medians:

| Case | Import ms | Setup ms | First validate ms | Total ms |
| --- | ---: | ---: | ---: | ---: |
| celery generated | 1.676 | 0 | 0.075 | 1.753 |
| celery runtime | 2.069 | 0.135 | 0.188 | 2.394 |
| zod | 27.167 | 3.448 | 1.017 | 31.625 |
| valibot | 6.067 | 0.342 | 0.248 | 6.656 |
| envalid | 7.996 | 0.024 | 0.306 | 8.329 |
| envsafe | 4.754 | 0.038 | 0.152 | 4.942 |
| valienv | 4.029 | 0.020 | 0.112 | 4.161 |
| env-var | 7.159 | 0 | 0.387 | 7.555 |
| safe-env-vars | 7.839 | 0.065 | 0.227 | 8.129 |
| env-type-validator | 28.102 | 0.072 | 0.382 | 28.571 |
| t3-env core | 27.852 | 2.805 | 0.608 | 31.290 |
| env-schema | 38.409 | 0.007 | 2.336 | 40.681 |
| convict | 7.814 | 0 | 1.760 | 9.573 |

Shipped bundle size for the measured small schema:

| Case | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
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

## Current Claims

- Strong claim: generated celery-env is faster than common validator-based env parsing in these local real-schema Node benchmarks.
- Strong claim: generated celery-env has much lower cold first-validation cost than Zod, T3 env, env-schema, and env-type-validator in this benchmark.
- Strong claim: generated celery-env ships a tiny standalone validator for the measured schema.
- Avoid broad 50x-100x claims over Zod. The current measured generated-vs-Zod range in this real-schema report is 1.60x to 7.27x.
- Keep hot validation, cold import/setup, shipped size, and code generation cost as separate claims.

## Implemented Optimizations

- Generated validators now use local registers and a single terminal object-literal return.
- Generated boolean parsing uses compact equality chains; runtime boolean parsing uses shared scalar/list matching.
- Runtime `readList()` uses an `indexOf()` scanner instead of `split()`.
- Runtime and generated bounded strict-int lists use an allocation-light character scanner.
- Generated bounded strict-int lists keep that scanner for static item `default` and `optional` handling.
- Runtime bounded strict-int lists also use that scanner when list items have static `default` or `optional` handling.
- Runtime boolean lists keep the direct scanner for static item `default` and `optional` handling.
- Runtime non-empty-separator enum lists keep the direct scanner for static item `default` and `optional` handling.
- Runtime string lists keep the direct scanner for static item `default` and `optional` handling.
- Generated bounded strict-int scalars use the same allocation-light scanner by default when explicit int32-safe bounds make it semantics-safe.
- `--optimize speed` adds a generated strict `num()` scanner that validates the strict-number grammar before unary numeric conversion.
- Generated constrained string lists use segment scanning by default, avoiding per-item slices until a segment has passed validation.
- Runtime schemas defined with `defineEnv()` cache key/rule entries so `parseEnv()` avoids per-field schema lookups.
- Runtime scalar bool and list dispatch paths are trimmed without changing `boolValue()` or scanner semantics.
- Runtime number parsing and schema-entry lookup are trimmed without changing numeric coercion, strict parsing, or raw-schema validation semantics.
- Runtime and generated finite-number checks use `isFinite()` after unary numeric coercion, preserving semantics while reducing runtime and emitted validator bytes.
- Runtime missing-value handling reads `NODE_ENV` once per missing field and calls optional `requiredWhen` with the real env object, trimming runtime size and modestly improving default-heavy missing paths.
- Runtime strict scalar `int()` and `num()` share a character scanner instead of strict regexes, preserving the strict numeric grammar while improving strict numeric valid paths and most invalid paths.
- Runtime strict `num()` lists use a slice-based fast path that reuses the scalar strict scanner and avoids generic per-item dispatch while preserving static item defaults, optionals, aggregate errors, and `trim: false`.
- Runtime constructor/schema-entry and strict-scanner internals are trimmed after the shared scanner, recovering 15 gzip bytes without changing parser semantics.
- Runtime constructor defaults, schema-entry iteration, key formatting, parser locals, object literals, simple list-dispatch branches, cache branching, and boolean matching are trimmed further, recovering another 36 gzip bytes without changing parser semantics.
- Generated speed-mode strict `num()` scanner output uses compact `else if` control flow, reducing emitted validator gzip without changing the strict grammar.
- Runtime `oneOf()` builds a `Set` for all-string enums with more than four values, accelerating scalar enum checks while leaving tiny and mixed enums on the compact linear path.
- Runtime string, boolean, and non-empty-separator enum lists have direct validation paths that avoid generic per-item dispatch while preserving aggregate errors.
- Runtime unconstrained `list(str(), { separator: "", trim: false })` uses native `split("")`, preserving UTF-16 code-unit semantics while avoiding the generic item loop.
- Generated validators use the same native `split("")` fast path for unconstrained empty-separator string lists.
- Generated validators keep that native `split("")` fast path when unconstrained empty-separator string items have item missing handlers.
- Generated string validators omit redundant `min` checks when a static item missing handler, `startsWith`, or `includes` already implies the minimum length, and string-list scanner length checks avoid unnecessary parentheses.
- Generated large all-string enum lists use a module-level `Set` lookup above the high threshold, improving 32-value valid and invalid-last list rows while leaving small and mixed enum lists on the compact existing paths.
- Generated int32 checks are emitted only when explicit bounds make them safe.
- Medium-sized generated validators use direct object assignment through the default 512-entry split boundary to avoid large local-register sets and a huge final return literal.
- Very large generated validators are split into helper functions that write into one slot array and keep a final public object-literal return.
- Very large split generated validators preallocate the slot array to the schema length, improving the paired 320/640-field split rows in `split-array-prealloc.candidate.json`.
- Generated URL protocol checks use a `switch` over `new URL(value).protocol`, keeping exact URL parsing semantics while improving protocol-heavy URL-list rows and shrinking multi-protocol generated output.
- Optional missing values, including optional `requiredWhen` values, skip redundant generated `undefined` assignments for local-register and split-array targets while object-mode validators keep own returned properties.
- Compiler-internal generated-list helpers share segment header emission and avoid split-chunk bookkeeping, reducing compiler gzip without changing emitted validator output.
- Compiler-only schema assertion, register naming, declaration quoting, whitespace expression emission, and URL-default checks are trimmed without changing emitted validator behavior.
- Compiler-only example/default selection, fail-fast error emission, split-threshold constants, comment emission, and repeated string-min implication checks are trimmed without changing generated validator output.
- Runtime and compiler tag constants are grouped, and compiler-only whitespace-expression emission, enum emitter internals, and cold default-list helper callbacks are trimmed further, reducing gzip while keeping parser and generated-validator semantics intact.
- Compiler-only schema assertion formatting, emitter context construction, and an unused segment-list finisher parameter are trimmed without changing generated validator output.
- Generated final return object literals leave valid identifier keys unquoted while preserving quoted output for keys that need it.
- Generated declaration output also leaves valid identifier keys unquoted while preserving quoted output for keys that need it.
- Generated declaration output returns `Env` directly because the emitted `Env` type already contains readonly properties.
- Published declaration files use compact formatting, reducing `src/index.d.ts` plus `src/compiler.d.ts` from 3,114 to 3,069 raw bytes and the package dry-run from 12,417 to 12,410 packed bytes.
- The hot and real-schema benchmarks include `process.env` rows because real process environment property access behaves differently from frozen plain objects.
- Generated minification is opt-in with `generateValidator(schema, { minify: true })` or CLI `--minify`.
- Nested list codegen is rejected early rather than emitting broken validators or invalid declarations.

## Split Experiment

`sandbox/bench/split-large.mjs` tests an older benchmark-only function-splitting candidate against the current generated validator. The published compiler now uses a lower-allocation split design for very large schemas; this script remains useful for comparing split shapes.

`sandbox/bench/split-v2.mjs` compares the production slot-array split path against unsplit generated validators at configurable schema sizes and thresholds.

`sandbox/bench/generated-shapes.mjs` compares local-register return literals, array-slot storage, and direct object assignment for generated validators. The current production heuristic uses direct object assignment for 128-512 entries when the default split threshold is active; `generated-shapes-no-object-proto-20260622.json` rechecked 128-384 entries by temporarily disabling object mode, and `object-boundary-generated-shapes-20260622.json` confirmed the 512-field boundary.

`sandbox/bench/bool-shapes.mjs` compares generated boolean switch output against compact equality chains. The current generated boolean shape uses the equality chain after the benchmark showed lower generated size and faster bool-heavy validation.

`sandbox/bench/process-env-shapes.mjs` compares plain-object env reads with real `process.env` reads and alternate generated access shapes. On local Node v26, direct `process.env`, default-argument `process.env`, and destructuring remain the same order of magnitude, so the process.env slowdown is treated as an environment-object access cost rather than a compiler shape issue.

`sandbox/bench/strict-numeric.mjs` compares default generated, speed-mode generated, and runtime strict numeric validators across bounded int and strict `num()` decimal shapes.

Latest `split-large` run for the older benchmark-only split shape:

| Count | Candidate | Ops/sec | Raw bytes | Gzip bytes |
| ---: | --- | ---: | ---: | ---: |
| 160 | baseline | 13,223 | 257,766 | 19,132 |
| 160 | split-20 | 18,430 | 177,156 | 18,939 |
| 160 | split-40 | 5,860 | 176,840 | 18,894 |
| 160 | split-80 | 4,074 | 176,682 | 18,659 |
| 320 | baseline | 4,811 | 519,736 | 36,746 |
| 320 | split-20 | 3,376 | 358,926 | 36,339 |
| 320 | split-40 | 1,948 | 357,796 | 36,250 |
| 320 | split-80 | 1,877 | 357,480 | 35,962 |

Interpretation: the old split-20 shape could help at 160 keys, but it regressed 320-key schemas and larger chunks regressed badly. The production split path avoids per-chunk result objects and is thresholded so medium schemas stay on the single-function path.

Production split audits in `split-v2-audit-20260622.json` and `split-v2-high-threshold-audit-20260622.json` show the remaining tradeoff: split output is much smaller and can be faster around 640-1,280 generated fields, while very large unsplit output can regain hot-path speed at the cost of much larger generated gzip. No default threshold change is accepted without stronger cold/import evidence.

An object-target split variant that had helpers write directly into one final object reduced generated bytes but regressed the 320-count row badly on Node v26 (`split-512 320` fell to 3,461 ops/sec while unsplit was 6,220), so the production split path keeps slot-array writes plus one final object-literal return.

## Runtime Matrix

`npm run parity` inside `sandbox/bench` checks Node/Bun behavior for the same npm package. Current local parity passed for both Node and Bun. Bun remains a compatibility and benchmark lane, not the primary product target.
