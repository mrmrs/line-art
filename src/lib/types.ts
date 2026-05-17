// =============================================================================
// Core Types for the ln.js Plotter Art Studio
// =============================================================================

export type Vec3 = [number, number, number];

// --- Transform ---

export interface TransformParams {
  translate: Vec3;
  rotate: Vec3; // euler angles in degrees (around X, Y, Z)
  scale: Vec3;
}

export const DEFAULT_TRANSFORM: TransformParams = {
  translate: [0, 0, 0],
  rotate: [0, 0, 0],
  scale: [1, 1, 1],
};

// --- Shape Types ---

export type ShapeType =
  | 'cube'
  | 'sphere'
  | 'cone'
  | 'cylinder'
  | 'function'
  | 'mesh'
  | 'point-cloud'
  | 'boolean'
  | 'cube-grid'
  | 'line-grid'
  | 'plane-grid'
  | 'automata-grid'
  | 'svg-extrude'
  | 'text-extrude';

export interface CubeParams {
  min: Vec3;
  max: Vec3;
}

export interface SphereParams {
  center: Vec3;
  radius: number;
}

export interface ConeParams {
  radius: number;
  height: number;
}

export interface CylinderParams {
  radius: number;
  z0: number;
  z1: number;
}

export interface FunctionParams {
  expression: string;
  bounds: { min: Vec3; max: Vec3 };
  direction: 'above' | 'below';
}

export interface MeshParams {
  data: string;
  format: 'obj' | 'stl';
  fileName: string;
}

export type PointCloudPattern =
  | 'random-sphere'
  | 'random-cube'
  | 'fibonacci-sphere'
  | 'grid';

export interface PointCloudParams {
  pointSize: number;
  pattern: PointCloudPattern;
  count: number;
  radius: number;
  gridSpacing: number;
}

export interface BooleanParams {
  operation: 'intersection' | 'difference' | 'union';
  childIds: [string, string];
}

// --- Cube Grid ---

export type GridSizeMethod =
  | 'uniform'
  | 'noise'
  | 'radial'
  | 'radial-inv'
  | 'sine'
  | 'random'
  | 'step'
  | 'gradient'
  | 'manhattan'
  | 'ripple'
  | 'expression';

export type GridPresenceMethod =
  | 'all'
  | 'random'
  | 'threshold'
  | 'checkerboard'
  | 'sphere-mask'
  | 'noise-mask'
  | 'voxel-pyramid'
  | 'voxel-torus'
  | 'voxel-diamond'
  | 'voxel-cross'
  | 'voxel-letter'
  | 'menger-sponge'
  | 'city-skyline'
  | 'heightmap'
  | 'maze'
  | 'expression';

export interface CubeGridParams {
  // Grid structure
  dimensions: '2d' | '3d';
  countX: number;
  countY: number;
  countZ: number;
  spacing: number;

  // Size variation
  sizeMethod: GridSizeMethod;
  sizeMin: number;
  sizeMax: number;
  noiseSeed: number;
  noiseScale: number;
  sineFrequency: Vec3;
  sizeExpression: string;

  // Extra size params
  stepCount: number;                 // for 'step': number of quantization levels
  gradientAxis: 'x' | 'y' | 'z';   // for 'gradient': axis direction

  // Presence
  presenceMethod: GridPresenceMethod;
  presenceProbability: number;
  presenceThreshold: number;
  presenceExpression: string;

  // Voxel shape params
  voxelLetter: string;       // character(s) for 'voxel-letter'
  voxelShellOnly: boolean;   // hollow shapes (surface only)

  // Fractal params
  mengerDepth: number;       // Menger sponge recursion depth (1-4)

  // City params
  cityMinHeight: number;     // min building height in grid units
  cityMaxHeight: number;     // max building height in grid units
  citySeed: number;          // seed for building placement

  // Heightmap params
  heightmapScale: number;    // noise scale for terrain
  heightmapSeed: number;     // noise seed for terrain
  heightmapOctaves: number;  // fractal octaves

  // Maze params
  mazeSeed: number;          // seed for maze generation
  mazeWallThickness: number; // 1 = thin walls, 2+ = thick
}

export const DEFAULT_CUBE_GRID_PARAMS: CubeGridParams = {
  dimensions: '3d',
  countX: 5,
  countY: 5,
  countZ: 5,
  spacing: 0.6,
  sizeMethod: 'uniform',
  sizeMin: 0.05,
  sizeMax: 0.4,
  noiseSeed: 42,
  noiseScale: 1.0,
  sineFrequency: [2, 2, 2],
  sizeExpression: '1 - Math.sqrt(nx*nx + ny*ny + nz*nz)',
  stepCount: 4,
  gradientAxis: 'y',
  presenceMethod: 'all',
  presenceProbability: 0.7,
  presenceThreshold: 0.15,
  presenceExpression: 'ix + iy + iz < 8',
  voxelLetter: 'A',
  voxelShellOnly: false,
  mengerDepth: 2,
  cityMinHeight: 1,
  cityMaxHeight: 8,
  citySeed: 42,
  heightmapScale: 0.5,
  heightmapSeed: 42,
  heightmapOctaves: 3,
  mazeSeed: 42,
  mazeWallThickness: 1,
};

// --- Line Grid ---

export type LineLengthMethod =
  | 'uniform'
  | 'noise'
  | 'random'
  | 'sine'
  | 'radial'
  | 'gradient';

export interface LineGridParams {
  countX: number;
  countY: number;
  lineLength: number;
  spacing: number;
  lineAxis: 'x' | 'y' | 'z';

  // Length variation per line
  lengthMethod: LineLengthMethod;
  lengthMin: number;
  lengthMax: number;
  lengthSeed: number;
  lengthNoiseScale: number;
  lengthSineFreq: number;   // for sine
  lengthGradientAxis: 'x' | 'y'; // which grid axis the gradient follows

  // Gap segmentation — splits each line into two with a gap
  segmented: boolean;
  gapSize: number;           // world-space gap width
  gapMethod: 'center' | 'noise' | 'random' | 'sine';
  gapSeed: number;
  gapNoiseScale: number;
}

export const DEFAULT_LINE_GRID_PARAMS: LineGridParams = {
  countX: 10,
  countY: 10,
  lineLength: 2,
  spacing: 0.3,
  lineAxis: 'z',

  lengthMethod: 'uniform',
  lengthMin: 0.5,
  lengthMax: 2.0,
  lengthSeed: 42,
  lengthNoiseScale: 1.0,
  lengthSineFreq: 2,
  lengthGradientAxis: 'x',

  segmented: false,
  gapSize: 0.3,
  gapMethod: 'noise',
  gapSeed: 77,
  gapNoiseScale: 1.0,
};

// --- Plane Grid (thin 3D rectangles stacked along an axis) ---

export type PlaneSizeMethod =
  | 'uniform'
  | 'noise'
  | 'random'
  | 'sine'
  | 'radial'
  | 'gradient';

export interface PlaneGridParams {
  // How many planes
  count: number;
  // Stacking axis — planes are perpendicular to this axis
  stackAxis: 'x' | 'y' | 'z';
  // Spacing between planes along the stack axis
  spacing: number;

  // Base plane dimensions (the two axes perpendicular to stackAxis)
  planeWidth: number;     // dimension along first perpendicular axis
  planeHeight: number;    // dimension along second perpendicular axis
  thickness: number;      // how thick each "plane" is (thin = plotter effect)

  // Size variation — modulates planeWidth and planeHeight per-plane
  sizeMethod: PlaneSizeMethod;
  sizeMin: number;        // multiplier 0..1 (1 = full size)
  sizeMax: number;
  noiseSeed: number;
  noiseScale: number;
  sineFreq: number;

  // Optional: vary width and height independently (anisotropic noise)
  anisotropic: boolean;   // when true, W and H get separate noise values
}

export const DEFAULT_PLANE_GRID_PARAMS: PlaneGridParams = {
  count: 12,
  stackAxis: 'z',
  spacing: 0.25,
  planeWidth: 3,
  planeHeight: 3,
  thickness: 0.02,
  sizeMethod: 'uniform',
  sizeMin: 0.3,
  sizeMax: 1.0,
  noiseSeed: 42,
  noiseScale: 0.8,
  sineFreq: 2,
  anisotropic: false,
};

// --- Cellular Automata Grid ---

export type AutomataPattern =
  | 'random'
  | 'center'
  | 'glider'
  | 'r-pentomino'
  | 'acorn'
  | 'cross';

export interface AutomataGridParams {
  gridWidth: number;
  gridHeight: number;
  generations: number;
  spacing: number;
  cubeSize: number;
  rule: string;             // B/S notation, e.g. "B3/S23" for Conway
  initialPattern: AutomataPattern;
  randomDensity: number;    // 0-1, for random initial state
  seed: number;
  wrapEdges: boolean;
}

export const DEFAULT_AUTOMATA_GRID_PARAMS: AutomataGridParams = {
  gridWidth: 16,
  gridHeight: 16,
  generations: 20,
  spacing: 0.22,
  cubeSize: 0.18,
  rule: 'B3/S23',
  initialPattern: 'random',
  randomDensity: 0.3,
  seed: 42,
  wrapEdges: true,
};

// =============================================================================
// SVG Extrude — load an SVG and extrude it to 3D
// =============================================================================

export interface SvgExtrudeParams {
  // Source flattened polylines in SVG coordinate space (Y-down). One ring
  // per outer polygon or hole. Winding is determined at triangulation time.
  polylines: number[][][];           // [polyline][point][x|y]
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  filename: string;

  // Extrude parameters
  extrudeDepth: number;              // total Z depth
  bevelDepth: number;                // 0 = no bevel
  bevelSegments: number;             // # of rings
  fitToSize: number;                 // target size of largest dimension in world units
  centerOnOrigin: boolean;
}

export const DEFAULT_SVG_EXTRUDE_PARAMS: SvgExtrudeParams = {
  polylines: [],
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  filename: 'untitled.svg',
  extrudeDepth: 0.6,
  bevelDepth: 0,
  bevelSegments: 2,
  fitToSize: 2,
  centerOnOrigin: true,
};

// =============================================================================
// Text Extrude — 3D typography via opentype.js
// =============================================================================

export type TextAlign = 'left' | 'center' | 'right';

export interface TextExtrudeParams {
  text: string;
  fontId: string;                    // key in font registry
  fontSize: number;                  // in world units (rough — we fit to fitToSize)
  letterSpacing: number;
  lineHeight: number;
  align: TextAlign;
  extrudeDepth: number;
  bevelDepth: number;
  bevelSegments: number;
  fitToSize: number;
  centerOnOrigin: boolean;

  // Cached flattened polylines (computed when text/font/size changes)
  polylines?: number[][][];
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export const DEFAULT_TEXT_EXTRUDE_PARAMS: TextExtrudeParams = {
  text: 'HELLO',
  fontId: 'inter',
  fontSize: 200,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: 'center',
  extrudeDepth: 0.6,
  bevelDepth: 0,
  bevelSegments: 2,
  fitToSize: 3,
  centerOnOrigin: true,
};

// =============================================================================
// Fills — universal hatching / stippling decoration for mesh-like shapes
// =============================================================================

export type FillType = 'cross-hatch' | 'surface-hatch' | 'stipple' | 'contour';

export interface FillConfig {
  id: string;
  type: FillType;
  enabled: boolean;
  // Common
  spacing: number;                   // world units between lines / dots
  pen: number;                       // 1..N — for multi-pen plotter output

  // cross-hatch / contour
  axis: 'x' | 'y' | 'z';
  crossHatchAxes: ('x' | 'y' | 'z')[]; // for 3D cross-hatch; subset of {x,y,z}

  // surface-hatch
  angleDeg: number;                  // in-plane rotation per face

  // stipple
  density: number;                   // points per world unit (approx Poisson radius = 1/sqrt(density))
  dotSize: number;
  surfaceMode: boolean;              // true = sample surface; false = volume

  // contour
  count: number;                     // # of contour planes
}

export function makeDefaultFill(type: FillType, id: string): FillConfig {
  return {
    id,
    type,
    enabled: true,
    spacing: 0.15,
    pen: 1,
    axis: 'z',
    crossHatchAxes: type === 'cross-hatch' ? ['z'] : [],
    angleDeg: 0,
    density: 200,
    dotSize: 0.02,
    surfaceMode: type === 'stipple',
    count: 10,
  };
}

export type ShapeParams =
  | CubeParams
  | SphereParams
  | ConeParams
  | CylinderParams
  | FunctionParams
  | MeshParams
  | PointCloudParams
  | BooleanParams
  | CubeGridParams
  | LineGridParams
  | PlaneGridParams
  | AutomataGridParams
  | SvgExtrudeParams
  | TextExtrudeParams;

// --- Slicing ---

export interface SlicingConfig {
  enabled: boolean;
  axis: 'x' | 'y' | 'z';
  count: number;
  gap: number;
}

export const DEFAULT_SLICING: SlicingConfig = {
  enabled: false,
  axis: 'z',
  count: 10,
  gap: 0,
};

// --- Scene Node ---

export interface SceneNode {
  id: string;
  name: string;
  type: ShapeType;
  params: ShapeParams;
  transform: TransformParams;
  visible: boolean;
  slicing: SlicingConfig;
  fills?: FillConfig[];
}

// --- Camera ---

export interface CameraConfig {
  name: string;
  eye: Vec3;
  center: Vec3;
  up: Vec3;
  fovy: number;
  ortho: boolean;
  orthoSize: number;
  zoom: number; // multiplier: >1 = zoomed in, <1 = zoomed out, 1 = default
}

// --- View ---

export type ViewMode = 'single' | '1x2' | '2x2' | '3x2';

export interface RenderSettings {
  step: number;
  strokeWidth: number;
  strokeColor: string;
  backgroundColor: string;
  near: number;
  far: number;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  step: 0.1,
  strokeWidth: 1,
  strokeColor: '#000000',
  backgroundColor: '#ffffff',
  near: 0.1,
  far: 100,
};

// --- Render Result ---

export interface RenderResult {
  svg: string;
  renderTimeMs: number;
  pathCount: number;
}

// --- Preset ---

export interface ScenePreset {
  name: string;
  description: string;
  icon: string;
  create: () => Omit<SceneNode, 'id'>[];
}
