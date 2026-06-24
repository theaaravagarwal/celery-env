# Contributing

Thanks for taking the project seriously enough to improve it.

## Local Setup

```sh
npm test
npm run size
npm run validate:publish
```

The full release gate is:

```sh
npm run ci
```

Benchmark dependencies live under `sandbox/bench` so the root package stays
dependency-free.

## Development Rules

- Keep the root package at zero dependencies.
- Do not add install, pack, or unexpected publish lifecycle hooks.
- Keep generated validators standalone.
- Add tests for runtime and generated behavior when changing parsing semantics.
- Keep benchmark claims tied to checked-in artifacts.
- Treat schemas and `requiredWhen` predicates as trusted application code.

## Benchmark Updates

Regenerate the public benchmark artifact with:

```sh
cd sandbox/bench
npm run report
```

Only update README ratios from `sandbox/bench/artifacts/report.md` or
`sandbox/bench/artifacts/report.json`.

## Pull Requests

Open PRs with:

- What changed.
- Why it changed.
- Tests or benchmark commands run.
- Any behavior or compatibility risk.
