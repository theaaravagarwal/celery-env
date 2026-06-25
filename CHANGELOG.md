# Changelog

## 0.1.5

- Made `celery-env infer` print a short success summary with scanned files,
  discovered variables, and the next generate command.
- Improved starter schemas with source fallback defaults, common enum hints,
  bool-like `1`/`0` inference, expanded default scan paths, and more readable
  generated schema formatting.

## 0.1.4

- Improved `celery-env infer` to infer `oneOf(...)` from safe example/sample
  env values and `list(oneOf(...))` for safe string lists.
- Kept local `.env` and `.env.local` values out of generated enum literals.

## 0.1.3

- Added `celery-env infer` for generating starter schemas from existing env
  files and static source references.
- Hardened inference scans with symlink refusal, resource caps, packed smoke
  coverage, and package-size budgets.

## 0.1.2

- Refreshed the project logo and published brand asset.
- Added `celery-env --version` and `celery-env -v` for CLI debugging.

## 0.1.1

- Generated validators now throw EnvError-shaped errors with an `errors` array.
- Generated list validation now reports indexed keys such as `IDS[1]`.
- Invalid JavaScript option shapes fail earlier with clearer TypeErrors.
- Added TypeScript compile-time coverage for the public runtime API.

## 0.1.0

- Initial public package shape.
- Runtime env parser with strings, numbers, booleans, enums, URLs, JSON, lists,
  defaults, env-specific defaults, and conditional requirements.
- Compiler that emits standalone validators and declaration files.
- JSON Schema export for ecosystem tooling.
- CLI generation with `.env.example` support.
- Security hardening for prototype pollution, generated identifiers,
  `requiredWhen`, JSON defaults, and CLI overwrites.
- Benchmark suite covering real schemas, real `process.env`, cold start, bundle
  size, and popular env-tool competitors.
- Migration fixture comparing Celery against Zod, Valibot, Envalid, Envsafe,
  env-var, and T3 Env Core.
