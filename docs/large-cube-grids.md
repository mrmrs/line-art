# Larger cube grids

The former renderer failed before reaching the editor's 30 × 30 × 30 maximum. A uniform 24³ grid exceeded the 20-million occlusion-candidate budget. At 28³ and above, the twelve separate edge paths per cube exceeded the 250,000 source-path budget before rendering even began.

Two changes address the actual work rather than raising limits:

- Cube grids emit four connected, edge-disjoint trails using eight shared corners per cube. All twelve original edges remain present exactly once. Analytic cube geometry and fill hosts are unchanged. A 30³ grid now has 108,000 source paths instead of 324,000, and 432,000 vertex references instead of 648,000; only eight distinct corner vectors are allocated per cube instead of twenty-four.
- The vendored visibility renderer indexes conservative minimum projected depth, rejects individual triangle bounds outside a segment, visits nearer child nodes first, and stops once accumulated hidden intervals exactly cover the full segment. It never bridges a gap or changes the clipping predicates. Triangle depth is affine in normalized device coordinates for both orthographic and perspective projections, so a face entirely behind both endpoints cannot hide any portion of the segment. Depth pruning includes a floating-point allowance.

## Measurements

Local Node measurements with separated uniform cubes, a 1024 × 1024 render, an orthographic camera at `[30,24,18]`, and a page fitted to the grid:

| Grid | Cubes | Before, cold exact render | After, cold exact render | After, second camera render |
| --- | ---: | ---: | ---: | ---: |
| 20³ | 8,000 | 2,099 ms | 916 ms | 865 ms |
| 24³ | 13,824 | Candidate-budget error | 1,755 ms | 1,590 ms |
| 28³ | 21,952 | Source-path-budget error | 2,821 ms | 2,699 ms |
| 30³ | 27,000 | Source-path-budget error | 3,735 ms | 3,769 ms |
| 36³ | 46,656 | Source-path-budget error | Candidate-budget error | — |

These are representative measurements, not timing guarantees. Reproduce with `node scripts/benchmark-cube-grid.mjs` and `node scripts/benchmark-cube-grid.mjs --baseline`; raw measurements are in `docs/cube-grid-benchmarks.json`. The baseline command uses the retained 0.8.1 renderer and original cube edge representation. Generation alone took 9–39 ms, so cell generation was not the dominant issue.

The 0.8.2 optimization kept the original budgets unchanged. At that stage, the editor's full 30³ range could render this fixture, while 36³ still stopped at the candidate budget. The tiled renderer described below extends those limits. Dense scenes remain expensive, and fills retain their separate 100,000 host-triangle limit (12 triangles per cube). This change does not claim unrestricted grid sizes or inexpensive heavy fills. The first navigation preview also has to sample the full cached source-path stream; subsequent navigation previews reuse the bounded sample. In this run, first previews took 12–15 ms and cached previews took 8–11 ms across the successful grid sizes.

## Correctness and provenance

`tests/render.test.cjs` checks edge-set equivalence, corner sharing, behind-segment rejection, exact full-coverage early termination, preservation of a narrow visible slit, a full 30³ render, and 1,200 deterministic interval comparisons against the retained 0.8.1 renderer across orthographic, perspective, transformed-shape, and near-plane cases. The 57 existing ln.js fork tests also passed in the isolated build.

`vendor/lnjs-core-0.8.2.tgz` is built from the retained 0.8.1 artifact plus `vendor/patches/large-grid-visibility.patch`. Its source is included in the tarball. Run `node scripts/build-grid-fork.mjs` to reproduce it using the repository's TypeScript dependency, then install the artifact and run the app tests. No sibling checkout is required or modified. Apply this patch to the sibling fork before using the general `update-ln-fork.mjs` workflow, otherwise refreshing from an unpatched checkout would remove the optimization.

## Half-million-cell grids

The editor now accepts up to 256 cells on each cube-grid axis, with a combined
scene budget of **524,288 generated cells**. This includes 64 × 64 × 128. Line-grid
axes now reach 500 (250,000 lines before segmentation). Counts above 30,000 show
an explicit time and memory warning; these are desktop-scale jobs, not a promise
that every phone can process them. Each visible camera has its own render worker; use a single view for the largest scenes to avoid multiplying memory use.

Scenes containing more than 30,000 shapes use exact tiled projection. Conservative
projected box bounds assign each shape to overlapping screen tiles. Each tile
clips against its own frustum and runs the existing continuous hidden-line solver;
only that tile's source paths and occluding faces are resident at once. This
avoids first allocating millions of full-scene edge paths and projected faces.
A stroke on a shared tile boundary has one owner. Ordinary strokes crossing a
boundary are split there; the export's existing cleanup and joining can reconnect
touching strokes. No geometry is sampled or discarded from exact output.

Navigation samples a bounded set of source shapes before generating their paths,
so it does not materialize the full edge stream. Exact renders and exports report
tile progress. Viewport work can run for up to ten minutes and can be cancelled
by terminating the worker; export already supports cancellation without a short
timeout. The interface remains on the main thread.

A local full-view 1024 × 1024 orthographic measurement of separated, uniform
64 × 64 × 128 cubes (`far: 1000`, eye `[100,80,60]`, orthographic size `51.2`):

| Operation | Result |
| --- | ---: |
| Exact render | 96.2 seconds |
| Complete optimized SVG export, including render | 97.5 seconds |
| Raw visible paths | 125,225 |
| Cleaned export strokes | 105,274 |
| SVG size | 8.72 MB |
| Navigation preview after preparation | 47 ms, 6,000 segments |
| Process RSS at completion | 1.85 GB |

These are measurements on this machine, not duration or memory guarantees.
Run `node scripts/benchmark-large-grid.mjs` for the full fixture; pass three
counts to measure another configuration. The full benchmark is deliberately not
part of routine tests. Browser coverage checks the actual half-million-cell job's
warning, tile progress, and cancellation; unit tests compare tiled and ordinary
line coverage under transforms, perspective, near-plane clipping, and direct
paths, and verify fill passes do not emit occluder outlines.

Limits remain explicit: at most 500,000 output paths and 2,000,000 vertices,
1,000,000 projected occluder triangles per tile, and bounded occlusion work.
Dense grid fills still have the existing 100,000 host-triangle limit (12 per cube),
so a half-million-cell grid with fills is not supported. Small filled objects can
coexist with a large unfilled grid through separate tiled visibility passes.
Larger scenes may require increasing the camera's clipping range and orthographic
size to frame the entire design. The default clipping range is unchanged.
