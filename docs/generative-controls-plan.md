# Generative controls plan

The biggest creative improvement is to let algorithms share fields and placement rules. The app already has simplex noise, basic fBm, lattice size/presence masks, voxel/Menger patterns, cellular-automaton histories, and hatching. Extend these into a composable system rather than adding another independent menu for every effect.

The recommendations below are proposed designs, not implemented controls. Most underlying algorithms are established; the contemporary visual character comes from combining them, preserving structure across scales, and deliberately introducing defects. Aperiodic monotiles provide a more recent mathematical direction.

## A composition model that fits the current app

**Distribution → field modifiers → motif → recursive placement → connections → plot output.**

Keep the existing scene tree and Properties panel. Add an ordered modifier stack to generator nodes. Each numeric control can use Constant or Field; Field opens source, input scale, remap curve, output range, and seed. Show thumbnails/presets and the most important controls first. A node-graph editor can come later if actual compositions justify its complexity.

Examples of field targets: position, orientation, scale, aspect ratio, presence, subdivision probability, hatch angle, line separation, recursion depth, and pen number. A single named field may drive multiple targets with different remaps. Include Local/World coordinate space and per-level frequency scaling to distinguish a pattern that travels with an object from one sampled across the scene.

Use a scalar-field interface for density/distance and a vector-field interface for displacement/direction. Generation should produce reusable motif geometry plus instance transforms and stable instance IDs. Expand instances only when visibility/export needs them. Derive randomness from `(scene seed, generator ID, ancestry, channel)` so changing traversal order or preview detail does not reshuffle unrelated objects. Version the generator definitions in saved recipes.

## First release: three complementary generators

### 1. Warped lattices and geometric interference

Start with rectangular, triangular, hexagonal and polar distributions. Apply smooth domain warping, for example `q = p + warpAmount * vectorNoise(p * warpFrequency)`; evaluate a second field at q. Add fBm controls: octaves, lacunarity (frequency multiplier), gain (amplitude falloff), ridged/turbulent remapping, anisotropy, and phase. Use independent seed channels for displacement and motif variation.

Expose **layout, rows/columns, spacing, warp amount, warp frequency, octaves, twist, motif, scale range, rotation range, and seed**. Motifs should include circles, polygons, stars, nested rectangles, arcs and short parallel-line bundles. Map one field to rotation and another to scale or omission. Quantized rotation produces crystallographic transitions; continuous rotation creates fabric-like distortion.

Add a second lattice with **relative angle, scale mismatch, offset and pen assignment** for moiré. Control actual line spacing, because interference that looks beautiful on screen can become a solid patch of ink.

First preset: *Impossible textile* — a hexagonal grid of nested triangles; low-frequency warp bends the fabric, ridged noise compresses motifs along seams, and a slightly rotated second layer creates interference.

Implementation: reuse `simplex-noise` and the existing seeded generator code; put field evaluation in `src/lib/fields/`, distributions in `src/lib/distributions/`, and motif construction in `src/lib/motifs/`. Extend existing cube/line-grid generators to consume the same fields before replacing any controls.

### 2. Curl-flow curves with attached geometry

For a 2D scalar potential ψ, use `v = (∂ψ/∂y, -∂ψ/∂x)` to create a curl field. Integrate streamlines with RK4 and an error-controlled step size; stop at boundaries, low velocity, maximum length, or previously drawn curves. Seed from lattices or Poisson-disk samples. Curl construction gives a divergence-free field in the continuous case; later vector normalization or arbitrary field mixing does not automatically preserve that property. [Bridson et al., Curl-Noise for Procedural Fluid Flow](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf).

Expose **seed distribution, separation, field scale, vortex strength, octaves, phase, integration tolerance, maximum length, obstacle clearance, and motif interval**. Draw single streamlines, parallel ribbons, or place polygons tangent to each curve by arc length. Add sparse local vortices as composable fields. Use a spatial hash for proximity tests; detect segment crossings as well as point proximity.

First preset: *Vortex cathedral* — long ribbons flow around circular voids; every few millimeters a nested diamond follows the local tangent, with its scale driven by curvature. Pen 2 marks only high-curvature zones.

Poisson-disk sampling is already a dependency. Bridson's fixed-radius algorithm is a good starting point; variable-density placement needs an explicit separation rule between neighboring samples rather than casually changing the radius during sampling. [Bridson, Fast Poisson Disk Sampling](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf).

### 3. Adaptive recursive subdivision and motif substitution

Build a quadtree in 2D and an optional octree in 3D. Split cells according to noise variation, distance to a boundary, or a probability field. At each leaf, place any motif. Also allow a motif to replace itself with a small set of transformed children, giving deterministic iterated-function-system compositions.

Expose **maximum depth, minimum cell size, branching probability, child scale, angle increment, translation, motif sequence, field threshold, parent visibility, symmetry and seed inheritance**. Offer per-level curves for scale/angle and a selectable field sampling rule: world position, normalized child coordinates, or parent value plus variation. Add hard instance and vertex budgets before allowing deep recursion.

First preset: *Fractured crystal* — a noisy quadtree subdivides near a spiral distance field; each leaf contains a recursively nested polygon. Rotation accumulates by depth, and sparse parent outlines reveal the larger structure.

Implement expansion with an explicit work queue, not recursive UI elements. Stable ancestry IDs allow cached subtrees and repeatable partial previews. Stop when physical detail falls below the chosen pen spacing. A recursion limit of six is not safe by itself: eight children per level already produce 262,144 leaves at level six.

## Second release: connected tilings and implicit geometry

| Algorithm | Controls | Combination and plotting approach |
| --- | --- | --- |
| Adaptive Truchet tiling | Tile family, edge ports, orientation bias, split probability, line multiplicity, loop preference | Noise selects orientation; recursive cells create channels at multiple scales. Solve edge-port compatibility across cell sizes. Store shared edges once, join connected curves, and insert explicit underpass gaps for weaving. |
| Signed-distance-field contours | Primitive list, union/intersection/subtraction, smooth-union width, repeat interval, twist, contour spacing | Warp circles, rounded boxes and polygons; extract multiple contour levels. Marching squares needs interpolation, consistent ambiguous-cell resolution, and endpoint stitching. Noise-warped distance values are not necessarily true distances, so equal level increments do not guarantee equal pen spacing. |
| Aperiodic substitution tilings | Tile family, substitution depth, patch radius, motif inset, orientation mapping, pen by hierarchy | Start with Penrose-style substitution; later add Hat/Spectre patches from verified constructions. Apply noise to interior decoration while maintaining shared tile boundaries. A finite patch is an excerpt of the tiling; arbitrary noise-selected tile placement is not a valid aperiodic construction. |
| Recursive conformal ornament | Inversion center/radius, transform sequence, repetition, clipping radius, motif scale | Invert or repeatedly transform motif grids to concentrate detail around singularities. Clip singular neighborhoods and stop at physical feature limits; do not emit enormous coordinates near poles. |

The Hat and Spectre directions build on the authors' actual constructions: [An aperiodic monotile](https://cs.uwaterloo.ca/~csk/hat/) and [A chiral aperiodic monotile](https://arxiv.org/abs/2305.17743). Their hierarchical organization makes them especially suitable for decorating tiles differently at different substitution levels.

Preset: *Aperiodic circuitry* — a finite aperiodic patch holds recursively nested arcs; orientation follows a shared flow field, while connected edge ports form long plotter strokes. This requires a compatibility layer between motifs; it will not emerge merely from overlaying two generators.

## Third release: growth and feedback

**Space colonization.** Grow branching structures toward attractor points distributed by noise or an SDF. Expose attractor density, influence radius, kill distance, branch step, directional bias, maximum iterations and obstacle clearance. Replace conventional leaves with recursive geometric motifs. A spatial index is essential for attractor/branch queries. The original algorithm supplies the growth foundation; geometric ornament is our proposed extension. [Runions et al., Modeling Trees with a Space Colonization Algorithm](https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf).

**Reaction–diffusion contours.** Simulate Gray–Scott fields on a bounded grid, then extract vector contours. Expose feed/kill presets, diffusion ratio, iteration count, boundary mode, seed pattern, contour levels and a field that modulates parameters. Use a stable timestep for the selected discretization and resolution. The simulation can be raster internally while the exported result remains SVG polylines. Nested contours will produce more plot-friendly output than thresholded blobs. [Karl Sims, Reaction-Diffusion Tutorial](https://www.karlsims.com/rd.html).

**Differential growth.** Evolve closed curves using separation, cohesion, bending resistance and edge splitting. Expose growth rate, split length, repulsion distance, boundary attraction and iteration count. Use an intersection check and stopping budget, then ornament the curve by arc length. This is a proposed later experiment, behind the deterministic field and contour infrastructure.

Preset: *Living circuit board* — reaction–diffusion contours define forbidden regions; space-colonization branches grow between them; tiny recursively nested hexagons occupy branch tips. Share a scene seed and preserve the numerical simulation version for reproducibility.

## Physical output is part of the generator

Perform clipping and projection before final screen/paper-space simplification. Convert tolerances from millimeters using the chosen physical page dimensions. Provide margin, pen diameter, minimum gap, maximum deviation, maximum vertices and pen palette. Display generated objects, drawable strokes, pen lifts, total ink distance and pen-up distance; plot-time estimates must use configurable device speeds and lift latency.

Cleanup order: reject non-finite geometry → clip → remove zero-length/duplicate strokes → simplify within geometric tolerance → optionally join compatible endpoints → order paths separately for each pen. Never join across an intentional gap or a different pen. Closed paths need closure-preserving simplification. Keep direction locks and crossing gaps as explicit path metadata.

Offer a preview budget and final export budget, both deterministic. Preview should reduce sampling/detail while preserving the composition's random choices. Warn before exceeding a budget and allow cancellation; silently truncating a scene makes a saved recipe unreliable.

## Delivery sequence and acceptance gates

1. **Foundation:** worker export/cancellation, direct-path clipping, validated budgets, field interfaces, stable seeds, modifier schema and versioned persistence. Done when a scene survives save/reload, camera changes and preview/export without reshuffling geometry; rendering can be cancelled.
2. **Warped lattice slice:** field controls + three layouts + three motifs + two curated presets. Done when field-driven position, rotation and scale compose; rectangular exports preserve geometry; object counts remain bounded.
3. **Flow slice:** curl field + integration + spatial separation + tangent motif placement. Done when obstacle clipping, segment collision checks and tolerance convergence tests pass, with no runaway trajectories.
4. **Recursion slice:** quadtree + transform substitution + depth remapping + physical stopping conditions. Done when changing preview detail preserves stable instance identities, limits are enforced, and dense exports complete within the explicit budget.
5. **Topology slice:** compatible Truchet ports + stitched SDF contours + duplicate-edge removal; then validated aperiodic substitution patches. Done when joins do not create seams, missing branches, or repeated shared strokes.
6. **Experimental growth:** colonization and reaction–diffusion first; differential growth afterward. Gate on deterministic simulation snapshots, bounded work and actual sample plots at the intended pen diameter.

Begin with three strong example compositions rather than a huge preset catalog. For each milestone, compare generation time, geometry size, pen lifts and visible output on the same saved fixtures. Keep the current generators working through adapters while the new pipeline develops.
