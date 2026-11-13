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

All existing budgets remain unchanged. The editor's full 30³ range can now render this fixture, but 36³ still intentionally stops at the candidate budget. Dense scenes remain expensive, and fills retain their separate 100,000 host-triangle limit (12 triangles per cube). This change does not claim unrestricted grid sizes or inexpensive heavy fills. The first navigation preview also has to sample the full cached source-path stream; subsequent navigation previews reuse the bounded sample. In this run, first previews took 12–15 ms and cached previews took 8–11 ms across the successful grid sizes.

## Correctness and provenance

`tests/render.test.cjs` checks edge-set equivalence, corner sharing, behind-segment rejection, exact full-coverage early termination, preservation of a narrow visible slit, a full 30³ render, and 1,200 deterministic interval comparisons against the retained 0.8.1 renderer across orthographic, perspective, transformed-shape, and near-plane cases. The 57 existing ln.js fork tests also passed in the isolated build.

`vendor/lnjs-core-0.8.2.tgz` is built from the retained 0.8.1 artifact plus `vendor/patches/large-grid-visibility.patch`. Its source is included in the tarball. Run `node scripts/build-grid-fork.mjs` to reproduce it using the repository's TypeScript dependency, then install the artifact and run the app tests. No sibling checkout is required or modified. Apply this patch to the sibling fork before using the general `update-ln-fork.mjs` workflow, otherwise refreshing from an unpatched checkout would remove the optimization.
