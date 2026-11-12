Current package: **0.8.0**, with [analytic intersection contours](boolean-contours.md). The implementation record below describes the 0.7.0 clipping checkpoint; contour support and current validation are documented in the linked report.

The app now uses the maintained ln.js fork’s continuous occlusion engine. The fork is cloned at `/Users/mrmrs/p/ln.js`; the app installs its version 0.7.0 from [a vendored package](../vendor/README.md). All 14 original diagnostic cases pass. The original [review](occlusion-review.md) and [failing results](occlusion-audit-results.txt) remain as historical evidence; [current results](occlusion-audit-fixed.txt) describe the implemented behavior.

The changes are local. No remote branch, registry package, or website was published.

Implemented in the fork:

- Continuous visible/hidden segment intervals for triangle meshes and boxes, with a camera-specific projected spatial index. Near-plane/frustum clipping happens before perspective division. Clipped runs stay separate, and collinear visible runs collapse to endpoints.
- Analytic sphere and transformed-ellipsoid visibility intervals. Tangency and surface/near-plane events partition the projected segment. Scene path ownership prevents the chords approximating a sphere’s own surface lines from incorrectly hiding themselves.
- Correct world ray parameters through nested, nonuniform, and reflected transforms; singular transforms are rejected.
- Parallel-safe slab intersection, closed cylinder caps and cone bases, stable quadratic roots, and shear-space triangle intersections without a fixed minimum triangle area.
- Bounded any-hit queries, a binned surface-area-heuristic object BVH, early exit, and traversal counters. Internal nodes do not retain duplicated primitive arrays. Bounding-box query scratch storage avoids per-node result allocation in traversal.
- Event-based Boolean segment clipping for nested analytic solids and closed meshes, with exact operand-stroke boundary splits. Subpixel cuts, depth-order crossings, coincident boundaries, internal union seams, and curved-source ownership have dedicated coverage. [Boolean implementation and measurements](boolean-clipping.md). The separate ray API retains bounded iterative traversal.
- Circular rim paths for closed cylinders and cone bases, with analytic self-visibility of convex surface-owned strokes. SVG serialization suppresses fragments that collapse to dots after rounding.
- Correct vector squared length, safer normalization, and deduplicated mesh edges. Library consumers can request crease or silhouette edges.
- Bounded Cartesian height fields with a shared mesh for paths and visibility, replacing the upstream hard-coded radial paths and fixed-distance ray marcher. Grid divisions are configurable in the library from 4 to 512; the app currently uses 64.
- Modern package builds, reproducible dependency locks, 40 regression tests, a benchmark harness, a visual comparison generator, and a GitHub Actions test matrix. CI is configured for Node 20/22/24 but has not run remotely; local validation used Node 24.15.0.

Implemented in the app:

- The fork’s continuous renderer replaces the old world-space visibility sampling in `projectPaths`.
- Orthographic cameras use parallel queries. Visibility stops at the near plane rather than allowing clipped geometry between the eye and near plane to hide paths.
- Quality presets now set projected curve/refinement tolerance: Fast 1 px, Fine 0.25 px, Precise 0.1 px, Ultra 0.025 px. The old `step` field remains valid for loading saved scenes; it no longer controls exact triangle/sphere visibility.
- Export derives its curve tolerance from physical page dimensions and half the plot cleanup error setting, subject to a positive numerical floor. This allocates a practical approximation target; it is not a mathematical total-error guarantee.
- Mesh/box/sphere/Boolean scenes render at final quality in one pass. Only visible standalone tessellated cylinders/cones need progressive refinement; consumed Boolean children no longer trigger an extra pass.
- Fills on the same host share visibility scenes by surface/volume policy, and surface fills reuse host meshes. Intentional host exclusion for volume marks is preserved.
- The fill BVH uses the fork’s triangle kernel and scale-aware near-ray cutoff, so fill containment and rendering no longer reject triangles at different fixed size thresholds.
- Height fields delegate to the fork rather than maintaining a second intersection algorithm.
- The package refresh script tests the sibling fork, packs it, and updates the local artifact and lockfile. The packed source is reviewable and installs without a sibling checkout.

[View the side-by-side SVG comparison](occlusion-comparison.svg). Both columns use the same scene descriptions. The top row exposes thin blockers missed or exaggerated by upstream sampling. The other rows exercise nonuniform transforms and ellipsoid/box overlap. The SVG was rendered to a browser screenshot and visually inspected. The application also has a browser fixture covering scaled solids across four cameras and physical SVG export.

Measured performance, from [the captured benchmark](occlusion-benchmarks.txt):

| Fixture | Upstream | Fork |
|---|---:|---:|
| 216 cubes, 800 px perspective, complete render | 113.35 ms | 13.66 ms |
| Vertices in that output | 172,252 | 2,706 |
| Dense-cube primitive tests, 5,000 visibility queries | 66,852 | 11,169 |
| Dense-cube query time | 2.34 ms | 2.29 ms |
| Dense-cube tree construction | 1.37 ms | 5.34 ms |
| Primitive tests for geometry beyond camera, 5,000 queries | 20,000 | 0 |

Timings are the median-query-time run of five measured repetitions after warm-up, on the local Node 24.15.0 environment. The complete-render example is about 8.3× faster, but the lower primitive count does not imply a universal ray-query speedup; tree construction is more expensive. The old and new render outputs intentionally differ in path boundaries and vertex counts. This is a specific benchmark, not a promise for every scene or device.

Validation completed locally:

- 40 fork tests, including 2,000 seeded BVH/brute-force ray comparisons, scale sweeps, shared triangle edges/vertices, Boolean boundaries, perspective intervals, thin blockers, ellipsoids, and height-field boundary roots.
- 29 app engine/integration tests.
- Six browser scenarios covering Boolean final-pass views/export, layer deletion, scaled-solid views/export, import/persistence/export cancellation, six worker-backed views, and text/error recovery.
- All 14 original diagnostic cases, plus confirmation that beyond-eye primitive tests dropped to zero.
- App lint and production build, package packing, and a Node ESM import smoke check.

Known boundaries and next investments:

- Standalone cylinders and cones use tolerance-driven tessellation for vector visibility. Within supported Booleans their occlusion uses analytic surface events. Their drawing paths remain polylines.
- Supported Booleans now use analytic surface events and make no fallback sampling queries. This is floating-point geometric clipping, not certified exact arithmetic. It trims existing operand strokes but does not generate new surface-intersection curves. Complex curved CSG can be slower; see the Boolean measurements. Unsupported Boolean operands fail explicitly. Other arbitrary custom shapes retain projected sampling.
- Height fields use piecewise-planar grids. Arbitrary high-frequency or discontinuous functions can need higher resolution; they are not guaranteed analytic surfaces. Boolean use of height fields also needs an explicit closed-solid boundary policy.
- Mesh containment assumes closed geometry. The fork does not repair arbitrary nonmanifold or self-intersecting imports.
- The tolerance policy and watertight kernel pass the tested scale/edge cases; they are not a proof of correctness for every degenerate floating-point input. Adversarial geometry fixtures should continue to grow.
- Crease/silhouette edge selection is available in the library; a dedicated app control is still future work. WASM/GPU acceleration and instance-bound refitting remain optional future optimizations, not dependencies of this release.

These changes substantially improve the correctness, size, and speed of plotted linework. A “world-leading” or universally perfect claim should wait for a much larger shared scene corpus and real plotter output from other users.
