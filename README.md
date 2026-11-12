# ln.studio

A browser-based SVG studio for pen plotting: 3D primitives, procedural grids, mathematical surfaces, SVG/text outlines, mesh imports, hatching, stippling, and multi-pen output.

## Development

```sh
npm install
npm run dev
npm test
npm run test:browser
npm run build
npm run lint
```

The browser suite uses locally installed Google Chrome and an isolated dev server on port 5188. Set `PLAYWRIGHT_PORT=5198` when that port is already occupied. `npm test` runs deterministic geometry, persistence, expression, scheduler, and physical-output regressions. Browser screenshots and test reports are ignored by Git.

## Scenes and imports

Scenes auto-save to IndexedDB, including imported mesh assets and source SVGs. **Save scene** downloads a portable, versioned `.lnscene` file; **Open scene** validates and restores one. Import is undoable. Mesh data omitted by older app versions cannot be reconstructed; the app reports that condition and retains the old localStorage save.

SVG imports start in **Plot lines** mode, which preserves open strokes. The Properties panel can reinterpret the original as **Extruded filled regions**, honoring per-shape nonzero/even-odd fill rules. Convert referenced symbols, text, stylesheets, clipping effects, and images to plain paths before importing. Slicing follows the mesh; exploded slice gaps and bevels are explicitly unavailable and have been removed from the scene model.

Math formulas accept arithmetic, comparisons, conditionals, variables, and common `Math` functions/constants. Arbitrary JavaScript is not supported. For example: `Math.sin(x * 2) * Math.cos(y * 2) * 0.5`.

## Plot output

**Export SVG** opens physical output settings. Set margins, pen diameter, simplification tolerance, optional minimum clearance, endpoint joining, duplicate removal, and stroke direction. Generate a snapshot, then download or copy it. Export and preview workers can be cancelled. Edits after generating a snapshot do not alter that already-generated SVG.

Margins clip paths and reserve half the pen diameter so ink stays within the margin. Joining never bridges an intentional gap. Minimum clearance is checked within each pen; zero allows crossings and overlaps. Estimates include pen lifts and configurable drawing/travel speeds, but exclude manual pen changes and device acceleration.

The engine enforces explicit input, geometry, and sampling limits rather than silently truncating drawings. Simplification tolerance bounds changes to the generated polylines; visibility sampling and source curve tessellation remain numerical approximations. See [the completed audit](docs/code-audit.md) for limits and verification, and [the generative controls plan](docs/generative-controls-plan.md) for future creative features.


## Packed composition

Choose **Packed Composition** in Add Shape to enter the paper-first workspace. Pick **Recursive arcades**, **Folded mineral**, **Orbital reliquary**, or **Stepped foundry**, then generate. Mix prisms, ellipsoids, sliced orbs, frames and steps with varying sizes, proportions and heights. New compositions use shared isometric axes, with world-plane quarter-turns instead of independent tilts; frames maintain equal wall thickness as proportions change. **Free orientation** retains the earlier floating style. To realign existing artwork, choose **Shared isometric**, release the pins you want rebuilt, then Generate.

Click forms to select them; Shift-click adds to the selection. **Keep selected** pins their shape and placement across seeds. **Refill gaps** measures residual free space and fits additional forms without moving existing ones. **Nest in openings** uses the actual occupied pieces of frames and steps; **Recursion depth** and **Child scale** create smaller descendants inside frame apertures. **Select assembly** selects a whole family; pinning a child preserves its ancestor frames. Quiet regions reserve space; **Surface detail** changes engraving and ribs without moving the composition. Save/open and undo use the existing scene document.

Composition export uses its exact paper dimensions and a fixed orthographic camera. Clearance describes occupied geometric footprints. Turning nesting off reserves whole envelopes; recursive mode reserves apertures for owned descendants. Packing is a bounded heuristic, so target coverage is not guaranteed. See [implementation and next stages](docs/packed-composition.md).

## Exploring shapes

Presets default to a compact icon grid; switch to the list for names. Hover or focus an icon for its description. Adding preserves the current scene; replacing it is a single undoable action.

Use **Randomize** in Shape or Fill controls for bounded variations. Imported source artwork and Boolean operands are preserved; mesh randomization changes orientation and scale. Composition Randomize immediately regenerates around kept forms while preserving paper and quiet regions.

Cube grids support volume hatching, angled surface hatching, stippling and contours. Surface hatch and surface dots can target X sides, Y sides or top/bottom faces (world axes). Combine fill layers with different angles or pens for side-specific treatments. Geometry budgets still apply to dense grids.

The development toolchain overrides `minimatch` to its patched 11.x release while upstream lint packages still request 10.x. Lint and production build are verified with this override.
