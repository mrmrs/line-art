# Packed composition: nesting, repair and recursive assemblies

Updated September 21, 2026. Compose is part of the existing Studio document and ln.js rendering pipeline.

## Shared 3D construction

New compositions use **Shared isometric** construction. Side-face engraving follows the same world direction across turns. Every form uses one right-handed orthonormal view basis: local +Z remains vertical and corresponding edges follow the same three projected directions. Variation comes from physical dimensions, height, shape and quarter-turns on the world XY plane before projection. The generator and gap repair obey the same rule; recursive descendants inherit their parent's construction.

The original method varied each object's tilt and rotated the finished projection in the image plane. Those screen rotations changed all its apparent axes, making neighbors look as though viewed from unrelated cameras. **Free orientation** retains that style as an explicit option.

Shared frames also preserve equal physical wall thickness in X and Y when their aspect changes. They are constructed from dimension-aware rails rather than stretching a fixed stock frame. `composition-motifs.ts` supplies the same solid descriptors and opening dimensions to rendering, footprint fitting and recursion.

Existing resolved artwork retains its original construction. To rebuild it, choose **Construction → Shared isometric**, release any pins you want realigned, and Generate. Changing the setting alone does not move saved forms. Kept legacy forms and their descendants retain their old construction, so mixing kept free forms with new shared forms intentionally keeps both styles.

This defines a coherent shared-axis composition. It does not yet construct physical supports, contacts or stacked objects on one ground plane; those require a later spatial placement model.

## Use it

1. Add **Packed Composition**. Selecting this layer opens Compose; selecting an ordinary object returns to the object workspace.
2. Choose a recipe and Generate. **Recursive arcades** is a starting point for frames within frames. Other recipes explore faceted, rounded and elongated architectural forms. Choosing a recipe resets generation controls, preserving the paper, quiet regions and resolved artwork until Generate.
3. **Nest in openings** enables occupied-piece fitting. Other forms can occupy the visible apertures of frames or fit around stepped concavities. Turning this off reserves whole envelopes. Changing the setting does not rearrange saved forms; Generate applies it, and conflicting kept forms cause a recoverable error.
4. Set **Recursion depth** (0–5) and **Child scale**. With nesting enabled, the generator places descendants inside actual frame apertures. Depth is a maximum: physical clearance, minimum size, available space and work limits can stop a branch earlier.
5. Click a form or Shift-click several. The hit region follows its occupied pieces, so a frame does not intercept clicks through its opening. **Select assembly** expands the selection to the root and its descendants. **Keep selected** pins chosen forms; keeping a child also preserves its ancestor frames. Removing a frame removes its descendants. Undo restores the document change.
6. Change the seed to explore unlocked regions. **Refill gaps** preserves every resolved instance and attempts additional placements. Quiet regions reserve space; Generate applies a new exclusion. Failed or cancelled packing preserves the previous layout.
7. Surface detail changes side-face engraving and curved ribs without changing placement. Export uses the composition camera and exact paper dimensions. Save/open includes both the recipe and resolved ancestry.

## Geometry and fitting

`composition-types.ts` defines compact instances with stable IDs and optional parent IDs/generation. Layout coordinates and paper dimensions are millimeters. The orthographic fitting camera is fixed; geometry uses 40 mm per world unit. Composition nodes retain their identity transform so paper selection and clearance remain consistent.

`composition.ts` produces resolved instances; `composition-recursion.ts` proposes recursive children through the same global fit/accept hooks; `composition-geometry.ts` instances reusable ln.js solids. There are five motif families: prisms, ellipsoids, Boolean sliced spheres, frames and stepped assemblies.

Occupied geometry is represented as a union of convex projected pieces:

- Prisms use their projected box hull.
- Frames use the hull of each of their four actual rails, including aspect-correct wall thickness in shared construction. Steps use their three actual cuboids. Their projected overlaps count once in occupied area.
- Ellipsoids use circumscribed analytic support polygons. Sliced spheres use support of the actual sphere clipped at local z = 0.35. Curved polygons remain conservative approximations.
- Frame apertures are the intersection of the projected front/back inner openings, accounting for tilt, depth and aspect. A visually closed aperture is not treated as free space.

A spatial hash limits nearby candidates. Separating-axis overlap tests plus endpoint-to-edge distances enforce Euclidean clearance between occupied pieces. Origin-relative projections and degenerate-edge guards avoid unstable tiny-edge axes. Every proposal—including gap repair and recursive children—passes the same final vector checks for paper margins, quiet regions and existing solids.

Coverage reports occupied footprint area divided by the inner rectangular page area. Frame openings are excluded when nesting is enabled. Quiet regions remain in the denominator. This is a stopping target, not an aesthetic score or a guarantee. Clearance is geometric separation, not ink-edge separation; pen diameter and path-clearance reporting remain in Export.

## Smarter gap repair

Eight decreasing-scale passes establish a field of larger anchors and supporting forms. A bounded clearance field then measures free space across the entire page. Explicit frame-aperture seeds catch holes smaller than a grid cell. Candidates are ranked by clearance, rechecked against newly added geometry, and tried with several orientations and aspect ratios.

For each viable candidate, bounded size refinement looks for a larger valid fit. This is a local heuristic: ring occupancy is not monotonic under scaling, so refinement does not prove the largest possible fit. Every accepted result is checked again. Repair never nudges or resizes existing forms.

The field uses approximately 2,304 samples, at most 640 repair seeds, eight variants per seed and five size-refinement steps per viable variant. Work is bounded independently from page area. `repairAdded` and `repairAttempts` are available for diagnostics; the UI reports how many forms were fitted into gaps.

## Recursive assemblies

Recursion is actual cavity nesting, not simply a sequence of smaller random forms. Each branch derives its random stream from the scene seed and parent/slot identity. Children get stable lineage IDs and a generation count, inherit the parent's orientation/proportions, and must fit entirely inside a supported aperture. Direct siblings reserve separate envelopes so one sibling's opening belongs to its own descendants.

The first child prefers a frame when frames are selected and deeper generations remain. Further child slots allow branching when space permits. Recursion stops at the physical minimum, requested depth, 1,500-form global cap or its bounded proposal budget. Depth-first processing gives deeper branches a chance before broad sibling exploration consumes that budget. Both early and later anchor passes reserve capacity for descendants, including with small form caps and regeneration around pinned families. Retained frames get priority. Density is a soft target; completing recursive branches can take coverage beyond it.

In recursive mode, new unrelated root forms cannot enter reserved frame apertures or wrap around existing roots as unrecorded parents. This keeps visible recursion consistent with lineage and depth. Ordinary concave packing with recursion depth zero permits independent forms in openings without making them a logical assembly. Historical retained layouts remain unchanged.

Keeping a descendant retains its complete ancestor chain without changing those ancestors' pin flags. Refill preserves all original records. Imports validate parent existence, frame parent type, generation order, cycles and geometric aperture containment. Branch deletion is explicit and prevents orphaned descendants.

## Compatibility and limits

The document still stores version-1 recipes and resolved layouts. Missing `nesting` means the old reserved-envelope policy; missing recursion settings mean depth zero and child scale 0.5. New compositions enable nesting and shared isometric construction. Missing construction markers preserve the legacy independently tilted transforms, both for existing instances and recipe generation. Solver improvements can change newly generated layouts, while opening an existing resolved layout preserves its records.

Composition-specific preview/export excludes other scene layers and uses a fixed orthographic camera. The object view can render a composition alongside other objects, but arbitrary camera views have no fitted-clearance guarantee. Perspective fitting and overlapping depth stacks are not implemented.

Motif geometry is cached. Curved ribs and sliced-sphere seams have a size-aware 0.01 mm pre-simplification chord target. Export simplification has its own tolerance; the chord target is not a bound on every numerical visibility operation. The aspect-preserving preview/export viewport has a 1,200-unit long edge, while SVG physical dimensions retain the requested millimeters.

The vendored ln.js 0.8.1 uses projected BVHs for analytic spheres and Boolean solids. Existing vertex, event and render-time budgets still apply: the instance cap is not a promise that every high-detail scene will render within budget.

## QA and reproducible measurements

Run `npm test`, `npm run build`, `npm run lint` and `npm run test:browser`.

The independent QA suite projects primitive geometry using explicit arithmetic, checks pairwise solid clearance and quiet regions with segment intersection/distance tests, and compares occupied area with a separate numerical integration. It covers rotated/anisotropic forms, frame aperture nesting, conservative curved support, deterministic repair gains, retained layouts, ancestry, malformed imports, physical stopping rules, global caps, legacy recipes, family selection and branch deletion.

Browser tests exercise real pointer selection of a child through a parent's aperture, assembly pins across seed changes, refill preservation, reload, and downloaded physical SVG output. Existing scene, layer deletion, Boolean visibility and export tests remain in the full regression suite. Recursive artwork is also inspected visually.

Run `node scripts/benchmark-composition.mjs docs/composition-benchmarks.json` for packing-only measurements of ordinary, recursive, dense-repair and large-page cases. The report includes occupied coverage, repair gain, maximum generation, preserved baseline instances, attempt counts and elapsed time. Timings describe that machine/run, not guaranteed interactive performance or render/export capacity.

## Next stages

- Richer recursive grammars: BSP/quadtree regions, face-mounted children, editable branches and region-local regeneration. Current recursion supports frame apertures.
- More advanced residual-space optimization: connected pocket extraction, local movement of unlocked forms, cavity policies and custom motif silhouettes. Current repair inserts forms while preserving all existing geometry.
- Art direction: editable density/direction fields, seed comparisons, pen-aware minimum detail spacing and zoomed physical stroke previews.
- Connected/cellular systems: compatible ports, branching/loops and lattice generation with shared-edge extraction.
- Scale engineering: separately benchmark placement, construction, visibility, SVG serialization, memory and interaction. Evaluate a batched Rust/Wasm kernel only against a measured bottleneck.

This is bounded vector packing with real concavity and recursive ownership, not optimal or mathematically gapless packing of arbitrary shapes.
