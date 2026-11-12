# Code audit — 12 September 2026

Scope: rendering, geometry generation, caching, fills, projection, SVG export, worker scheduling, scene persistence, and the controls that connect them. This is a source audit with executable geometry regression tests, not a browser compatibility certification or a physical plot test.

## Initial changes implemented

| Finding | Change | Verification |
| --- | --- | --- |
| Fill/BVH cache identity used triangle count, allowing changed geometry to reuse old fills and occlusion | Compare cached source triangle identity and transform; invalidate dependent fills on a host change | Warm-cache output equals a cold render after resizing and moving a cube |
| Every filled camera render transformed/copied the host triangles before checking the cache | Transform and rebuild the host only on a cache miss | Same cache regression; improvement follows removal of the per-render copy, not a measured whole-scene speed claim |
| Parsed mesh cache ignored changed data under the same node ID | Track source format/data; clear mesh, host and dependent fills on replacement; prune source records | Replace OBJ geometry without replacing its ID; compare warm/cold renders |
| Per-node cache clearing missed primitive/extrusion keys | Clear prefixed entries as well as the direct mesh key | Covered by render cache checks |
| Single-pen export ignored Optimize; pen-2-only fills could be folded into pen 1 | Route every export through the per-pen path pipeline and apply ordering to every group | Pen 1 outlines and pen 2 fills both appear with physical SVG dimensions |
| Quadratic exhaustive endpoint search during path ordering | Balanced endpoint k-d tree with exhausted-subtree pruning; stable ties and reversal semantics | Exact equality to an exhaustive reference on seeded data and coincident endpoints; input is not mutated |
| Orthographic output stretched with rectangular viewports/paper | Scale horizontal projection extent by aspect ratio, for scene shapes and direct paths | Square proportions on a 320×160 viewport and explicit line-grid coordinates |
| Rays through a triangulated face diagonal counted two crossings | Add distinct-surface crossing queries for containment and volume hatch pairing | Cube center classified inside; hatch spans both faces |
| Parallel slab tests could divide 0 by 0 | Explicit parallel-axis handling | Boundary/parallel ray checks |
| Poisson stippling changed after rebuilding caches or switching render contexts | Supply deterministic shared PRNG, currently fixed seed 42 | Independently regenerated fill paths are equal |
| Cube-grid expressions compiled inside the cell loop; noise seed cache grew indefinitely | Bounded expression and noise caches (64 entries each); cache syntax failures during editing | Expression presence semantics and noise stability after eviction |
| Dense path concatenation used argument spreads | Append in loops to avoid engine argument-count limits | Type/build checks; no claim of a separate dense-scene benchmark |
| One-point Fibonacci sphere emitted NaN; negative grid spacing could loop forever | Finite singleton placement and positive spacing fallback | Explicit edge-case tests |
| Displayed render duration excluded SVG serialization | Include serialization in elapsed time | Source inspection/build |

## Initial audit validation and limits

Run `npm test`, `npm run build`, and `npm run lint`. Eleven regression tests pass. No new test dependency was installed: the runner uses existing TypeScript plus Node's test runner, removing compiled temporary files afterward.

On this machine, the synthetic 10,000-stroke fixture measured roughly 324 ms for the exhaustive reference and 61 ms for the indexed implementation (~5.3×). This measures ordering only, includes tree construction, and verifies identical resulting order. It is not a measured speedup for the whole app or a reduction in actual plotting time. Spatial search still has pathological cases; tree construction uses recursive sorting, O(N log² N), and worst-case total queries remain O(N²).

Build/lint passed before changes as well. Vite still reports a main bundle above 500 kB. Existing uncommitted dependency, ESLint, Node-version, and render-worker/hook changes were preserved; the package change added here is the test script.

Visible corrections: rectangular orthographic compositions now preserve proportions and may frame differently; stipple patterns become repeatable; formerly missing diagonal hatches appear; single-pen export stroke order now responds to Optimize. Triangle crossing tests assume closed manifold meshes and do not provide a robust classification for arbitrary tangent/boundary/non-manifold cases.

## Follow-up implementation — all eight items addressed

| Audit item | Resolution | Verification |
| --- | --- | --- |
| 1. Responsive export and scheduling | Dedicated export worker, per-pen/stage progress, cancel by worker termination, visible failures, and a ready-to-download/copy snapshot. Preview has Cancel/Retry and a 30-second watchdog. A single-owner latest-request scheduler invalidates stale draft/final continuations. Scene messages carry revisions and are sent only when nodes change. | Scheduler interleaving regression; browser export/download/cancel; worker-message counts during camera changes. |
| 2. Direct-path clipping and visibility | All geometry uses homogeneous six-plane clipping before perspective division. Direct SVG lines, line grids, and slices have See-through / Hide behind objects controls. Visibility and subdivision share a bounded sampling budget. | Behind-camera and crossing-frustum fixtures; a line behind a cube disappears only in occluded mode. |
| 3. Imported scene persistence | Atomic IndexedDB transactions store document state and mesh/source-SVG assets. Writes are serialized; failures are visible. Portable, versioned `.lnscene` files include assets. Import remaps the complete Boolean reference graph and rejects missing children/cycles/deep recursion; it is undoable. | IndexedDB round-trip, version rejection, graph remapping, cycle rejection, import/undo/redo; actual browser mesh reload through the file picker. |
| 4. Surface stippling | Area-weighted barycentric candidates on actual triangles, deterministic spatial rejection, and tangent-plane marks. Flat meshes are supported. Surface fills use the host triangle mesh for self-occlusion; volume fills exclude their own host but remain occluded by other objects. | Triangle-face center checks, deterministic sampling, and finite render tests. Surface spacing uses Euclidean distance as a conservative lower bound on intrinsic distance; opposite folds may be thinned more than necessary. |
| 5. Validation and work limits | Engine-boundary numeric/camera/shape/graph validation, explicit input/cell/triangle/path/vertex/sample budgets, STL count/size/coordinate validation, bounded fill sampling, and a math-only expression parser. No `new Function` remains. Boolean graph validation also bounds expanded work for shared children. Function surfaces now use a bounded Cartesian height field instead of ln.js's hard-coded radial function generator. | Invalid work, unsafe formulas, parser nesting, malformed STL, positive/negative height-field fixtures; browser error recovery. |
| 6. Truthful controls and SVG interpretation | Removed unused bevel and slicing-gap properties from the public model; old scene files discard these inactive fields. Editors explicitly state the limitation. SVG line mode preserves open strokes; region mode resolves nonzero/even-odd winding per shape before union/extrusion. Unsupported SVG effects/references produce errors instead of incorrect geometry. | Nested winding-rule tests; browser open-stroke transform and filled-region checks. |
| 7. Geometry/presentation separation | `geometry-service.ts` owns generator, mesh, BVH, shape and prepared-scene caches. Compiled scene acceleration and source paths are reused across camera requests; shapes are reused across pen passes. `projection.ts` owns clipping/visibility; `svg-output.ts` owns serialization; `plot-output.ts` owns physical cleanup. The UI store no longer imports rendering. SVG parsing and the text/font editor load lazily. Font loading uses fetch/parse with retryable failures; text regeneration ignores stale asynchronous results. | Build output; six-view browser test; warm/cold cache regression. Main entry decreased from ~630 kB to ~290 kB uncompressed and ~87 kB gzip, with no large-main-chunk warning. |
| 8. Physical plotting controls | Millimeter margins, pen diameter, polyline simplification tolerance, minimum-clearance checks, exact duplicate-edge removal, degree-2 touching-endpoint joins, direction locks, and ink/travel/lift/time estimates. Processing is separate for each pen. Clipboard writing happens on a fresh user gesture after generation. | Clipping, joining, gap preservation, direction, closed-loop and clearance regressions; downloadable SVG with physical units. |

### Memory and worker choice

A Chrome six-view fixture with an 8×8×8 cube grid measured approximately 13.5 MB of main-thread JavaScript heap and 22–25 MB across six worker heaps (roughly 3.4–5 MB each). These are live CDP heap samples, not process RSS or a worst-case bound. Retain independent viewport workers: this measured fixture fits comfortably, and cancelling one worker does not interrupt other views. Camera-only updates do not clone the scene again. Large imports and complex fills still multiply geometry storage across visible views, so the engine also enforces geometry budgets.

### Current limits and deliberate behavior

- Engine limits: 500 scene nodes; 50,000 generated cells; 100,000 triangles per imported mesh; 250,000 paths; 2,000,000 vertices/samples; 20 MB per asset input; Boolean depth 32 and 500 expanded Boolean instances; at most eight heightmap noise octaves. Contour inputs have a 25,000-vertex preflight limit. Formula input is bounded to 2,048 characters, 256 tokens and nesting 32. Exceeding limits reports an error; geometry is never silently truncated to a budget.
- Surface spacing is conservative, visibility uses finite sampling, and mathematical height fields use a 64×64 grid. The millimeter tolerance controls simplification of resulting polylines, not an exact analytic error bound on every source curve or occlusion boundary.
- Minimum clearance checks are per pen and off by default (0), allowing intentional weaving/interference. When enabled, conflicting geometry blocks export with an explanation. Exact duplicate edges are removed; partially overlapping, differently segmented curves are not conflated. Endpoint joins require matching endpoints and degree two; they never bridge gaps.
- A lock on any scene object conservatively preserves all export path directions. Time estimates assume a start at the margin for each pen and exclude device acceleration and manual pen changes.
- SVG imports support plain geometry and inline/inherited fill rules. External references, stylesheets, text, clipping/masks/filters and images must first be converted to plain paths. The original SVG is retained so line/region interpretation can be changed.
- Older localStorage saves that already omitted mesh payloads cannot recover those bytes. The app retains the legacy save and shows a reimport message. New saves include assets; quota/unavailable-storage errors are visible.
- Export is a snapshot of the scene when Generate SVG was pressed. Cancellation terminates computation immediately at the worker boundary. Progress reports rendering/cleanup stages rather than claiming a precise percentage.

### Follow-up validation

Run `npm test`, `npm run test:browser`, `npm run build`, and `npm run lint`. All 25 engine/integration tests and all three browser scenarios pass. The browser suite requires installed Google Chrome and uses its own server port. The dependency audit was also cleaned up with compatible updates; `npm audit` reports zero known vulnerabilities. No physical pen plot or cross-browser certification is claimed.

The creative additions in [the generative controls plan](generative-controls-plan.md) remain a separate future feature plan; this follow-up resolves the engineering audit items.
