# 3D SVG

A browser-based SVG app for pen plotting: 3D primitives, procedural grids, mathematical surfaces, SVG/text outlines, mesh imports, hatching, stippling, and multi-pen output.

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

## Identity and sharing

The striped skullcat in the header and solid favicon share the original mark. The SVG favicon adapts to the browser’s light/dark preference; ICO and Apple touch icons provide fixed-background fallbacks. The 1200 × 630 social card uses real line-grid geometry on black with a small **3D SVG** signature. Its lettering is outlined, so the card has no external font dependency.

Generated assets are committed in `public/`; deployment needs no graphics tools. To regenerate them, run `npm run generate:brand` with Node 24+, ImageMagick (`magick`), installed project dependencies, and Google Chrome.

Set `VITE_SITE_URL` to the final public origin (including `https://`) in the build environment to enable a canonical URL and absolute social-image links. Cloudflare Pages automatically supplies `CF_PAGES_URL` as a fallback for deployment previews. Local development without either variable uses relative image paths. No prospective domain is hardcoded.

## Interface and responsive layout

The app shares its interface language with Image to SVG: a 48px header, 30px desktop controls (40px header controls on coarse pointers), monochrome primary actions, and neutral light/dark surfaces. DM Sans and IBM Plex Mono are served locally with licenses in `public/fonts/ui/`. The hatched skullcat retains its 32px footprint.

The initial theme is applied in the HTML head before application modules load. Existing `skullcat-theme` choices remain authoritative; otherwise the interface follows live system changes. Only a deliberate toggle saves a preference. Theme changes do not modify artwork colors, geometry, cameras, document settings, or undo history.

At 1040px and below, the two desktop sidebars would consume 500px and leave insufficient drawing space, so the canvas takes the full width. **Scene** and **Properties** open dismissible modal panels. **More actions** retains Open, Save, appearance, view layout, grid settings, Undo, and Redo; **Export SVG** stays visibly labeled. Panels and menus support keyboard dismissal and focus restoration, and scroll within short landscape viewports. Project files remain `.lnscene`/`.json`; model imports stay in the Scene panel.

## Scenes and imports

Scenes auto-save to IndexedDB, including imported mesh assets and source SVGs. **Save** downloads a portable, versioned `.lnscene` file; **Open** validates and restores one. Import is undoable. Mesh data omitted by older app versions cannot be reconstructed; the app reports that condition and retains the old localStorage save.

SVG imports start in **Plot lines** mode, which preserves open strokes. The Properties panel can reinterpret the original as **Extruded filled regions**, honoring per-shape nonzero/even-odd fill rules. Convert referenced symbols, text, stylesheets, clipping effects, and images to plain paths before importing. Slicing follows the mesh; exploded slice gaps and bevels are explicitly unavailable and have been removed from the scene model.

Math formulas accept arithmetic, comparisons, conditionals, variables, and common `Math` functions/constants. Arbitrary JavaScript is not supported. For example: `Math.sin(x * 2) * Math.cos(y * 2) * 0.5`.

## Plot output

The right sidebar’s **Document** section contains stroke, background, quality, paper and path optimization settings. **Export SVG** in the header opens physical output settings for either a regular scene or a packed composition. Set margins, SVG stroke width in millimetres, simplification tolerance, endpoint joining, duplicate removal, and stroke direction. **Download SVG** and **Copy SVG** are always visible. Each renders a fresh snapshot using the current settings, then downloads the file or copies the SVG source. Export and preview workers can be cancelled.

Margins clip paths and reserve half the SVG stroke width so strokes stay within the margin. Joining never bridges an intentional gap. The app creates SVG files; it does not control a plotter. Plotting speed, lift duration and device timing estimates are not part of the export interface.

The engine enforces explicit input, geometry, and sampling limits rather than silently truncating drawings. Simplification tolerance bounds changes to the generated polylines; visibility sampling and source curve tessellation remain numerical approximations. See [the completed audit](docs/code-audit.md) for limits and verification, and [the generative controls plan](docs/generative-controls-plan.md) for future creative features.


## Packed composition

**Packed** is temporarily hidden from Add Shape. Existing saved compositions remain fully supported. Their artwork uses the same neutral canvas and paper framing, with composition controls in the right sidebar. Pick **Recursive arcades**, **Folded mineral**, **Orbital reliquary**, or **Stepped foundry**, then generate. Mix prisms, ellipsoids, sliced orbs, frames and steps with varying sizes, proportions and heights. New compositions use shared isometric axes, with world-plane quarter-turns instead of independent tilts; frames maintain equal wall thickness as proportions change. **Free orientation** retains the earlier floating style. To realign existing artwork, choose **Shared isometric**, release the pins you want rebuilt, then Generate.

Click forms to select them; Shift-click adds to the selection. **Keep selected** pins their shape and placement across seeds. **Refill gaps** measures residual free space and fits additional forms without moving existing ones. **Nest in openings** uses the actual occupied pieces of frames and steps; **Recursion depth** and **Child scale** create smaller descendants inside frame apertures. **Select assembly** selects a whole family; pinning a child preserves its ancestor frames. Quiet regions reserve space; **Surface detail** changes engraving and ribs without moving the composition. Save/open and undo use the existing scene document.

Composition export uses its exact paper dimensions and a fixed orthographic camera. Clearance describes occupied geometric footprints. Turning nesting off reserves whole envelopes; recursive mode reserves apertures for owned descendants. Packing is a bounded heuristic, so target coverage is not guaranteed. See [implementation and next stages](docs/packed-composition.md).

## Exploring shapes

Presets default to a compact icon grid; switch to the list for names. Hover or focus an icon for its description. Adding preserves the current scene; replacing it is a single undoable action. Fifteen curated procedural presets cover line fields, surfaces, lattices, architectural stacks and hatching. All library icons use one monochrome SVG line system.

Eight compact OBJ models are bundled locally: Suzanne, Utah Teapot, pirate ship, watchtower, bent palm, spacecraft, alien fossil and crystal outcrop. They load on demand and become portable scene data when saved. Together they are approximately 279 KB. See [model credits and licenses](public/models/ATTRIBUTION.md) and [source preparation](docs/model-library.md).

Use **Randomize** in Shape or Fill controls for bounded variations. Imported source artwork and Boolean operands are preserved; mesh randomization changes orientation and scale. Composition Randomize immediately regenerates around kept forms while preserving paper and quiet regions.

Cube grids support volume hatching, angled surface hatching, stippling and contours. Surface hatch and surface dots can target X sides, Y sides or top/bottom faces (world axes). Combine fill layers with different angles or pens for side-specific treatments. Geometry budgets still apply to dense grids.

The development toolchain overrides `minimatch` to its patched 11.x release while upstream lint packages still request 10.x. Lint and production build are verified with this override.

## Export identity and event counts

Physical SVG exports include `data-generator="skullcat-studio"` and RDF/Dublin Core metadata identifying **3D SVG**, the **Skullcat** mark, **mrmrs**, and this source repository. Attribution adds no plotted geometry.

Anonymous event totals use the existing Cloudflare counter at `https://ts-gen-count.adam-f8f.workers.dev`:

| Key | Event |
| --- | --- |
| `SKULLCAT_SVG_EXPORT` | Download SVG, or successful Copy SVG |
| `SKULLCAT_OBJ_IMPORT` | OBJ file accepted into the scene |
| `SKULLCAT_STL_IMPORT` | STL file accepted into the scene |
| `SKULLCAT_SVG_IMPORT` | SVG file accepted into the scene |

Counts are read on initial load. Each event sends one asynchronous POST, followed by a GET after success. Failures never block artwork actions and POSTs are not retried. Requests send only the event key, never filenames or drawing content. Browser tests mock the service to keep test activity out of the live counters.

## Paper and alignment guides

The 3D preview is framed to the selected export paper, using the same camera projection and render dimensions as export. Use the orientation button to switch portrait/landscape. Choose **Custom** or open **Custom paper size** to enter width and height in millimeters, centimeters or inches; switching units preserves the physical size. Custom dimensions support 40–2,000 mm per side. Composition paper uses the same controls and retains placed forms when resized. Click a view to make it the export camera; switching back to a single view keeps that camera. The grid button toggles display-only alignment guides, with line/dot style, spacing in millimeters, and color settings. These guides also work in the composition workspace and never enter exported artwork.
