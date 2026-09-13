import * as ln from '@lnjs/core';
// Bounded, Cartesian height-field geometry. ln.js's built-in Function.paths
// hard-codes an 8-unit radial domain and can raise negative values to fractional
// powers; this implementation evaluates only inside the requested bounds.
export class HeightField {
  private fn: (x: number, y: number) => number;
  private box: ln.Box;
  private above: boolean;
  constructor(
    fn: (x: number, y: number) => number,
    box: ln.Box,
    above: boolean,
  ) {
    this.fn = fn;
    this.box = box;
    this.above = above;
  }
  compile() {}
  boundingBox() {
    return this.box;
  }
  contains(p: ln.Vector) {
    return (
      this.box.contains(p) &&
      (this.above ? p.z > this.fn(p.x, p.y) : p.z < this.fn(p.x, p.y))
    );
  }
  paths(): ln.Paths {
    const paths: ln.Paths = [];
    const { min, max } = this.box;
    const divisions = 64;
    for (const swap of [false, true])
      for (let row = 0; row <= divisions; row++) {
        let path: ln.Vector[] = [];
        const flush = () => {
          if (path.length > 1) paths.push(path);
          path = [];
        };
        for (let column = 0; column <= divisions; column++) {
          const x =
              min.x + ((max.x - min.x) * (swap ? column : row)) / divisions,
            y = min.y + ((max.y - min.y) * (swap ? row : column)) / divisions,
            z = this.fn(x, y);
          if (z < min.z || z > max.z) {
            flush();
            continue;
          }
          path.push(new ln.Vector(x, y, z));
        }
        flush();
      }
    return paths;
  }
  intersect(ray: ln.Ray): typeof ln.NoHit {
    let lo = 1e-4,
      hi = 1e6;
    for (const axis of ['x', 'y', 'z'] as const) {
      if (ray.direction[axis] === 0) {
        if (
          ray.origin[axis] < this.box.min[axis] ||
          ray.origin[axis] > this.box.max[axis]
        )
          return ln.NoHit;
        continue;
      }
      const a = (this.box.min[axis] - ray.origin[axis]) / ray.direction[axis],
        b = (this.box.max[axis] - ray.origin[axis]) / ray.direction[axis];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
    if (lo >= hi) return ln.NoHit;
    const value = (t: number) => {
      const p = ray.position(t);
      return p.z - this.fn(p.x, p.y);
    };
    let before = value(lo),
      start = lo;
    for (let i = 1; i <= 128; i++) {
      const end = lo + ((hi - lo) * i) / 128,
        after = value(end);
      if (before * after < 0) {
        let a = start,
          b = end;
        for (let j = 0; j < 16; j++) {
          const mid = (a + b) / 2;
          if (value(a) * value(mid) <= 0) b = mid;
          else a = mid;
        }
        const hit = Object.create(Object.getPrototypeOf(ln.NoHit));
        hit.shape = this;
        hit.t = (a + b) / 2;
        return hit;
      }
      before = after;
      start = end;
    }
    return ln.NoHit;
  }
}
