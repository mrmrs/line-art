"""Convert the source files documented in docs/model-library.md into compact OBJs.

Usage: python3 scripts/prepare-model-library.py /path/to/line-art-model-sources
Sources remain outside the app; output contains position/triangle data only.
No decimation: geometry is normalized, duplicate positions welded and zero-area
faces discarded. All source meshes use convex polygon faces.
"""
import json
import hashlib
import math
import pathlib
import struct
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(__file__).resolve().parents[1] / 'public/models'
target.mkdir(parents=True, exist_ok=True)


def read_obj(path):
    vertices, faces = [], []
    for line in path.read_text().splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == 'v':
            vertices.append(tuple(map(float, words[1:4])))
        elif words[0] == 'f':
            indices = [int(word.split('/')[0]) for word in words[1:]]
            indices = [index - 1 if index > 0 else len(vertices) + index for index in indices]
            faces.extend((indices[0], indices[i], indices[i + 1]) for i in range(1, len(indices) - 1))
    return vertices, faces


def read_suzanne():
    gltf = json.loads((source / 'Suzanne/Suzanne.gltf').read_text())
    binary = (source / 'Suzanne/Suzanne.bin').read_bytes()
    def accessor(index):
        item = gltf['accessors'][index]
        view = gltf['bufferViews'][item['bufferView']]
        components = {'SCALAR': 1, 'VEC3': 3}[item['type']]
        code = {5123: 'H', 5126: 'f'}[item['componentType']]
        size = struct.calcsize('<' + code * components)
        offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
        stride = view.get('byteStride', size)
        return [struct.unpack_from('<' + code * components, binary, offset + i * stride) for i in range(item['count'])]
    primitive = gltf['meshes'][0]['primitives'][0]
    positions = accessor(primitive['attributes']['POSITION'])
    indices = [v[0] for v in accessor(primitive['indices'])]
    return positions, [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]


models = [
    ('suzanne', 'Suzanne', None, True),
    ('utah-teapot', 'Utah Teapot', 'teapot.obj', False),
    ('pirate-ship', 'Pirate ship', 'pirate-kit/Models/OBJ format/ship-pirate-large.obj', True),
    ('watchtower', 'Watchtower', 'pirate-kit/Models/OBJ format/tower-complete-large.obj', True),
    ('bent-palm', 'Bent palm', 'pirate-kit/Models/OBJ format/palm-detailed-bend.obj', True),
    ('spacecraft', 'Spacecraft', 'space-kit/Models/spaceCraft1.obj', True),
    ('alien-fossil', 'Alien fossil', 'space-kit/Models/alienBones.obj', True),
    ('crystal-outcrop', 'Crystal outcrop', 'space-kit/Models/rocksTallOre.obj', True),
]

summary = []
for slug, title, filename, y_up in models:
    vertices, faces = read_obj(source / filename) if filename else read_suzanne()
    source_triangles = len(faces)
    if y_up:
        vertices = [(x, -z, y) for x, y, z in vertices]
    # Face the default Hero camera (+X,+Y,+Z), not away from it.
    if slug == 'suzanne':
        vertices = [(-x, -y, z) for x, y, z in vertices]
    elif slug == 'utah-teapot':
        vertices = [(-y, x, z) for x, y, z in vertices]
    low = [min(v[i] for v in vertices) for i in range(3)]
    high = [max(v[i] for v in vertices) for i in range(3)]
    center = [(a + b) / 2 for a, b in zip(low, high)]
    scale = 2 / max(b - a for a, b in zip(low, high))
    vertices = [tuple(round((v[i] - center[i]) * scale, 6) for i in range(3)) for v in vertices]
    unique, lookup, remap = [], {}, []
    for v in vertices:
        if v not in lookup:
            lookup[v] = len(unique)
            unique.append(v)
        remap.append(lookup[v])
    output_faces, seen = [], set()
    for face in faces:
        f = tuple(remap[i] for i in face)
        a, b, c = [unique[i] for i in f]
        u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
        cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        if math.sqrt(sum(x*x for x in cross)) < 1e-12 or tuple(sorted(f)) in seen:
            continue
        seen.add(tuple(sorted(f)))
        output_faces.append(f)
    content = f'# {title}\n# Source, attribution and terms: /models/ATTRIBUTION.md\n'
    content += '\n'.join('v ' + ' '.join(f'{x:g}' for x in v) for v in unique) + '\n'
    content += '\n'.join('f ' + ' '.join(str(i+1) for i in f) for f in output_faces) + '\n'
    path = target / (slug + '.obj')
    path.write_text(content)
    summary.append(dict(id=slug, vertices=len(unique), triangles=len(output_faces), sourceTriangles=source_triangles, bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
print(json.dumps(summary, indent=2))
