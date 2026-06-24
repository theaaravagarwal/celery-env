# Contributing

Thanks for taking the project seriously enough to improve it.

## Local Setup

```sh
npm test
npm run size
npm run validate:publish
```

The release gate is:

```sh
npm run ci
```

Local benchmark and competitor-migration labs live under `sandbox/` and
`project/`. They are intentionally ignored so the public repository stays
focused on source, docs, tests, and release metadata.

## Development Rules

- Keep the root package at zero dependencies.
- Do not add install, pack, or unexpected publish lifecycle hooks.
- Keep generated validators standalone.
- Add tests for runtime and generated behavior when changing parsing semantics.
- Keep benchmark claims tied to reproducible local reports and record the
  exact machine/runtime when updating numbers.
- Treat schemas and `requiredWhen` predicates as trusted application code.

## Branch Workflow

- `main` is the releasable branch.
- Use `feature/<short-name>` for normal feature work.
- Use `fix/<short-name>` for focused bug fixes.
- Use `perf/<short-name>` for benchmark-driven optimization work.
- Use `docs/<short-name>` for documentation-only changes.
- Keep local benchmark artifacts, generated variants, and competitor fixtures
  out of commits.

## Benchmark Updates

Regenerate local benchmark reports with:

```sh
cd sandbox/bench
npm run report
```

Only update README ratios from fresh local reports, and include the runtime,
OS, CPU, and command in the commit or PR notes.

## Pull Requests

Open PRs with:

- What changed.
- Why it changed.
- Tests or benchmark commands run.
- Any behavior or compatibility risk.
