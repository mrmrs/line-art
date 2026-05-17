import * as ln from '@lnjs/core';
import { createNoise3D } from 'simplex-noise';
import type { CubeGridParams } from './types';

// =============================================================================
// Cube Grid Generator
//
// Generates arrays of ln.js Cube shapes arranged in 2D or 3D grids.
// Each cell's size and presence is driven by configurable methods:
// noise, radial SDF, sine waves, voxel shapes, expressions, etc.
// =============================================================================

// --- Deterministic 3D noise: simplex-noise per-seed cache ---
//
// simplex-noise is faster and has no axis-aligned artifacts vs the previous
// value-noise. Each seed gets its own simplex instance, cached.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseCache = new Map<number, (x: number, y: number, z: number) => number>();
function getNoise(seed: number) {
  let fn = noiseCache.get(seed);
  if (fn) return fn;
  fn = createNoise3D(mulberry32(seed));
  noiseCache.set(seed, fn);
  return fn;
}

// Returns value in [0, 1] for compatibility with callers expecting unsigned noise.
// simplex-noise returns [-1, 1] so we remap.
export function noise3d(x: number, y: number, z: number, seed: number = 0): number {
  const n = getNoise(seed);
  return (n(x, y, z) + 1) * 0.5;
}

// Deterministic integer hash → [0, 1). Kept for callers that need cheap,
// uncorrelated per-cell random values (no smoothing).
function hashInt(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 904991) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

// Multi-octave fractal noise
export function fbm(x: number, y: number, z: number, seed: number, octaves: number = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3d(x * frequency, y * frequency, z * frequency, seed + i * 1000);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

// =============================================================================
// 5x7 Bitmap Font (A-Z, 0-9)
// Each character: 7 rows, 5 bits per row (MSB = leftmost pixel)
// =============================================================================

const FONT_5x7: Record<string, number[]> = {
  'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'B': [0x1E, 0x11, 0x1E, 0x11, 0x11, 0x11, 0x1E],
  'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  'D': [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
  'E': [0x1F, 0x10, 0x1E, 0x10, 0x10, 0x10, 0x1F],
  'F': [0x1F, 0x10, 0x1E, 0x10, 0x10, 0x10, 0x10],
  'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
  'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  'M': [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  'S': [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
  'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'V': [0x11, 0x11, 0x11, 0x11, 0x0A, 0x0A, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
  'X': [0x11, 0x0A, 0x0A, 0x04, 0x0A, 0x0A, 0x11],
  'Y': [0x11, 0x0A, 0x04, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
  '3': [0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x0E, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x0E, 0x11, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x0E],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04],
  '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
  '#': [0x0A, 0x1F, 0x0A, 0x0A, 0x1F, 0x0A, 0x00],
  '?': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  ':': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x08],
  '\'': [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  '<': [0x01, 0x02, 0x04, 0x08, 0x04, 0x02, 0x01],
  '>': [0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10],
  '=': [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00],
  '*': [0x04, 0x15, 0x0E, 0x1F, 0x0E, 0x15, 0x04],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
};

/** Return recommended countX for a given text string (5 pixels per char + 1 gap between chars) */
export function suggestCountXForText(text: string): number {
  const len = text.length;
  if (len === 0) return 5;
  return len * 5 + (len - 1); // 5 cols per char + 1 gap between each
}

// Check if pixel (col, row) is set for a character
function fontPixelSet(char: string, col: number, row: number): boolean {
  const glyph = FONT_5x7[char];
  if (!glyph || row < 0 || row >= 7 || col < 0 || col >= 5) return false;
  return ((glyph[row] >> (4 - col)) & 1) === 1;
}

// --- Size computation ---

interface CellContext {
  x: number; y: number; z: number;
  ix: number; iy: number; iz: number;
  nx: number; ny: number; nz: number;
  maxX: number; maxY: number; maxZ: number;
}

function computeSize(ctx: CellContext, params: CubeGridParams): number {
  let t = 0; // 0..1 value that maps to sizeMin..sizeMax

  switch (params.sizeMethod) {
    case 'uniform':
      t = 1;
      break;

    case 'noise':
      t = fbm(
        ctx.x * params.noiseScale,
        ctx.y * params.noiseScale,
        ctx.z * params.noiseScale,
        params.noiseSeed,
      );
      break;

    case 'radial': {
      const dx = ctx.nx - 0.5;
      const dy = ctx.ny - 0.5;
      const dz = params.dimensions === '3d' ? ctx.nz - 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      t = Math.max(0, 1 - dist * 2);
      break;
    }

    case 'radial-inv': {
      const dx = ctx.nx - 0.5;
      const dy = ctx.ny - 0.5;
      const dz = params.dimensions === '3d' ? ctx.nz - 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      t = Math.min(1, dist * 2);
      break;
    }

    case 'sine': {
      const [fx, fy, fz] = params.sineFrequency;
      const sx = Math.sin(ctx.x * fx);
      const sy = Math.sin(ctx.y * fy);
      const sz = params.dimensions === '3d' ? Math.sin(ctx.z * fz) : 1;
      t = (sx * sy * sz + 1) * 0.5;
      break;
    }

    case 'random':
      t = hashInt(ctx.ix, ctx.iy, ctx.iz, params.noiseSeed);
      break;

    case 'step': {
      // Staircase: quantize radial distance into N steps
      const dx = ctx.nx - 0.5;
      const dy = ctx.ny - 0.5;
      const dz = params.dimensions === '3d' ? ctx.nz - 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * 2;
      const levels = params.stepCount ?? 4;
      t = Math.max(0, 1 - Math.floor(dist * levels) / levels);
      break;
    }

    case 'gradient': {
      // Linear gradient along chosen axis
      const axis = params.gradientAxis ?? 'y';
      const nval = axis === 'x' ? ctx.nx : axis === 'y' ? ctx.ny : ctx.nz;
      t = nval;
      break;
    }

    case 'manhattan': {
      // Manhattan distance from center, normalized
      const dx = Math.abs(ctx.nx - 0.5);
      const dy = Math.abs(ctx.ny - 0.5);
      const dz = params.dimensions === '3d' ? Math.abs(ctx.nz - 0.5) : 0;
      const dist = (dx + dy + dz) * 2;
      t = Math.max(0, 1 - dist);
      break;
    }

    case 'ripple': {
      // Concentric rings from center
      const dx = ctx.nx - 0.5;
      const dy = ctx.ny - 0.5;
      const dz = params.dimensions === '3d' ? ctx.nz - 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const freq = (params.sineFrequency?.[0] ?? 2) * Math.PI * 2;
      t = (Math.cos(dist * freq) + 1) * 0.5;
      break;
    }

    case 'expression':
      try {
        const fn = new Function(
          'x', 'y', 'z', 'ix', 'iy', 'iz', 'nx', 'ny', 'nz',
          `return ${params.sizeExpression}`,
        ) as (...args: number[]) => number;
        t = Math.max(0, Math.min(1, fn(
          ctx.x, ctx.y, ctx.z, ctx.ix, ctx.iy, ctx.iz, ctx.nx, ctx.ny, ctx.nz,
        )));
      } catch {
        t = 1;
      }
      break;

    default:
      t = 1;
  }

  return params.sizeMin + t * (params.sizeMax - params.sizeMin);
}

// --- Presence computation ---

function computePresence(ctx: CellContext, size: number, params: CubeGridParams, precomputed: Uint8Array | null): boolean {
  switch (params.presenceMethod) {
    case 'all':
      return true;

    case 'random':
      return hashInt(ctx.ix + 7, ctx.iy + 13, ctx.iz + 31, params.noiseSeed + 999) < params.presenceProbability;

    case 'threshold':
      return size >= params.presenceThreshold;

    case 'checkerboard':
      return (ctx.ix + ctx.iy + ctx.iz) % 2 === 0;

    case 'sphere-mask': {
      const dx = ctx.nx - 0.5;
      const dy = ctx.ny - 0.5;
      const dz = params.dimensions === '3d' ? ctx.nz - 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (params.voxelShellOnly) {
        return dist > 0.35 && dist < 0.5;
      }
      return dist < 0.5;
    }

    case 'noise-mask':
      return fbm(
        ctx.x * params.noiseScale * 0.7,
        ctx.y * params.noiseScale * 0.7,
        ctx.z * params.noiseScale * 0.7,
        params.noiseSeed + 500,
      ) > (1 - params.presenceProbability);

    // --- Voxel Shapes ---

    case 'voxel-pyramid': {
      // Pyramid: base at z=0 (nz=0), apex at z=1 (nz=1)
      // At each z level, the x-y footprint shrinks
      const level = 1 - ctx.nz; // 1 at bottom, 0 at top
      const dx = Math.abs(ctx.nx - 0.5) * 2;
      const dy = Math.abs(ctx.ny - 0.5) * 2;
      const inside = dx <= level && dy <= level;
      if (!inside) return false;
      if (params.voxelShellOnly) {
        const margin = 1 / Math.max(ctx.maxX, ctx.maxY, 1);
        return dx > level - margin || dy > level - margin || ctx.iz === 0 || ctx.iz === ctx.maxZ;
      }
      return true;
    }

    case 'voxel-torus': {
      // Torus SDF: major radius R, minor radius r
      // Using normalized coords centered at 0.5
      const cx = (ctx.nx - 0.5) * 2;
      const cy = (ctx.ny - 0.5) * 2;
      const cz = params.dimensions === '3d' ? (ctx.nz - 0.5) * 2 : 0;
      const R = 0.6; // major radius
      const r = 0.3; // minor radius
      const qLen = Math.sqrt(cx * cx + cy * cy) - R;
      const sdf = Math.sqrt(qLen * qLen + cz * cz) - r;
      if (params.voxelShellOnly) {
        const thickness = 0.15;
        return Math.abs(sdf) < thickness;
      }
      return sdf < 0;
    }

    case 'voxel-diamond': {
      // Octahedron / diamond SDF: |x| + |y| + |z| <= 1
      const dx = Math.abs(ctx.nx - 0.5) * 2;
      const dy = Math.abs(ctx.ny - 0.5) * 2;
      const dz = params.dimensions === '3d' ? Math.abs(ctx.nz - 0.5) * 2 : 0;
      const manhattan = dx + dy + dz;
      if (params.voxelShellOnly) {
        return manhattan > 0.7 && manhattan < 1.0;
      }
      return manhattan < 1.0;
    }

    case 'voxel-cross': {
      // 3D cross: extends along each axis from center
      const dx = Math.abs(ctx.nx - 0.5) * 2;
      const dy = Math.abs(ctx.ny - 0.5) * 2;
      const dz = params.dimensions === '3d' ? Math.abs(ctx.nz - 0.5) * 2 : 0;
      const armWidth = 0.35;
      const armX = dy < armWidth && dz < armWidth; // arm along X
      const armY = dx < armWidth && dz < armWidth; // arm along Y
      const armZ = dx < armWidth && dy < armWidth; // arm along Z
      const inside = armX || armY || armZ;
      if (!inside) return false;
      if (params.voxelShellOnly) {
        // Only shell of each arm
        const innerWidth = armWidth * 0.5;
        const innerX = dy < innerWidth && dz < innerWidth;
        const innerY = dx < innerWidth && dz < innerWidth;
        const innerZ = dx < innerWidth && dy < innerWidth;
        const deepInside = (armX && innerX) || (armY && innerY) || (armZ && innerZ);
        return !deepInside;
      }
      return true;
    }

    case 'voxel-letter': {
      const text = (params.voxelLetter || 'A').toUpperCase();
      const cx = params.countX;
      const cz = params.dimensions === '3d' ? params.countZ : 7;

      // Layout: each char is 5 wide + 1 gap = 6 per char, last has no gap
      const totalCharWidth = text.length * 5 + (text.length - 1);
      // Map grid ix to character column
      const fontCol = Math.round((ctx.ix / Math.max(cx - 1, 1)) * (totalCharWidth - 1));
      // Map grid iz to font row (bottom of grid = bottom of letter, i.e. row 6)
      const fontRow = 6 - Math.round((ctx.iz / Math.max(cz - 1, 1)) * 6);

      // Determine which character and column within it
      let charIdx = 0;
      let col = fontCol;
      for (let c = 0; c < text.length; c++) {
        if (col < 5) {
          charIdx = c;
          break;
        }
        if (col === 5) {
          // Gap between characters
          return false;
        }
        col -= 6;
        charIdx = c + 1;
      }

      if (charIdx >= text.length) return false;
      return fontPixelSet(text[charIdx], col, fontRow);
    }

    // ================================================================
    // Precomputed generators — these use the lookup grid built by
    // generateCubeGrid before the cell loop. Simple array lookup.
    // ================================================================
    case 'menger-sponge':
    case 'city-skyline':
    case 'heightmap':
    case 'maze': {
      if (!precomputed) return true;
      const idx = ctx.iz * params.countX * params.countY + ctx.iy * params.countX + ctx.ix;
      return precomputed[idx] === 1;
    }

    case 'expression':
      try {
        const fn = new Function(
          'x', 'y', 'z', 'ix', 'iy', 'iz', 'nx', 'ny', 'nz', 'size',
          `return !!(${params.presenceExpression})`,
        ) as (...args: number[]) => boolean;
        return fn(
          ctx.x, ctx.y, ctx.z, ctx.ix, ctx.iy, ctx.iz, ctx.nx, ctx.ny, ctx.nz, size,
        );
      } catch {
        return true;
      }

    default:
      return true;
  }
}

// =============================================================================
// Precomputation for expensive presence methods
// These build a flat Uint8Array (1=present, 0=absent) ONCE before the cell loop.
// =============================================================================

function precomputePresence(params: CubeGridParams): Uint8Array | null {
  const method = params.presenceMethod;
  const cx = params.countX;
  const cy = params.countY;
  const cz = params.dimensions === '3d' ? params.countZ : 1;
  const total = cx * cy * cz;

  if (method === 'menger-sponge') return precomputeMenger(params, cx, cy, cz, total);
  if (method === 'city-skyline') return precomputeCity(params, cx, cy, cz, total);
  if (method === 'heightmap') return precomputeHeightmap(params, cx, cy, cz, total);
  if (method === 'maze') return precomputeMaze(params, cx, cy, cz, total);
  return null;
}

// --- Menger Sponge ---
function isMengerHole(ix: number, iy: number, iz: number, cx: number, cy: number, cz: number, depth: number, is3d: boolean): boolean {
  let bx = ix, by = iy, bz = iz;
  let sx = cx, sy = cy, sz = cz;
  for (let d = 0; d < depth; d++) {
    const tx = Math.floor((bx * 3) / sx);
    const ty = Math.floor((by * 3) / sy);
    const tz = is3d ? Math.floor((bz * 3) / sz) : 0;
    const midCount = (tx === 1 ? 1 : 0) + (ty === 1 ? 1 : 0) + (tz === 1 ? 1 : 0);
    if (midCount >= 2) return true;
    bx = bx % Math.max(1, Math.floor(sx / 3));
    by = by % Math.max(1, Math.floor(sy / 3));
    bz = bz % Math.max(1, Math.floor(sz / 3));
    sx = Math.max(1, Math.floor(sx / 3));
    sy = Math.max(1, Math.floor(sy / 3));
    sz = Math.max(1, Math.floor(sz / 3));
  }
  return false;
}

function precomputeMenger(params: CubeGridParams, cx: number, cy: number, cz: number, total: number): Uint8Array {
  const grid = new Uint8Array(total);
  const depth = params.mengerDepth ?? 2;
  const is3d = params.dimensions === '3d';
  const shell = params.voxelShellOnly;

  // First pass: mark solid cells
  for (let iz = 0; iz < cz; iz++) {
    for (let iy = 0; iy < cy; iy++) {
      for (let ix = 0; ix < cx; ix++) {
        if (!isMengerHole(ix, iy, iz, cx, cy, cz, depth, is3d)) {
          grid[iz * cx * cy + iy * cx + ix] = 1;
        }
      }
    }
  }

  // Shell mode: only keep surface cells (face or adjacent to hole/edge)
  if (shell) {
    const shell_grid = new Uint8Array(total);
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (let iz = 0; iz < cz; iz++) {
      for (let iy = 0; iy < cy; iy++) {
        for (let ix = 0; ix < cx; ix++) {
          const idx = iz * cx * cy + iy * cx + ix;
          if (grid[idx] !== 1) continue;
          // Check if on boundary or next to empty
          let exposed = ix === 0 || ix === cx - 1 || iy === 0 || iy === cy - 1;
          if (!exposed && is3d) exposed = iz === 0 || iz === cz - 1;
          if (!exposed) {
            for (const [dx, dy, dz] of dirs) {
              const nx = ix + dx, ny = iy + dy, nz = iz + dz;
              if (nx < 0 || nx >= cx || ny < 0 || ny >= cy || nz < 0 || nz >= cz) { exposed = true; break; }
              if (grid[nz * cx * cy + ny * cx + nx] === 0) { exposed = true; break; }
            }
          }
          if (exposed) shell_grid[idx] = 1;
        }
      }
    }
    return shell_grid;
  }

  return grid;
}

// --- City Skyline ---
function precomputeCity(params: CubeGridParams, cx: number, cy: number, cz: number, total: number): Uint8Array {
  const grid = new Uint8Array(total);
  const seed = params.citySeed ?? 42;
  const minH = params.cityMinHeight ?? 1;
  const maxH = params.cityMaxHeight ?? 8;

  for (let iy = 0; iy < cy; iy++) {
    for (let ix = 0; ix < cx; ix++) {
      const h = hashInt(ix, iy, 0, seed);
      if (h < 0.15) continue; // empty lot
      const height = Math.min(cz, Math.floor(minH + h * (maxH - minH + 1)));
      for (let iz = 0; iz < height; iz++) {
        grid[iz * cx * cy + iy * cx + ix] = 1;
      }
    }
  }
  return grid;
}

// --- Heightmap Terrain ---
function precomputeHeightmap(params: CubeGridParams, cx: number, cy: number, cz: number, total: number): Uint8Array {
  const grid = new Uint8Array(total);
  const seed = params.heightmapSeed ?? 42;
  const scale = params.heightmapScale ?? 0.5;
  const octaves = params.heightmapOctaves ?? 3;

  for (let iy = 0; iy < cy; iy++) {
    for (let ix = 0; ix < cx; ix++) {
      const n = fbm(ix * scale, iy * scale, 0, seed, octaves);
      const height = Math.min(cz, Math.max(0, Math.floor(n * cz)));
      for (let iz = 0; iz < height; iz++) {
        grid[iz * cx * cy + iy * cx + ix] = 1;
      }
    }
  }
  return grid;
}

// --- Maze ---
function precomputeMaze(params: CubeGridParams, cx: number, cy: number, cz: number, total: number): Uint8Array {
  const grid = new Uint8Array(total); // 0 = passage, will set 1 = wall

  const seed = params.mazeSeed ?? 42;
  const wallW = params.mazeWallThickness ?? 1;
  const cellW = wallW + 1;
  const stride = cellW + wallW;

  const mazeCols = Math.max(1, Math.floor((cx - wallW) / stride));
  const mazeRows = Math.max(1, Math.floor((cy - wallW) / stride));

  // --- Kruskal's maze (run ONCE) ---
  const totalCells = mazeCols * mazeRows;
  const parent = new Int32Array(totalCells);
  for (let i = 0; i < totalCells; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  };

  // Collect + shuffle walls
  const walls: number[] = []; // encoded: col | (row << 10) | (dir << 20)
  for (let r = 0; r < mazeRows; r++) {
    for (let c = 0; c < mazeCols; c++) {
      if (c < mazeCols - 1) walls.push(c | (r << 10) | (0 << 20)); // h
      if (r < mazeRows - 1) walls.push(c | (r << 10) | (1 << 20)); // v
    }
  }
  for (let i = walls.length - 1; i > 0; i--) {
    const j = Math.floor(hashInt(i, seed, 0, 12345) * (i + 1));
    const tmp = walls[i]; walls[i] = walls[j]; walls[j] = tmp;
  }

  // Open walls via spanning tree
  const openH = new Set<number>(); // col | (row << 10)
  const openV = new Set<number>();
  for (const w of walls) {
    const c = w & 0x3FF;
    const r = (w >> 10) & 0x3FF;
    const d = (w >> 20) & 1;
    const cellA = r * mazeCols + c;
    const cellB = d === 0 ? cellA + 1 : cellA + mazeCols;
    if (union(cellA, cellB)) {
      (d === 0 ? openH : openV).add(c | (r << 10));
    }
  }

  // --- Fill the voxel grid ---
  // For every iz layer, same 2D maze pattern
  const mazeSlice = new Uint8Array(cx * cy);
  for (let ly = 0; ly < cy; ly++) {
    for (let lx = 0; lx < cx; lx++) {
      // Border walls
      if (lx < wallW || ly < wallW) { mazeSlice[ly * cx + lx] = 1; continue; }

      const cellCol = Math.floor((lx - wallW) / stride);
      const cellRow = Math.floor((ly - wallW) / stride);
      if (cellCol >= mazeCols || cellRow >= mazeRows) { mazeSlice[ly * cx + lx] = 1; continue; }

      const offX = lx - wallW - cellCol * stride;
      const offY = ly - wallW - cellRow * stride;

      // Inside a cell = passage
      if (offX < cellW && offY < cellW) { mazeSlice[ly * cx + lx] = 0; continue; }

      // Vertical wall strip (right of cell)
      if (offX >= cellW && offY < cellW) {
        const key = cellCol | (cellRow << 10);
        mazeSlice[ly * cx + lx] = openH.has(key) ? 0 : 1;
        continue;
      }

      // Horizontal wall strip (below cell)
      if (offY >= cellW && offX < cellW) {
        const key = cellCol | (cellRow << 10);
        mazeSlice[ly * cx + lx] = openV.has(key) ? 0 : 1;
        continue;
      }

      // Corner pillar
      mazeSlice[ly * cx + lx] = 1;
    }
  }

  // Extrude the 2D maze into all Z layers
  for (let iz = 0; iz < cz; iz++) {
    const base = iz * cx * cy;
    for (let i = 0; i < cx * cy; i++) {
      grid[base + i] = mazeSlice[i];
    }
  }

  return grid;
}

// --- Main generator ---

export function generateCubeGrid(params: CubeGridParams): ln.Cube[] {
  const cubes: ln.Cube[] = [];

  const cx = params.countX;
  const cy = params.countY;
  const cz = params.dimensions === '3d' ? params.countZ : 1;
  const sp = params.spacing;

  const totalX = (cx - 1) * sp;
  const totalY = (cy - 1) * sp;
  const totalZ = (cz - 1) * sp;

  // Precompute expensive presence grids ONCE
  const precomputed = precomputePresence(params);

  for (let iz = 0; iz < cz; iz++) {
    for (let iy = 0; iy < cy; iy++) {
      for (let ix = 0; ix < cx; ix++) {
        const x = ix * sp - totalX * 0.5;
        const y = iy * sp - totalY * 0.5;
        const z = params.dimensions === '3d' ? iz * sp - totalZ * 0.5 : 0;

        const nx = cx > 1 ? ix / (cx - 1) : 0.5;
        const ny = cy > 1 ? iy / (cy - 1) : 0.5;
        const nz = cz > 1 ? iz / (cz - 1) : 0.5;

        const ctx: CellContext = {
          x, y, z,
          ix, iy, iz,
          nx, ny, nz,
          maxX: cx - 1,
          maxY: cy - 1,
          maxZ: cz - 1,
        };

        const size = computeSize(ctx, params);
        if (!computePresence(ctx, size, params, precomputed)) continue;

        const half = size * 0.5;
        cubes.push(
          new ln.Cube(
            new ln.Vector(x - half, y - half, z - half),
            new ln.Vector(x + half, y + half, z + half),
          ),
        );
      }
    }
  }

  return cubes;
}
