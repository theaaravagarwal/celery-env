# Security

`celery-env` is designed to keep the published package small and auditable:

- The root package has zero runtime dependencies.
- The package has no consumer install hooks or pack hooks. Its only publish
  lifecycle script is `prepublishOnly`, which runs the local verification gate.
- Runtime validation does not include rejected environment values in error messages.
- Generated validators escape schema keys and validate generated function names.
- Environment reads require own properties, so inherited object-prototype keys do
  not masquerade as environment variables.
- Generated `requiredWhen` predicates receive an own-property environment facade
  instead of the raw inherited object.
- `__proto__` schema keys are treated as data properties instead of prototype mutation.
- Publish validation uses `npm pack --ignore-scripts`; local hardening checks
  reject consumer install hooks, pack hooks, and unexpected publish hooks.
- CLI generation refuses symlink outputs and only overwrites existing generated
  files when `--force` is passed.

## Audit Commands

Run the local hardening checks before publishing:

```sh
npm run security:scan
```

The benchmark workspace has separate development dependencies. Audit them with:

```sh
npm run local:audit:bench
```

The root package intentionally has no lockfile because it has no dependencies.
`npm audit` requires a lockfile, so root-package supply-chain checks are covered
by `scripts/security-scan.mjs` and `scripts/validate-publish.mjs`.

CI runs the same root hardening scan on Node 18, 20, 22, and 26. Local
benchmark and migration labs can be audited separately before changing public
claims.

## Hardening Findings

The dependency audit did not find known vulnerable packages. The hardening pass
did find code-level weakness classes before release, and they are now covered by
tests:

- Prototype-polluted option objects could make missing values optional or inject
  defaults. Specs now use null-prototype rule objects and own-property checks.
- `requiredWhen` predicates could observe inherited env properties. Predicates
  now receive an own-property env facade.
- Generated `json()` validation could be bypassed through inherited
  object/array keys. JSON parse success no longer depends on target-slot
  sentinel values.
- Generated function names missed some strict-mode forbidden identifiers. Those
  names are now rejected.
- Non-expression `requiredWhen` functions could emit invalid generated code.
  They are now rejected at generation time.
- Non-JSON-stable `json()` defaults could diverge between runtime and generated
  validators. They are now rejected for generated output.
- CLI generation could overwrite requested output paths. It now requires
  `--force` and refuses symlink outputs.

## Trust Boundary

Schema files and `requiredWhen` predicates are application code. The CLI imports
the schema file you pass with `--schema`, and generated validators serialize
`requiredWhen` function source. Only run generation against schema files and
predicates you trust; do not generate validators from untrusted schema packages.

Generated `.env.example` output is documentation. It escapes unsafe key/value
line breaks, but it still reflects schema-provided `example`, `default`,
`devDefault`, `testDefault`, `desc`, and `docs` metadata. Do not put real
secrets in schema defaults or examples that you plan to publish.

## Reporting

Report security issues privately through GitHub Security Advisories:

https://github.com/theaaravagarwal/celery-env/security/advisories/new

Include a minimal reproduction, the affected version, and whether the issue
affects runtime validation, generated validators, or CLI generation.
