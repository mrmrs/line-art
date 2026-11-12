# Composition and packing direction

Research review, 2026-09-18. This is a proposed direction, not implemented functionality.

Build a **Compose workspace inside Studio**, sharing the existing document, motif editor, visibility engine, pens and export pipeline. Prioritize a composition engine that allocates space, fits projected forms and repairs unwanted gaps. Keep the ln.js fork. Explore a specialized lattice renderer later; evaluate Rust against measured bottlenecks after establishing representative compositions.

## Reference review

Read James Merrill's [Creating BUSY](https://lostpixels.io/writings/creating-busy) and inspected all 17 main article images, including the cover, complete works, detail, tube catalogue, Marfa variant and production photographs. The transferable ideas are a reusable motif vocabulary, connections between modules, detail at several scales, and physical density that survives changes in paper size. The Marfa image is especially useful: intentional open regions coexist with dense detail. These are compositional lessons, not a specification of the author's unpublished placement algorithm.

The Objkt page did not load through the research browser, but token metadata was retrieved from [TzKT](https://api.tzkt.io/v1/tokens?contract=KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton&tokenId=53929). It identifies Frederik Vanhoutte's **Grain Boundaries II – Tile UR**, a 10,000 × 10,000 PNG. Downloaded and visually inspected the [original artifact](https://ipfs.io/ipfs/QmbH6K9WRsTyjoefs4BzXkEqe3V5sz2p1BWvzrQhQcRZBb). The image combines common isometric directions, major slabs, small recesses and sparsely distributed bright accents. Dark faces establish depth. Its metadata does not identify the exact generating program; resemblance to isogrid is not proof that this repository reproduces this work.

For our visual language, explore curved and faceted forms together: sliced ellipsoids, perforated prisms, stepped frames, folded ribbons and nested arches. Let neighborhoods share a direction or construction rule, then introduce deliberate transitions. Fully independent randomness in every object's size, rotation and detail would weaken that coherence.

## What isogrid actually provides

Reviewed repository revision `9c96cdb45c22854d4e55fa81db35e9fffeda5a9e`, including the six Java classes, example generation systems, keyboard operations and exporter. The README-linked distribution ZIP was also inspected for packaging and license files. This was source review, not a Processing runtime validation or performance benchmark.

| Component | Mechanism and significance |
| --- | --- |
| `WB_IsoHexGrid` | Maps cube coordinates to `q=i-k`, `r=j-k`, with depth `i+j+k`. Its hexagonal cells contain 36 triangular fragments. An eight-voxel state selects a table of fragment labels. The nearest fragment wins, and differing neighboring labels, colors or depths produce boundaries. This is a specialized discrete visibility method. |
| `WB_SimpleIsoHexGrid` | Six triangles per cell for ordinary cubes; a simpler version of the same restricted projection model. |
| `WB_IsoGridCell` | Stores fragment depth, label, color and originating cube coordinates. This preserves ownership during projection. |
| `WB_IsoGridSegment` / `WB_IsoGridLine` | Classify edges into six lattice directions, group and sort them, merge exactly touching collinear runs, then alternate traversal direction. Useful topology-aware line extraction; not arbitrary polygon nesting. |
| Example `IsoSystem` | Dense voxel arrays, multiscale block removal, noise masks, slicing, hollowing, wire extraction, mirrors and axis rotations. Dual mode builds an eight-bit neighborhood state. The recursive-looking richness largely comes from repeated operations at different block scales. |
| Example `Maze` | A 3D maze generator using an Aldous–Broder walk, mapped into voxels. |
| `WB_CubeGridExporter` | Extracts voxel boundary faces into OBJ. Processing supplies the example SVG/PDF recording path. |

Sources: [main grid](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_IsoHexGrid.java), [simple grid](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_SimpleIsoHexGrid.java), [line merging](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_IsoGridLine.java), [generation system](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/examples/iso_190728/IsoSystem.pde), [maze](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/examples/iso_190728/Maze.pde), [exporter](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_CubeGridExporter.java).

The two libraries overlap in visibility and vector output, but have different domains. ln.js is our general 3D line renderer with arbitrary cameras and transformed shapes. Isogrid makes a much narrower geometry/projection problem discrete. Its advantage comes from that restriction; free rotation and arbitrary curved objects cannot simply be added while retaining the same fragment tables.

The useful transferable ideas are shared topology, compact occupancy, boundary extraction and composable multiscale operators. A browser implementation is feasible. Translating the whole Processing application is unnecessary.

Porting considerations found during review:

- No explicit license file or license header was found in the reviewed repository or linked ZIP. Establish reuse terms before incorporating its implementation or tables. Meanwhile, an independently specified lattice generator can use standard geometric constructions.
- The example `clear()` increments its loop index twice, so only alternating entries are assigned. Some block-noise loops index partial boundary blocks without checking `index() == -1`. A production implementation needs explicit dimension and block-size contracts. These are static findings, not executed regressions. [Example source](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/examples/iso_190728/IsoSystem.pde).
- The simple grid stores only the frontmost triangle and uses strict greater-than depth replacement. Equal-depth ownership depends on insertion order; deleting a front triangle cannot reveal discarded rear data without rebuilding. Define these semantics explicitly for editing. [Simple grid source](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_SimpleIsoHexGrid.java).
- OBJ face emission uses fixed winding for each axis regardless of which side is occupied. Reconstruct consistent outward orientation before feeding such output into closed-solid containment/CSG. [Exporter source](https://github.com/wblut/isogrid/blob/9c96cdb45c22854d4e55fa81db35e9fffeda5a9e/src/wblut/isogrid/WB_CubeGridExporter.java).
- The checked tree contains no automated tests or build manifest. Preserve the geometric ideas with new fixtures and ownership tests rather than assuming age or visual success establishes a general-purpose engine contract.

## Fit with our current app

There is already substantial useful infrastructure:

- [cube-grid.ts](../src/lib/cube-grid.ts): seeded noise, fBm, presence masks, Menger patterns, city/heightmap/maze generation.
- [automata-grid.ts](../src/lib/automata-grid.ts): cellular-automaton histories as 3D cubes.
- [geometry-service.ts](../src/lib/geometry-service.ts): geometry caches, transformed shapes, Boolean construction, fills and per-pen projection.
- [render-worker.ts](../src/lib/render-worker.ts) and [export-worker.ts](../src/lib/export-worker.ts): background rendering/export boundaries.
- [plot-output.ts](../src/lib/plot-output.ts): physical clipping, simplification and path preparation; [plot-settings.ts](../src/lib/plot-settings.ts): pen diameter, gap, deviation and timing settings.
- Our ln.js 0.8 work adds supported analytic intersection contours to the improved hidden-line engine. General off-axis quadric and mesh intersection contours remain incomplete; reusable motifs must respect those supported families or use validated meshes.

The missing abstraction is a reusable motif plus many persistent instances, each with placement rules and overrides. Current grids eagerly create individual `ln.Cube` objects. `SceneNode` has no general motif-instance/assembly model. Limits currently include 500 authored nodes, 50,000 generated cells and two million path vertices. A composition should be a small number of authored generators with compact instances, not tens of thousands of React layer rows or copied scene nodes.

Extend the earlier [generative controls plan](generative-controls-plan.md): prioritize motif instances, region allocation and packing ahead of additional isolated generators.

## Three placement behaviors

Expose these as distinct artistic choices because their constraints differ:

| Behavior | Placement contract | Use |
| --- | --- | --- |
| Fitted | Projected object silhouettes stay separated by a physical clearance. | Dense collections where each object reads independently. |
| Layered | Controlled silhouette overlap; depth and visibility determine surviving strokes. | Stacked, woven and spatially rich compositions. |
| Cellular | A shared partition or lattice defines compatible regions and boundaries. | Interlocking constructions with intentional coverage. |

For the initial release, use an orthographic composition camera and fit **projected silhouettes in paper space**. Packing 3D bounding boxes does not prevent visible gaps or excessive projected overlap. Packing only stroke bounds also fails: sparse outlines do not describe a solid's occupied area.

A motif needs drawable geometry, a filled occupancy silhouette, optional protected holes, allowed transforms, optional connection ports, and a minimum useful physical size. Transparent/open wire motifs need an explicit occupancy policy. Large silhouette concavities and intentional apertures must survive the representation.

Start with analytic or polygonal silhouettes for supported motifs. Use conservative convex pieces as a broad phase, followed by actual footprint intersection/clearance checks. Arbitrary imported meshes and Boolean assemblies need a silhouette adapter; this is real new work, not an API ln.js already gives us.

Camera changes invalidate view-dependent packing. Keep the arrangement stable while orbiting for inspection, indicate that it was fitted for another view, and provide an explicit Refit action. Do not silently rearrange a composition during camera motion. Perspective fitting can follow later.

## Proposed composition algorithm

1. **Reserve the composition.** Define the page boundary, focal regions, intentional voids and optional flow corridors. Use a shared scalar field for density and a direction field for orientation. Maintain a few independent channels rather than unrelated noise per parameter.
2. **Allocate large and medium regions.** Use binary space partitioning with variable split ratios for broad aspect-ratio variation; use adaptive quadtrees for stronger hierarchy. Later add weighted Voronoi/power cells for less rectilinear regions. A partition covers its domain, but placing an inset object inside each cell does not itself guarantee silhouette coverage.
3. **Place anchor motifs.** Choose a bounded size distribution with a few prominent forms and many supporting ones. Fit the largest first. Orient by neighborhood/field, with controlled deviations. Generate multiple candidate variants and rank by fit and compositional role.
4. **Fit the remaining forms.** Use spatial indexing, coarse rejection and detailed footprint tests. Begin with convex polygon motifs and a finite orientation set. Add concave nesting and no-fit polygons when the initial slice works. A no-fit polygon describes forbidden relative translations at a fixed pair of orientations; every new orientation/aspect variant changes that geometry. [SVGnest's approach](https://github.com/Jack000/SVGnest), [Minkowski-sum geometry](https://doc.cgal.org/latest/Minkowski_sum_2/index.html).
5. **Repair the negative space.** Compute the unoccupied page region excluding protected voids. Rank connected pockets by area, width and elongation; use a coarse distance field to propose candidates, then validate with vector geometry. Rotate or resize a nearby unpinned motif, insert a smaller motif, or generate an elongated filler. Cap retries. Preserve apertures and stop at minimum plottable size.
6. **Refine locally.** Run bounded local search over translation, orientation, aspect and motif substitution. Hard constraints enforce clearance and pins. Soft objectives balance residual-gap size, local density, direction agreement, motif diversity and retained visibility. Avoid a single global coverage percentage as the definition of quality.
7. **Decorate after placement.** Add surface hatching, nested forms, ribs and connectors at final physical scale. Then render visibility, measure the visible result, and allow limited repairs if overlap concealed too much structure.

This cannot promise mathematically gapless packing of arbitrary fixed shapes with positive clearance. Cellular constructions can guarantee domain coverage; freeform packing needs size variation, suitable filler families, optional overlap or accepted negative space. Expose that distinction honestly.

Poisson-disk sampling is useful for initial anchor distribution, not sufficient for dense arbitrary-shape fitting. Bridson's algorithm controls point separation; our silhouettes still need their own tests. [Original paper](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf).

For connected recursive structures, add explicit ports and adjacency rules. WFC is appropriate for choosing compatible discrete modules, with backtracking/restarts and bounded work. It does not solve continuous rotation/scale packing or guarantee a globally compelling composition. At boundaries between recursion levels, transition modules must reconcile ports. [Original WFC implementation](https://github.com/mxgmn/WaveFunctionCollapse).

## Interaction design

Use **Objects · Compose · Plot** views of one document. Objects retains direct geometric editing. Compose introduces a paper-first canvas, reusable motif tray, region selection, parameter locks and variation thumbnails. Plot uses the existing pen/export workflow.

Keep the initial controls tangible:

| Control | Effect |
| --- | --- |
| Scale mix | Balance large anchors, medium forms and small details. |
| Density | Desired local occupancy, independent from internal stroke density. |
| Clearance | Minimum paper-space separation in millimeters. |
| Direction | Shared axes, flow alignment or freer orientations. |
| Proportions | Aspect-ratio range and allowed deformation per motif family. |
| Depth / overlap | Stacking rules and retained visibility targets. |
| Nesting | Recursive levels, children per region and physical stopping size. |
| Quiet regions | Protected voids and transitions in density. |
| Detail | Internal ornament constrained by pen and paper. |

High-value actions: **Keep this region**, **Vary selected**, **Refill gaps**, **Replace motif**, **Make smaller variations**, **Compare seeds**, and **Undo**. Pins and exclusions must persist through regeneration. A selected instance can be edited without expanding every instance into the layer panel.

Show the actual pen footprint on zoomed-in previews. Full-page and close-up views should agree about minimum spacing. Use physical density for growing the paper; offer geometric scaling as a separate operation.

## Architecture and Rust

Keep these responsibilities independently testable:

```text
Document + motif definitions + fields + pinned overrides
                       |
              composition / packing
                       |
       instances + footprints + connection graph
                       |
         geometry + drawable-path adapters
                       |
        ln.js visibility / future lattice backend
                       |
       paper-space cleanup + pens + SVG export
```

Use one shared stroke format carrying pen, object ownership, intentional gaps and direction locks. A lattice backend's flattened 2D paths cannot independently occlude arbitrary ln.js objects correctly; mixed scenes must share depth-capable geometry/visibility, or explicitly use separated compositing layers. Initially, keep all mixed 3D scenes in ln.js.

Cache motif geometry once per parameter variant. Store instances as compact transforms and stable IDs. Derive random channels from seed, generator ID, ancestry and parameter role. Changing hatch density should not alter placement. Save the resolved layout as well as the recipe/version so solver improvements do not destroy finished artwork.

Avoid making the entire artwork one enormous Boolean tree. Use local CSG within a motif, cache reusable results, and instance them. Our event-based Boolean visibility has potentially expensive surface-pair work; large scenes need candidate filtering and shared geometry acceleration. Thousands of copies of one motif should share a local acceleration structure with a separate instance-level index.

Rust/Wasm is a plausible later home for occupancy, polygon operations, spatial queries and visibility hot loops. It can improve memory layout and enable a native batch renderer. A language change does not supply a better packing objective, fix numerical predicates, remove algorithmic complexity or guarantee speed.

First define a backend-neutral geometry contract and baseline TypeScript implementation. Then benchmark the same workloads in a small Rust prototype, including startup, memory and JS/Wasm transfer costs. Pass batches/typed arrays, not one call per edge. The official [wasm-bindgen numeric-slice interface](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html) supports this style of boundary. Keep generation versions and numerical tolerances explicit; identical seeds alone do not guarantee identical layouts across runtimes.

If Rust proves valuable, use a workspace with separate composition, lattice, visibility and plot modules behind one API. Preserve the current fork's regression cases as a compatibility suite. Decide library licensing before copying upstream code.

## Delivery sequence

1. **First usable composition:** motif/instance model, orthographic fitting, prisms and curved convex forms, a few supported CSG motifs, hierarchical size/aspect control, protected voids, regional pins, gap repair and export. Use existing ln.js. Ship three carefully composed presets with distinct visual languages.
2. **Recursive assemblies:** region subdivision, face-mounted or nested motifs, physical stopping rules, shared fields, local regeneration, more sophisticated concave silhouettes and cavity policy.
3. **Connected and cellular compositions:** port-compatible modules, branching/loop controls, optional lattice generation, shared-edge extraction. Add a specialized isometric renderer only after its capability boundaries and performance benefit are established.
4. **Scale engineering:** benchmark 1k/10k/50k instances with different geometry/detail and overlap; optimize caches, broad phases, data transfer and viewport rendering. Test a Rust kernel against the slowest measured stage. The 50k case is a stress target, not a promised capacity for every motif.

Suggested first presets:

- **Folded mineral:** faceted prisms and curved cuts, clustered orientations, deep recesses, fine face contours.
- **Orbital reliquary:** sliced ellipsoids nested within eccentric frames, protected apertures and small geometric satellites.
- **Recursive foundry:** long stepped beams, branching connections and progressively smaller inset assemblies.

Acceptance checks: deterministic save/reload; pins preserved; no non-finite or duplicate accidental strokes; geometric clearance after projection; maintained intentional voids; stable preview/export placement; cancellation and explicit budget failure; robust grazing/collinear cases; plot-distance/lift metrics; comparisons of largest unwanted gaps and regional density. Measure full-page and detail readability, not just covered area. Physically plot small proof sheets before claiming production readiness for large works.

This review changes documentation only. It does not port isogrid, change application behavior or provide new performance measurements.


## Implementation checkpoint — September 18, 2026

The first usable Packed Composition workspace is implemented in Studio. See [the implementation notes](packed-composition.md) for the shipped controls, tests, conservative footprint policy, and remaining sequence. Concave occupied-piece nesting, bounded clearance-field gap repair and actual recursive frame assemblies are now implemented, with independent geometry QA and persistent parent/child ownership. BSP/quadtree subdivision, face-mounted recursion, connection grammars and a Rust kernel remain future work. See the implementation notes for the current limitations and reproducible measurements.
