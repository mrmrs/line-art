# Library and SVG export review — 2026-11-13

The library now offers 15 procedural presets and eight locally bundled mesh models. Packed creation is hidden; its saved-scene format, editor and renderer remain supported. The former 47 presets were reduced by removing primitive duplicates, repeated noise/radial/sine variants, terrain variants and the misleading CSG example that only overlaid two solids. New architectural stacks, a ripple surface and face-hatched blocks provide distinct starting points. Camera framing was visually checked for every retained preset.

| Before | After | Why |
| --- | --- | --- |
| Mixed Unicode and emoji library icons | Shared 24×24 monochrome SVG geometry with one stroke weight; 16px in shape/tree rows | Consistent silhouettes across platforms and views |
| Many variants of the same procedural field | 15 distinct starting compositions, with the underlying controls still available | More useful choices in a smaller library |
| No bundled model collection | Eight compact, licensed OBJ assets, about 279 KB total, loaded on demand | Recognizable forms without large initial downloads or external runtime services |
| Generate SVG, then Download SVG | One Download SVG action renders a fresh snapshot and downloads it; Copy appears after success | Removes the unnecessary preparation step |
| Device speed, lift timing and clearance controls | Only SVG-affecting controls; pen diameter renamed SVG stroke width (mm) | The app creates files and does not control a plotter |
| Tight export action spacing and dim descriptions | Larger action spacing and higher-contrast tooltip descriptions | Clearer interaction and readable model credits |

Model provenance, transformations, asset-specific licenses and reproducible preparation are in [the model documentation](model-library.md). The visible model orientations were checked with the actual default camera; Suzanne and the teapot were turned to expose their identifying features.

Independent code review found and resolved a delayed model replacement overwriting newer scene edits, an unbounded pending model request, and stale export-worker error/cleanup handling. Model failure or timeout leaves the scene intact and permits retry. Cancelled or failed exports do not increment the production event counter; browser tests mock all counter traffic.

Dense-grid work preserves every original cube edge and visibility semantics while reducing redundant allocation and occlusion work. The measured 20³ fixture improved from 2,099 ms to 916 ms; a 30³ fixture now succeeds in about 3.7 seconds instead of hitting source-path limits. Budgets remain unchanged; heavy fills and larger grids still have limits. See [benchmarks and correctness evidence](large-cube-grids.md).

Validation: 77 application unit tests, 57 vendored renderer tests, all 63 browser scenarios, lint and production build passed. Browser coverage includes every model and preset, preserved Packed behavior, import/export counters, download/cancellation recovery, delayed replacement and loading timeouts. Final visual adjustments received another full preset-gallery and keyboard-library check. No unresolved blocking findings remain.
