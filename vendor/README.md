`lnjs-core-0.8.1.tgz` is built from the local checkout of https://github.com/mrmrs/ln.js at `/Users/mrmrs/p/ln.js`. It contains the fork's source, CommonJS build, bundler ESM build, types, Boolean algorithm notes, and README. The application lockfile pins its integrity; installation does not depend on a sibling checkout or an unpublished registry version.

Refresh after editing the fork:

```sh
node scripts/update-ln-fork.mjs
# Or specify another checkout:
node scripts/update-ln-fork.mjs /path/to/ln.js
```

The refresh script runs the fork tests before packing and installing. Commit the tarball and application lockfile together. Publish a versioned fork package later if distribution through a registry is desired; avoid editing node_modules.

The app uses 0.8.2, described below. The retained 0.6.0, 0.7.0, 0.8.0 and 0.8.1 artifacts are reproducible baselines for the Boolean clipping, contour, and large-grid comparisons; they are not installed by the app.

The app now uses `lnjs-core-0.8.2.tgz`, a large-grid visibility update built in
isolation from the retained 0.8.1 artifact. Its exact source delta is
[`patches/large-grid-visibility.patch`](patches/large-grid-visibility.patch).
Rebuild with `node scripts/build-grid-fork.mjs`; see
[`docs/large-cube-grids.md`](../docs/large-cube-grids.md) for correctness coverage,
benchmarks, and remaining budgets. Port that patch into a sibling checkout
before refreshing via `update-ln-fork.mjs`.
