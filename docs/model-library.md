# Model library provenance and preparation

The eight-model library is local and requires no external model service at runtime.
The typed manifest is `src/lib/model-library.ts`; geometry and complete attribution
ship under `public/models`. See [asset credits and terms](../public/models/ATTRIBUTION.md).

## Source acquisition

- Suzanne: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Suzanne/glTF/Suzanne.gltf` and adjacent `Suzanne.bin`. The parent `README.md` has an explicit asset-level CC0 Legal section naming UX3D / Norbert Nopper.
- Kenney Pirate Kit 2.1: `https://opengameart.org/sites/default/files/kenney_pirate-kit_2.1.zip`, linked from Kenney's OpenGameArt release. The archive includes `License.txt`, copied unchanged with the assets.
- Kenney Space Kit 1.0: `https://opengameart.org/sites/default/files/space-kit-1.0.zip`, likewise from Kenney's release, with its original `License.txt` retained.
- Utah Teapot: official University of Utah `https://graphics.cs.utah.edu/teapot/`. This page explicitly permits use of its **model files**, rather than merely licensing generator software. Preserve the requested historic model name and University credit. The generator `teapot_generator.js` and `teapot_generator.wasm` are downloaded for preparation only and not shipped.

SHA-256 hashes of these exact source artifacts are in
[`source-checksums.json`](../public/models/source-checksums.json).

## Reproduce preparation

Arrange extracted archives under a source directory as `pirate-kit/` and
`space-kit/`, with the Suzanne files under `Suzanne/`. Obtain the teapot geometry
from the official generator with all four parts enabled, Blinn scaling, round
bottom, no interior/circular/trimmed/chamfer/curvature options, both sides, welded
positions, and resolution 5. Save its position/triangle output as `teapot.obj`.

The direct generator API used was `tmesh_generate(options, 5, -1)`, with
`options = 15 + (3 << 4) + (1 << 8) + (1 << 20) + (3 << 26)`.
Read `tmesh_numfaces()` and `tmesh_numverts()`, then the Int32 triangle indices
at `tmesh_faces()` and Float32 vertices at `tmesh_verts()` (eight floats per vertex;
first three are XYZ). OBJ indices are one-based. This produces 1,560 triangles
before the common cleanup. This is an export of the site's model data, not a new
approximation of the teapot.

Then run:

```sh
python3 scripts/prepare-model-library.py /path/to/source-directory
```

The standard-library-only script performs the documented conversion, rotation,
normalization and duplicate cleanup; it does not decimate. Suzanne receives an
additional 180° turn around Z so the default Hero camera shows her face; the
teapot receives a 90° Z turn to expose its handle and spout from that camera. The output summary is
committed as [`model-stats.json`](../public/models/model-stats.json).

## Verification

All eight OBJs were loaded and rendered through the app's real `renderScene`
pipeline, at 300×300 with an orthographic camera. No malformed coordinates,
missing geometry or rendering exceptions were observed. A contact sheet was
visually inspected for distinct silhouettes, upright orientation and useful line
art. The tower was changed from a plain crenellated block to the taller complete
watchtower after that inspection. The alien asset is a rib cage, not a skull;
its description reflects the actual source geometry.

The library totals approximately 280 KB of OBJ geometry; the largest is Suzanne
at approximately 121 KB. Meshes range from 168 to 3,936 triangles. The first local
render run took roughly 3–153 ms per mesh on the development machine; these are
smoke measurements, not cross-device performance guarantees.
