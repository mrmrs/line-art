# Code audit — 12 September 2026

Scope: rendering, geometry generation, caching, fills, projection, SVG export, worker scheduling, scene persistence, and the controls that connect them. This is a source audit with executable geometry regression tests, not a browser compatibility certification or a physical plot test.

## Changes implemented

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

## Validation and limits

Run `npm test`, `npm run build`, and `npm run lint`. Eleven regression tests pass. No new test dependency was installed: the runner uses existing TypeScript plus Node's test runner, removing compiled temporary files afterward.

On this machine, the synthetic 10,000-stroke fixture measured roughly 324 ms for the exhaustive reference and 61 ms for the indexed implementation (~5.3×). This measures ordering only, includes tree construction, and verifies identical resulting order. It is not a measured speedup for the whole app or a reduction in actual plotting time. Spatial search still has pathological cases; tree construction uses recursive sorting, O(N log² N), and worst-case total queries remain O(N²).

Build/lint passed before changes as well. Vite still reports a main bundle above 500 kB. Existing uncommitted dependency, ESLint, Node-version, and render-worker/hook changes were preserved; the package change added here is the test script.

Visible corrections: rectangular orthographic compositions now preserve proportions and may frame differently; stipple patterns become repeatable; formerly missing diagonal hatches appear; single-pen export stroke order now responds to Optimize. Triangle crossing tests assume closed manifold meshes and do not provide a robust classification for arbitrary tangent/boundary/non-manifold cases.

## Remaining work, in priority order

These require broader behavior or data-model changes and remain open.

1. **Responsive export and render scheduling.** `Toolbar.tsx` performs quality rendering synchronously on the main thread. Move export into a dedicated worker with progress, cancellation, and visible errors. `render-worker.ts` can coalesce queued requests but cannot interrupt a synchronous render; its asynchronous draft/final continuation also needs explicit ownership so an older final does not run after a newer request has already consumed `pendingRequest`. Send scene revisions separately from camera updates instead of cloning the entire scene into each viewport on every orbit. Measure multi-view memory before choosing worker sharing.
2. **Clip and occlude direct paths.** `computeProjectedPaths` projects slicing and line-grid paths outside ln.js's hidden-line pipeline. They bypass scene occlusion and near-plane/frustum clipping. Give paths an explicit visible-through/occluded mode and clip homogeneous segments before perspective division. This is essential before adding long flow curves or recursive placement behind the camera.
3. **Preserve imported scenes.** `store.ts` intentionally strips mesh data from localStorage and drops those nodes on reload. Move large assets to IndexedDB and introduce versioned scene files. `loadNodes`/`appendNodes` generate new IDs without remapping Boolean child references; remap the entire imported reference graph and reject cycles. Include reload/import/undo integration tests.
4. **Make surface stippling literal.** `fills.ts` currently uses volume containment for both surface and volume modes. Sample triangles proportional to area and then thin samples by surface distance. Show the new behavior explicitly because existing art will change.
5. **Bound and validate work.** Complexity labels are estimates, not enforced budgets. Enforce finite values, positive steps, valid camera bounds, triangle/path/vertex caps, recursion limits, and input-size limits at the engine boundary. Validate imported STL sizes and coordinates. Raw `new Function` expressions can run arbitrary JavaScript or never terminate; replace them with a bounded mathematical expression evaluator before introducing externally shared recipes.
6. **Make exposed controls truthful.** `slicing.gap` is not used in `createSlicedPaths`; extrusion bevel fields are not part of the current extrusion geometry implementation. Implement their semantics or remove/disable them visibly. SVG extrusion assumes even-odd closed regions, so imported open strokes/nonzero fill rules need a distinct import mode.
7. **Separate geometry from presentation.** `render.ts` mixes generation, transforms, visibility, per-pen passes and SVG writing; store cache imports keep render dependencies in the main bundle. Move caches under a worker-owned geometry service, reuse compiled scene geometry across pen/camera passes, lazy-load fonts/import machinery, and split serialization from projection.
8. **Finish physical plotting controls.** Add margins, pen diameter in mm, maximum geometric error, minimum feature separation, duplicate-edge removal, safe endpoint joining, pen-up distance and length estimates. Keep path direction locking available for techniques sensitive to stroke direction; greedy reversal remains the current behavior.

See [the generative controls plan](generative-controls-plan.md) for the proposed architecture and implementation sequence.
