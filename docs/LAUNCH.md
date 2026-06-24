# Launch Narrative

Celery is for teams that want env validation to feel boring in production:
schema-authored, type-aware, benchmarked, and small enough that it does not
matter at startup.

## Positioning

Most validator-first env tools optimize for authoring convenience. Celery keeps
that convenience, then compiles the schema into plain JavaScript so boot time is
closer to hand-written config code.

Use this framing:

- "Generated env validation for performance-sensitive Node apps."
- "A schema at author time, standalone JavaScript at runtime."
- "Zero runtime dependencies in generated mode."

Avoid this framing:

- Broad claims that Celery is faster than every validator in every workload.
- Claims that general-purpose validators are obsolete.
- Security claims beyond the documented trust boundary.

## Proof Points

- Generated validator for the measured small schema: 526 gzip bytes.
- Valid real-schema geometric mean: 1.50x over the best external competitor.
- Real `process.env` geometric mean: 1.14x over the best external competitor.
- Invalid real-schema geometric mean: 1.32x over the best external competitor.
- Migration fixture: generated Celery uses 163 maintained env LOC and zero
  runtime dependencies.
- Full local gate: `npm run ci`.

## Repository Checklist

- Add final logo and screenshots to `docs/assets/`.
- Replace the README placeholder mark if desired.
- Confirm package metadata points at the final GitHub URL.
- Run `npm run ci`.
- If the local benchmark lab is present, run `npm --prefix sandbox/bench run report`
  before changing benchmark claims.
- Publish from a clean git commit.

## Screenshot Ideas

- Terminal screenshot of `npx celery-env generate`.
- Before/after config migration from the local `project/` fixture.
- Benchmark scorecard from the local `sandbox/bench` report.
- Generated `src/env.mjs` beside the authored `env.schema.mjs`.
