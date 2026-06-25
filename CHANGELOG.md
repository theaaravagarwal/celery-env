# Changelog

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
