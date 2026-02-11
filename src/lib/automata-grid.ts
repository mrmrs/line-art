import * as ln from '@lnjs/core';
import type { AutomataGridParams } from './types';

// =============================================================================
// Cellular Automata Grid Generator
//
// Runs a 2D cellular automaton (Conway's Game of Life, etc.) and stacks each
// generation as a Z layer of cubes. Alive cells become cubes, dead cells are
// empty. The result is a 3D sculpture of the automaton's history.
//
// Rule format: B/S notation, e.g. "B3/S23" for Conway's Game of Life
//   B = neighbor counts that cause birth
//   S = neighbor counts that allow survival
// =============================================================================

// --- Deterministic hash for random seeding ---

function hashSeed(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 904991) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

// --- Parse B/S rule notation ---

function parseRule(rule: string): { birth: Set<number>; survival: Set<number> } {
  const match = rule.match(/B(\d*)\/S(\d*)/i);
  if (!match) return { birth: new Set([3]), survival: new Set([2, 3]) };
  return {
    birth: new Set(match[1].split('').map(Number)),
    survival: new Set(match[2].split('').map(Number)),
  };
}

// --- Count Moore neighborhood (8 neighbors) ---

function countNeighbors(
  grid: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  wrap: boolean,
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      let nx = x + dx;
      let ny = y + dy;

      if (wrap) {
        nx = ((nx % w) + w) % w;
        ny = ((ny % h) + h) % h;
      } else {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      }

      count += grid[ny * w + nx];
    }
  }
  return count;
}

// --- Set initial pattern on grid ---

function setInitialPattern(
  grid: Uint8Array,
  w: number,
  h: number,
  params: AutomataGridParams,
): void {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  function set(x: number, y: number) {
    const gx = cx + x;
    const gy = cy + y;
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
      grid[gy * w + gx] = 1;
    }
  }

  switch (params.initialPattern) {
    case 'random':
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          grid[y * w + x] = hashSeed(x, y, params.seed) < params.randomDensity ? 1 : 0;
        }
      }
      break;

    case 'center':
      set(0, 0);
      break;

    case 'glider':
      // Classic glider (moving southeast)
      set(0, -1);
      set(1, 0);
      set(-1, 1);
      set(0, 1);
      set(1, 1);
      break;

    case 'r-pentomino':
      // R-pentomino: classic methuselah
      set(0, -1);
      set(1, -1);
      set(-1, 0);
      set(0, 0);
      set(0, 1);
      break;

    case 'acorn':
      // Acorn: runs 5206 generations before stabilizing
      set(-3, 0);
      set(-2, 0);
      set(-2, -2);
      set(0, -1);
      set(1, 0);
      set(2, 0);
      set(3, 0);
      break;

    case 'cross':
      // Plus-sign pattern
      for (let i = -2; i <= 2; i++) {
        set(i, 0);
        set(0, i);
      }
      break;
  }
}

// --- Run the automaton and collect all generations ---

function runAutomata(params: AutomataGridParams): Uint8Array[] {
  const w = params.gridWidth;
  const h = params.gridHeight;
  const { birth, survival } = parseRule(params.rule);

  let grid = new Uint8Array(w * h);
  setInitialPattern(grid, w, h, params);

  const history: Uint8Array[] = [grid.slice()];

  for (let gen = 1; gen < params.generations; gen++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const neighbors = countNeighbors(grid, x, y, w, h, params.wrapEdges);
        const alive = grid[y * w + x] === 1;
        if (alive) {
          next[y * w + x] = survival.has(neighbors) ? 1 : 0;
        } else {
          next[y * w + x] = birth.has(neighbors) ? 1 : 0;
        }
      }
    }
    grid = next;
    history.push(grid.slice());
  }

  return history;
}

// --- Main generator: automaton history → ln.js Cubes ---

export function generateAutomataGrid(params: AutomataGridParams): ln.Cube[] {
  const history = runAutomata(params);
  const cubes: ln.Cube[] = [];

  const w = params.gridWidth;
  const h = params.gridHeight;
  const sp = params.spacing;
  const half = params.cubeSize / 2;

  const totalX = (w - 1) * sp;
  const totalY = (h - 1) * sp;
  const totalZ = (history.length - 1) * sp;

  for (let gen = 0; gen < history.length; gen++) {
    const layer = history[gen];
    const pz = gen * sp - totalZ * 0.5;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (layer[y * w + x] === 0) continue;

        const px = x * sp - totalX * 0.5;
        const py = y * sp - totalY * 0.5;

        cubes.push(
          new ln.Cube(
            new ln.Vector(px - half, py - half, pz - half),
            new ln.Vector(px + half, py + half, pz + half),
          ),
        );
      }
    }
  }

  return cubes;
}

// --- Common rule presets for UI ---

export const AUTOMATA_RULE_PRESETS = [
  { name: 'Conway', rule: 'B3/S23', description: 'Classic Game of Life' },
  { name: 'HighLife', rule: 'B36/S23', description: 'Has replicators' },
  { name: 'Day & Night', rule: 'B3678/S34678', description: 'Symmetric growth' },
  { name: 'Seeds', rule: 'B2/S', description: 'Explosive, nothing survives' },
  { name: 'Diamoeba', rule: 'B35678/S5678', description: 'Diamond-like growth' },
  { name: 'Maze', rule: 'B3/S12345', description: 'Generates mazes' },
  { name: 'Anneal', rule: 'B4678/S35678', description: 'Forms blobs' },
  { name: 'Morley', rule: 'B368/S245', description: 'Chaotic patterns' },
];
