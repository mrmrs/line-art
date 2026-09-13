import * as ln from '@lnjs/core';
import { LIMITS, bounded } from './limits';

// =============================================================================
// STL file parser -> ln.js Mesh
// Handles both ASCII and binary STL formats
// =============================================================================

export function parseSTL(buffer: ArrayBuffer): ln.Triangle[] {
  bounded(buffer.byteLength, 'STL input bytes', 1, LIMITS.inputBytes);
  const view = new DataView(buffer);
  const text = new TextDecoder().decode(buffer.slice(0, 80));

  // Heuristic: ASCII STL starts with "solid" and isn't just a binary with "solid" header
  if (text.startsWith('solid') && !isBinarySTL(view, buffer.byteLength)) {
    return parseASCII(new TextDecoder().decode(buffer));
  }
  return parseBinary(view);
}

function isBinarySTL(view: DataView, byteLength: number): boolean {
  // Binary STL: 80 byte header + 4 byte triangle count + 50 bytes per triangle
  if (byteLength < 84) return false;
  const triCount = view.getUint32(80, true);
  const expectedSize = 84 + triCount * 50;
  return byteLength === expectedSize;
}

function parseBinary(view: DataView): ln.Triangle[] {
  if (view.byteLength < 84) throw new Error('Truncated binary STL header');
  const triCount = view.getUint32(80, true);
  bounded(triCount, 'STL triangles', 1, LIMITS.triangles, true);
  if (view.byteLength !== 84 + triCount * 50)
    throw new Error('STL size does not match triangle count');
  const triangles: ln.Triangle[] = [];

  for (let i = 0; i < triCount; i++) {
    const offset = 84 + i * 50;
    // Skip normal (12 bytes), read 3 vertices (36 bytes)
    const v1 = new ln.Vector(
      view.getFloat32(offset + 12, true),
      view.getFloat32(offset + 16, true),
      view.getFloat32(offset + 20, true),
    );
    const v2 = new ln.Vector(
      view.getFloat32(offset + 24, true),
      view.getFloat32(offset + 28, true),
      view.getFloat32(offset + 32, true),
    );
    const v3 = new ln.Vector(
      view.getFloat32(offset + 36, true),
      view.getFloat32(offset + 40, true),
      view.getFloat32(offset + 44, true),
    );
    if (![v1, v2, v3].every((v) => [v.x, v.y, v.z].every(Number.isFinite)))
      throw new Error('STL coordinates must be finite');
    triangles.push(new ln.Triangle(v1, v2, v3));
  }

  return triangles;
}

function parseASCII(text: string): ln.Triangle[] {
  const triangles: ln.Triangle[] = [];
  const lines = text.split('\n');
  let vertices: ln.Vector[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      vertices.push(
        new ln.Vector(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ),
      );
      if (!vertices.every((v) => [v.x, v.y, v.z].every(Number.isFinite)))
        throw new Error('STL coordinates must be finite');
      if (vertices.length === 3) {
        if (triangles.length >= LIMITS.triangles)
          throw new Error('STL triangle budget exceeded');
        triangles.push(new ln.Triangle(vertices[0], vertices[1], vertices[2]));
        vertices = [];
      }
    }
  }

  if (vertices.length || !triangles.length)
    throw new Error('Incomplete ASCII STL triangles');
  return triangles;
}

export function stlToMesh(buffer: ArrayBuffer): ln.Mesh {
  const triangles = parseSTL(buffer);
  return new ln.Mesh(triangles);
}
