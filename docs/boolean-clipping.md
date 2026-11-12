The app now installs fork **0.7.0**, which replaces Boolean visibility sampling with surface-event clipping. Nested union, intersection and difference operations support cubes, spheres/ellipsoids, closed cylinders/cones, closed consistently wound meshes, and affine instances. Supported Booleans make zero fallback sampling queries and produce the same clipping at Fast and Ultra quality.

[View the before/after SVG](boolean-clipping-comparison.svg). The first detail shows a 0.0002 px slit that the old engine missed entirely. The second shows a near-tangent sphere intersection whose boundary was quantized by sampling. The third shows continuous surface strokes replacing fragmented curved linework. Detail views magnify the already-rendered output, preserving the original camera and sample spacing.

The core changes live in the fork's `src/solid.ts`, `src/polynomial.ts`, `src/csg.ts`, and `src/visibility.ts`. A viewing-ray pencil turns each plane/quadric boundary into a polynomial in ray depth. Tangencies, pairwise surface-depth crossings, source crossings, and near-plane crossings partition each stroke into cells with stable boundary order. The Boolean expression classifies depth slabs within those cells. Mesh edge guards retain finite-triangle boundaries. Root solving uses double precision, direct quadratic roots, and derivative-based isolation for higher degrees.

Operand strokes split at geometric boundary roots instead of being chopped every 0.01 world units. Source provenance survives nested transforms and trimming. Curved-source depth handling prevents inward polyline chords from hiding themselves; deterministic equal-root handling keeps sphere equators continuous. Coincident subtraction cancels strokes, zero-volume intersections disappear, identical polylines deduplicate, and internal union seams do not leak visibility rays.

The app's worker now recognizes Booleans as final-quality geometry, including their consumed curved children. It avoids an identical second render. Browser coverage exercises the actual worker, four viewports, and physical SVG export.

Measured performance compared with the previous 0.6.0 artifact:

| Fixture | 0.6.0 sampled | 0.7.0 events | Output paths, old → new |
|---|---:|---:|---:|
| subpixel slit | 7.63 ms | 4.69 ms | 128 → 192 |
| sphere lens | 48.68 ms | 1.14 ms | 128 → 128 |
| curved source | 21.07 ms | 417.94 ms | 2227 → 64 |

[Raw measurements](boolean-clipping-benchmarks.json) report the median of five measured runs after warm-up, using Node 24.15.0 and an 800 px orthographic viewport. The curved-source fixture is substantially slower despite producing much cleaner geometry. Event construction currently considers all surface pairs, so complex curved CSG and dense meshes are the main performance follow-up. These measurements are not a universal speedup claim.

Validation:

- 40 fork tests, including 19 new Boolean tests. Independent depth-slab references check 10,800 nested/transformed camera classifications plus 500 near-plane classifications.
- Narrow cuts and lenses, coincident and touching solids, internal seams, closed mesh equivalence, source-curve/rim continuity, and scale sweeps from 1e-6 to 1e6.
- 29 app tests, six browser scenarios, lint, and the production build.
- Before/after SVG and the four-camera Boolean scene visually inspected in Chrome.

Boundaries:

- “Exact” refers to geometric event clipping instead of fixed-step searching. This remains a floating-point implementation, not certified exact arithmetic for every degenerate input.
- Existing curved strokes remain polylines. The engine does **not yet generate new intersection contours**, such as the circular seam where a cylinder cuts a sphere. That is the next substantial geometry feature.
- Mesh edge incidence/winding are validated. Open and unsupported Boolean operands fail with an explicit error. Self-intersecting meshes and inconsistent shell nesting are not repaired or fully validated.
- Pairwise event work is quadratic in boundary count. Work budgets throw explicitly; large Boolean meshes may need a higher budget or simplification. Spatial pruning/caching of event candidates is the next performance investment.
- Arbitrary custom shapes outside Booleans retain the existing sampled fallback. Standalone cylinders/cones retain tolerance-driven tessellation.

All changes are local. Nothing has been pushed, published to a registry, or deployed. The vendored package includes the fork's source and detailed algorithm notes. [Refresh instructions](../vendor/README.md) reproduce the package installation.
