# Release Checklist

Use this checklist before making the repository public or publishing to npm.

## Repository

- Replace `docs/assets/celery-mark.svg` with the final logo if desired.
- Add screenshots or terminal captures under `docs/assets/`.
- Review README badges and switch the private pre-release badge to the npm
  version badge after publish.
- Confirm the GitHub repository is public only when launch-ready.
- Confirm repository topics and description are still accurate.

## Validation

```sh
npm run ci
cd sandbox/bench
npm run report
```

After regenerating benchmarks, sync only the headline numbers that changed:

- README benchmark scorecard.
- `PERFORMANCE_SUMMARY.md`.
- `BENCHMARK.md` current local report section.

## Package

```sh
npm run validate:publish
npm pack --dry-run
```

The root package must stay dependency-free, and the packed file list should stay
limited to package source, declarations, CLI, README, SECURITY, and LICENSE.

## Publish

```sh
git tag v0.1.0
git push origin v0.1.0
```

```sh
npm publish --access public
```

After publish:

- Update README status badge to npm version.
- Create a GitHub release for the published tag.
- Re-run `gh repo view` and verify homepage/topics.
