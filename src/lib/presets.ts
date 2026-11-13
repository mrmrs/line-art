import type {
  ScenePreset,
  CubeGridParams,
  LineGridParams,
  PlaneGridParams,
  AutomataGridParams,
} from './types';
import {
  DEFAULT_TRANSFORM,
  DEFAULT_SLICING,
  DEFAULT_CUBE_GRID_PARAMS,
  DEFAULT_LINE_GRID_PARAMS,
  DEFAULT_PLANE_GRID_PARAMS,
  DEFAULT_AUTOMATA_GRID_PARAMS,
  makeDefaultFill,
} from './types';

// =============================================================================
// Scene Presets: one-click example scenes
// =============================================================================

const t = DEFAULT_TRANSFORM;
const s = DEFAULT_SLICING;

export const PRESETS: ScenePreset[] = [
  {
    name: 'Line Grid',
    description: 'Grid of vertical lines',
    icon: 'lines',
    create: () => [
      {
        name: 'Line Grid',
        type: 'line-grid',
        params: {
          ...DEFAULT_LINE_GRID_PARAMS,
          countX: 12,
          countY: 12,
          lineLength: 2,
          spacing: 0.3,
          lineAxis: 'z',
        } satisfies LineGridParams,
        transform: { ...t, scale: [0.82, 0.82, 0.82] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Wave Lines',
    description: 'A flowing wave cut into floating vertical strokes',
    icon: 'waveLines',
    create: () => [
      {
        name: 'Wave Lines',
        type: 'line-grid',
        params: {
          ...DEFAULT_LINE_GRID_PARAMS,
          countX: 16,
          countY: 16,
          lineLength: 2.5,
          spacing: 0.24,
          lineAxis: 'z',
          lengthMethod: 'sine',
          lengthMin: 0.3,
          lengthMax: 2.0,
          lengthSineFreq: 1.5,
          segmented: true,
          gapSize: 0.12,
        } satisfies LineGridParams,
        transform: { ...t, scale: [0.8, 0.8, 0.8] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Radial Lines',
    description: 'Line lengths diminish from center',
    icon: 'radialLines',
    create: () => [
      {
        name: 'Radial Lines',
        type: 'line-grid',
        params: {
          ...DEFAULT_LINE_GRID_PARAMS,
          countX: 18,
          countY: 18,
          spacing: 0.22,
          lineAxis: 'z',
          lengthMethod: 'radial',
          lengthMin: 0.1,
          lengthMax: 3.0,
        } satisfies LineGridParams,
        transform: { ...t, scale: [0.78, 0.78, 0.78] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Wave Surface',
    description: 'A woven saddle of intersecting sine waves',
    icon: 'surface',
    create: () => [
      {
        name: 'Wave',
        type: 'function',
        params: {
          expression: 'Math.sin(x * 1.6) * Math.cos(y * 1.6) * 0.5',
          bounds: {
            min: [-1.8, -1.8, -1.5] as [number, number, number],
            max: [1.8, 1.8, 1.5] as [number, number, number],
          },
          direction: 'below' as const,
        },
        transform: { ...t, scale: [0.8, 0.8, 0.8] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Sliced Sphere',
    description: 'Twenty-four contour rings through a sphere',
    icon: 'slices',
    create: () => [
      {
        name: 'Sliced Sphere',
        type: 'sphere',
        params: { center: [0, 0, 0] as [number, number, number], radius: 1.5 },
        transform: { ...t },
        visible: true,
        slicing: { enabled: true, axis: 'z' as const, count: 24 },
      },
    ],
  },
  {
    name: 'Fibonacci Orb',
    description: 'Eight hundred evenly spaced points on a sphere',
    icon: 'points',
    create: () => [
      {
        name: 'Fibonacci Cloud',
        type: 'point-cloud',
        params: {
          pointSize: 0.015,
          pattern: 'fibonacci-sphere' as const,
          count: 800,
          radius: 1.5,
          gridSpacing: 0.3,
        },
        transform: { ...t },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Noise Lattice',
    description: 'A dense cube lattice shaped by a coherent noise field',
    icon: 'noise',
    create: () => [
      {
        name: 'Noise Lattice',
        type: 'cube-grid',
        params: {
          ...DEFAULT_CUBE_GRID_PARAMS,
          dimensions: '3d',
          countX: 12,
          countY: 12,
          countZ: 12,
          spacing: 0.25,
          sizeMethod: 'noise',
          sizeMin: 0.02,
          sizeMax: 0.20,
          noiseScale: 0.8,
          noiseSeed: 42,
          presenceMethod: 'threshold',
          presenceThreshold: 0.12,
        } satisfies CubeGridParams,
        transform: { ...t, scale: [0.78, 0.78, 0.78] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Menger Sponge',
    description: 'A recursive cube pierced by nested square tunnels',
    icon: 'menger',
    create: () => [
      {
        name: 'Menger Sponge',
        type: 'cube-grid',
        params: {
          ...DEFAULT_CUBE_GRID_PARAMS,
          dimensions: '3d',
          countX: 9,
          countY: 9,
          countZ: 9,
          spacing: 0.4,
          sizeMethod: 'uniform',
          sizeMin: 0.32,
          sizeMax: 0.32,
          presenceMethod: 'menger-sponge',
          mengerDepth: 2,
          voxelShellOnly: false,
        } satisfies CubeGridParams,
        transform: { ...t, scale: [0.68, 0.68, 0.68] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Voxel Torus',
    description: 'A sculptural ring built from separated cubes',
    icon: 'torus',
    create: () => [
      {
        name: 'Voxel Torus',
        type: 'cube-grid',
        params: {
          ...DEFAULT_CUBE_GRID_PARAMS,
          dimensions: '3d',
          countX: 14,
          countY: 14,
          countZ: 18,
          spacing: 0.25,
          sizeMethod: 'uniform',
          sizeMin: 0.19,
          sizeMax: 0.19,
          presenceMethod: 'voxel-torus',
          voxelShellOnly: false,
        } satisfies CubeGridParams,
        transform: { ...t, rotate: [25, 0, 0], scale: [0.85, 0.85, 0.85] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Wave Stack',
    description: 'Thin square plates swell and taper into a sculptural stack',
    icon: 'spindle',
    create: () => [
      {
        name: 'Wave Stack',
        type: 'plane-grid',
        params: {
          ...DEFAULT_PLANE_GRID_PARAMS,
          count: 32,
          stackAxis: 'z',
          spacing: 0.1,
          planeWidth: 2.8,
          planeHeight: 2.8,
          thickness: 0.015,
          sizeMethod: 'sine',
          sizeMin: 0.15,
          sizeMax: 1.0,
          sineFreq: 1.5,
        } satisfies PlaneGridParams,
        transform: { ...t, scale: [0.8, 0.8, 0.8] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Glider Tower',
    description: 'Single glider traced through time',
    icon: 'glider',
    create: () => [
      {
        name: 'Glider Tower',
        type: 'automata-grid',
        params: {
          ...DEFAULT_AUTOMATA_GRID_PARAMS,
          gridWidth: 20,
          gridHeight: 20,
          generations: 18,
          spacing: 0.18,
          cubeSize: 0.14,
          rule: 'B3/S23',
          initialPattern: 'glider',
          seed: 0,
          wrapEdges: false,
        } satisfies AutomataGridParams,
        transform: { ...t, translate: [-0.4, -0.4, 0] },
        visible: true,
        slicing: { ...s },
      },
    ],
  },
  {
    name: 'Ripple Surface',
    description: 'Concentric waves rising into a central peak',
    icon: 'ripple',
    create: () => [{
      name: 'Ripple Surface', type: 'function',
      params: {
        expression: 'Math.cos(Math.sqrt(x*x+y*y)*5)/(1+x*x+y*y)',
        bounds: { min: [-1.8, -1.8, -1.2], max: [1.8, 1.8, 1.2] }, direction: 'below',
      },
      transform: { ...t, scale: [0.8, 0.8, 0.8] }, visible: true, slicing: { ...s },
    }],
  },
  {
    name: 'Twisted Stack',
    description: 'Thirty-two fine plates turning through a half revolution',
    icon: 'twist',
    create: () => Array.from({ length: 32 }, (_, i) => ({
      name: `Plate ${i + 1}`, type: 'cube',
      params: { min: [-0.9, -0.9, -0.025], max: [0.9, 0.9, 0.025] },
      transform: { translate: [0, 0, (i - 15.5) * 0.095], rotate: [0, 0, i * 5.625], scale: [1, 1, 1] },
      visible: true, slicing: { ...s },
    })),
  },
  {
    name: 'Stepped City',
    description: 'A compact skyline with broad avenues and staggered towers',
    icon: 'city',
    create: () => Array.from({ length: 36 }, (_, i) => {
      const x = i % 6, y = Math.floor(i / 6);
      const height = 0.4 + ((x * 17 + y * 31 + x * y * 7) % 13) * 0.16;
      return {
        name: `Tower ${i + 1}`, type: 'cube',
        params: { min: [-0.18, -0.18, -1.1], max: [0.18, 0.18, height - 1.1] },
        transform: { translate: [(x - 2.5) * 0.5, (y - 2.5) * 0.5, 0], rotate: [0, 0, 0], scale: [1, 1, 1] },
        visible: true, slicing: { ...s },
      };
    }),
  },
  {
    name: 'Hatched Blocks',
    description: 'Three staggered blocks with contrasting face hatching',
    icon: 'hatch',
    create: () => Array.from({ length: 3 }, (_, i) => ({
      name: `Hatched Block ${i + 1}`, type: 'cube',
      params: { min: [-0.45, -0.45, -0.45], max: [0.45, 0.45, 0.45] },
      transform: { translate: [(i - 1) * 0.9, -(i - 1) * 0.9, (i - 1) * 0.15], rotate: [0, 0, 0], scale: [1, 1, 1] },
      visible: true, slicing: { ...s },
      fills: [
        { ...makeDefaultFill('surface-hatch', `side-${i}`), faceAxis: 'x', spacing: 0.055, angleDeg: 45 },
        { ...makeDefaultFill('surface-hatch', `top-${i}`), faceAxis: 'z', spacing: 0.11, angleDeg: 0 },
      ],
    })),
  },
];
