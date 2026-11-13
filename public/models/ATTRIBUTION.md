# Bundled model credits

These eight meshes are distributed with Skullcat for offline use. Their asset
licenses are separate from the application code. No license is inferred from a
repository's software license. Source and license evidence were checked on
2026-11-13.

| Model | Original asset and creator | Asset license |
| --- | --- | --- |
| Suzanne | [Khronos Suzanne sample](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Suzanne), © 2017 UX3D; Norbert Nopper | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode); model-specific [Legal section](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Suzanne/README.md), [notice](licenses/suzanne.txt) |
| Utah Teapot | [Historic Utah Teapot, University of Utah](https://graphics.cs.utah.edu/teapot/). Martin Newell, Jim Blinn and Frank Crow; official mesh generator by Cem Yuksel | [Official model-file terms](licenses/utah-teapot.txt): permits any use, including commercial use; requested historic name and origin retained |
| Pirate ship | Kenney, Pirate Kit 2.1, `ship-pirate-large.obj` | CC0-1.0; [original pack notice](licenses/kenney-pirate-kit.txt) |
| Watchtower | Kenney, Pirate Kit 2.1, `tower-complete-large.obj` | CC0-1.0; [original pack notice](licenses/kenney-pirate-kit.txt) |
| Bent palm | Kenney, Pirate Kit 2.1, `palm-detailed-bend.obj` | CC0-1.0; [original pack notice](licenses/kenney-pirate-kit.txt) |
| Spacecraft | Kenney, Space Kit 1.0, `spaceCraft1.obj` | CC0-1.0; [original pack notice](licenses/kenney-space-kit.txt) |
| Alien fossil | Kenney, Space Kit 1.0, `alienBones.obj` | CC0-1.0; [original pack notice](licenses/kenney-space-kit.txt) |
| Crystal outcrop | Kenney, Space Kit 1.0, `rocksTallOre.obj` | CC0-1.0; [original pack notice](licenses/kenney-space-kit.txt) |

Kenney's source releases: [Pirate Kit](https://opengameart.org/content/pirate-kit)
and [Space Kit](https://opengameart.org/content/space-kit). The corresponding
Kenney [Pirate Kit page](https://kenney.nl/assets/pirate-kit) identifies the
assets as CC0; the downloaded packs also contain explicit content license notices.
Attribution is voluntarily retained for all CC0 assets.

## Modifications

All outputs contain only positions and triangle faces: no textures, materials,
UV coordinates or vertex normals. Meshes are centered at the origin, uniformly
scaled so their longest extent is 2 units, and rounded to six decimals. Y-up
sources are rotated to Z-up with `(x, y, z) → (x, -z, y)`. Suzanne is then
rotated 180° around Z so her face points toward the default Hero camera. The
teapot is rotated 90° around Z to reveal both its handle and spout. Exact duplicate positions
are welded; zero-area and duplicate triangles (including reversed duplicates)
are removed. No silhouette decimation or remeshing was used.

Suzanne was converted from the explicitly licensed glTF distribution, not copied
from Blender source code. The Utah Teapot is generated at resolution 5 with the
1987 exterior, Blinn proportions and round bottom, without an interior. Its
historic name and origin are preserved. The official generator's code and
WebAssembly are not redistributed.

The other models retain their source geometry after the normalization and
cleanup above. “Watchtower,” “Bent palm,” “Alien fossil” and “Crystal outcrop” are
presentation names for the source assets listed in the table.

[Source checksums](source-checksums.json) identify downloaded source artifacts;
[mesh statistics](model-stats.json) record output sizes and triangle counts.
