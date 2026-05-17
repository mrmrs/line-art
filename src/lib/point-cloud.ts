import * as ln from '@lnjs/core';
import type { Vec3, PointCloudPattern } from './types';

// =============================================================================
// Custom PointCloud shape that implements ln.js ShapeT
// Renders as tiny crosses at each point. Does not occlude other geometry.
// =============================================================================

export class PointCloud {
  points: ln.Vector[];
  size: number;
  box: ln.Box;

  constructor(points: ln.Vector[], size: number = 0.02) {
    this.points = points;
    this.size = size;
    this.box = this._computeBox();
  }

  compile(): void {
    // No-op: point cloud doesn't need acceleration structure
  }

  boundingBox(): ln.Box {
    return this.box;
  }

  contains(_v: ln.Vector, _f: number): boolean {
    void _v;
    void _f;
    return false; // Points don't occlude anything
  }

  intersect(_r: ln.Ray): typeof ln.NoHit {
    void _r;
    return ln.NoHit;
  }

  paths(): ln.Paths {
    const result: ln.Paths = [];
    const s = this.size;

    for (const p of this.points) {
      // 3-axis cross at each point
      result.push([
        new ln.Vector(p.x - s, p.y, p.z),
        new ln.Vector(p.x + s, p.y, p.z),
      ]);
      result.push([
        new ln.Vector(p.x, p.y - s, p.z),
        new ln.Vector(p.x, p.y + s, p.z),
      ]);
      result.push([
        new ln.Vector(p.x, p.y, p.z - s),
        new ln.Vector(p.x, p.y, p.z + s),
      ]);
    }

    return result;
  }

  private _computeBox(): ln.Box {
    if (this.points.length === 0) {
      return new ln.Box(new ln.Vector(0, 0, 0), new ln.Vector(0, 0, 0));
    }
    let min = this.points[0];
    let max = this.points[0];
    for (const p of this.points) {
      min = min.min(p);
      max = max.max(p);
    }
    return new ln.Box(
      min.addScalar(-this.size),
      max.addScalar(this.size),
    );
  }
}

// =============================================================================
// Point cloud generation patterns
// =============================================================================

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generatePointCloud(
  pattern: PointCloudPattern,
  count: number,
  radius: number,
  gridSpacing: number,
): Vec3[] {
  const rand = seededRandom(42);

  switch (pattern) {
    case 'random-sphere': {
      const pts: Vec3[] = [];
      for (let i = 0; i < count; i++) {
        // Uniform distribution on sphere surface
        const u = rand();
        const v = rand();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * Math.cbrt(rand()); // volume
        pts.push([
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi),
        ]);
      }
      return pts;
    }

    case 'random-cube': {
      const pts: Vec3[] = [];
      for (let i = 0; i < count; i++) {
        pts.push([
          (rand() - 0.5) * 2 * radius,
          (rand() - 0.5) * 2 * radius,
          (rand() - 0.5) * 2 * radius,
        ]);
      }
      return pts;
    }

    case 'fibonacci-sphere': {
      const pts: Vec3[] = [];
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r2 = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;
        pts.push([
          radius * r2 * Math.cos(theta),
          radius * r2 * Math.sin(theta),
          radius * y,
        ]);
      }
      return pts;
    }

    case 'grid': {
      const pts: Vec3[] = [];
      const half = radius;
      const step = gridSpacing || 0.25;
      for (let x = -half; x <= half; x += step) {
        for (let y = -half; y <= half; y += step) {
          for (let z = -half; z <= half; z += step) {
            pts.push([x, y, z]);
          }
        }
      }
      return pts;
    }

    default:
      return [];
  }
}
