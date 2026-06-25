# Release Checklist

Use this when publishing a new npm version.

## Before Publishing

1. Update `package.json`.
2. Add a matching `CHANGELOG.md` section.
3. Refresh package metadata tables if packed size or file count changed.
4. Run:

```sh
npm run release:check
npm run ci
```

`release:check` verifies the changelog entry, checks that the version is not
already on npm, and dry-runs the package contents.

## Publish

```sh
npm publish --access public
```

If npm asks for browser or one-time-password authentication, finish that prompt
in the browser and rerun the same command if needed.

## After Publishing

1. Verify npm:

```sh
npm view celery-env version dist.unpackedSize dist.fileCount
```

2. Smoke-test a fresh install:

```sh
npm install celery-env@latest --prefix /tmp/celery-smoke
```

3. Tag the release:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. Create a GitHub Release from the tag with the changelog bullets.

Keep publishing manual until npm provenance and release permissions are designed
explicitly.
