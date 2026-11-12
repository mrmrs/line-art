import type { SceneNode, ShapeParams, Vec3, FillConfig } from './types';
import type { CompositionParams } from './composition-types';

function sampler(random: () => number) {
  const value = (min: number, max: number) => Math.round((min + random() * (max - min)) * 100) / 100;
  const integer = (min: number, max: number) => Math.min(max, Math.floor(min + random() * (max - min + 1)));
  const pick = <T,>(values: readonly T[]): T => values[integer(0, values.length - 1)];
  const vector = (min: number, max: number): Vec3 => [value(min, max), value(min, max), value(min, max)];
  return { value, integer, pick, vector, seed: () => integer(0, 1_000_000) };
}

// Curated ranges bound generated work, preserve imported content and keep
// dependent endpoints ordered. One returned update means one undo step.
export function randomizeShape(node: SceneNode, random = Math.random): Partial<SceneNode> {
  const { value: v, integer: i, pick, vector, seed } = sampler(random);
  let params: Record<string, unknown> = {};
  switch (node.type) {
    case 'cube': params = { min: vector(-1.8, -0.2), max: vector(0.2, 1.8) }; break;
    case 'sphere': params = { center: vector(-0.4, 0.4), radius: v(0.3, 2) }; break;
    case 'cone': params = { radius: v(0.3, 1.8), height: v(0.5, 3) }; break;
    case 'cylinder': params = { radius: v(0.3, 1.8), z0: v(-1.5, -0.1), z1: v(0.1, 1.5) }; break;
    case 'function': params = { expression: pick(['sin(x*2)*cos(y*2)', 'cos(sqrt(x*x+y*y)*3)', 'sin(x+y)*0.7', 'cos(x*2)+sin(y*2)']), direction: pick(['above', 'below']), bounds: { min: vector(-3, -1), max: vector(1, 3) } }; break;
    case 'point-cloud': params = { pattern: pick(['random-sphere', 'random-cube', 'fibonacci-sphere', 'grid']), count: i(50, 500), radius: v(0.5, 1.5), gridSpacing: v(0.25, 0.6), pointSize: v(0.01, 0.05) }; break;
    case 'boolean': params = { operation: pick(['union', 'difference', 'intersection']) }; break;
    case 'cube-grid': {
      const spacing = v(0.4, 0.9);
      params = { dimensions: pick(['2d', '3d']), countX: i(3, 8), countY: i(3, 8), countZ: i(2, 6), spacing,
        sizeMethod: pick(['uniform', 'noise', 'radial', 'radial-inv', 'sine', 'random', 'step', 'gradient', 'manhattan', 'ripple']),
        sizeMin: v(0.08, 0.18), sizeMax: spacing * v(0.55, 0.95), noiseSeed: seed(), noiseScale: v(0.2, 2), sineFrequency: vector(0.5, 4), stepCount: i(2, 8), gradientAxis: pick(['x', 'y', 'z']),
        presenceMethod: pick(['all', 'random', 'checkerboard', 'sphere-mask', 'noise-mask', 'voxel-pyramid', 'voxel-torus', 'voxel-diamond', 'voxel-cross', 'city-skyline', 'heightmap', 'maze']),
        presenceProbability: v(0.3, 0.9), presenceThreshold: v(0.05, 0.15), voxelShellOnly: random() > 0.5,
        mengerDepth: i(1, 2), cityMinHeight: i(1, 2), cityMaxHeight: i(3, 6), citySeed: seed(), heightmapScale: v(0.15, 0.9), heightmapSeed: seed(), heightmapOctaves: i(1, 4), mazeSeed: seed(), mazeWallThickness: i(1, 2) }; break;
    }
    case 'line-grid': params = { countX: i(4, 18), countY: i(4, 18), lineLength: v(1, 3), spacing: v(0.15, 0.5), lineAxis: pick(['x', 'y', 'z']), lengthMethod: pick(['uniform', 'noise', 'random', 'sine', 'radial', 'gradient']), lengthMin: v(0.1, 0.5), lengthMax: v(0.6, 3), lengthSeed: seed(), lengthNoiseScale: v(0.2, 2), lengthSineFreq: v(0.5, 4), lengthGradientAxis: pick(['x', 'y']), segmented: random() > 0.5, gapSize: v(0.05, 0.3), gapMethod: pick(['center', 'noise', 'random', 'sine']), gapSeed: seed(), gapNoiseScale: v(0.2, 2) }; break;
    case 'plane-grid': params = { count: i(5, 24), stackAxis: pick(['x', 'y', 'z']), spacing: v(0.12, 0.4), planeWidth: v(1, 4), planeHeight: v(1, 4), thickness: v(0.01, 0.08), sizeMethod: pick(['uniform', 'noise', 'random', 'sine', 'radial', 'gradient']), sizeMin: v(0.15, 0.4), sizeMax: v(0.6, 1), noiseSeed: seed(), noiseScale: v(0.2, 2), sineFreq: v(0.5, 4), anisotropic: random() > 0.5 }; break;
    case 'automata-grid': params = { gridWidth: i(8, 16), gridHeight: i(8, 16), generations: i(5, 12), spacing: v(0.2, 0.4), cubeSize: v(0.08, 0.18), rule: pick(['B3/S23', 'B36/S23', 'B2/S']), initialPattern: pick(['random', 'center', 'glider', 'r-pentomino', 'acorn', 'cross']), randomDensity: v(0.2, 0.5), seed: seed(), wrapEdges: random() > 0.5 }; break;
    case 'svg-extrude': params = { extrudeDepth: v(0.1, 1.5), fitToSize: v(1, 4) }; break;
    case 'text-extrude': params = { extrudeDepth: v(0.1, 1.5), fitToSize: v(1, 5), letterSpacing: v(-2, 12), lineHeight: v(1, 1.8), align: pick(['left', 'center', 'right']) }; break;
    case 'mesh': return { transform: { ...node.transform, rotate: vector(-90, 90), scale: vector(0.5, 1.5) } };
    case 'packed-composition': return {};
  }
  return { params: { ...node.params, ...params } as ShapeParams };
}

export function randomizeFill(fill: FillConfig, random = Math.random): Partial<FillConfig> {
  const { value: v, integer: i, pick } = sampler(random);
  return { spacing: v(0.08, 0.3), angleDeg: i(0, 35) * 5, density: i(20, 150), dotSize: v(0.005, 0.02), count: i(4, 20), axis: pick(['x', 'y', 'z']), crossHatchAxes: pick([['x'], ['y'], ['z'], ['x', 'z']]), faceAxis: pick(['all', 'x', 'y', 'z']), surfaceMode: fill.surfaceMode };
}

export function randomizeComposition(p: CompositionParams, random = Math.random): CompositionParams {
  const { value: v, integer: i, seed } = sampler(random);
  const shortEdge = Math.min(p.widthMm, p.heightMm) - p.marginMm * 2;
  return { ...p, seed: seed(), density: v(0.3, 0.7), minSizeMm: Math.max(2, Math.min(7, shortEdge / 12)), maxSizeMm: Math.max(8, Math.min(70, shortEdge * v(0.15, 0.4))), aspect: v(1, 4.5), coherence: v(0.2, 1), depth: v(0.2, 1), detail: i(2, 8) };
}
