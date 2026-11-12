export type MotifKind = 'prism' | 'orb' | 'cut-orb' | 'frame' | 'steps';
export type CompositionConstruction = 'shared' | 'free';
export type Point2 = [number, number];
export interface CompositionInstance {
  id: string;
  motif: MotifKind;
  x: number;
  y: number;
  size: number;
  aspect: number;
  depth: number;
  angle: number;
  tilt: number;
  pinned: boolean;
  /** Missing preserves the original independently tilted construction. */
  construction?: CompositionConstruction;
  /** Resolved ancestry for nested assemblies; absent on root forms. */
  parentId?: string;
  generation?: number;
}
export interface QuietRegion { id: string; x: number; y: number; width: number; height: number }
export interface CompositionParams {
  version: 1;
  seed: number;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  clearanceMm: number;
  minSizeMm: number;
  maxSizeMm: number;
  density: number;
  aspect: number;
  coherence: number;
  depth: number;
  detail: number;
  maxInstances: number;
  construction?: CompositionConstruction;
  /** Missing means legacy whole-hull occupancy. */
  nesting?: boolean;
  recursionDepth?: number;
  recursionScale?: number;
  motifs: MotifKind[];
  quiet: QuietRegion[];
  instances: CompositionInstance[];
}
export const MOTIFS: { value: MotifKind; label: string }[] = [
  { value: 'prism', label: 'Prisms' }, { value: 'orb', label: 'Ellipsoids' },
  { value: 'cut-orb', label: 'Sliced orbs' }, { value: 'frame', label: 'Frames' },
  { value: 'steps', label: 'Steps' },
];
export const DEFAULT_COMPOSITION: CompositionParams = {
  version: 1, seed: 42, widthMm: 210, heightMm: 297, marginMm: 12,
  clearanceMm: 1.2, minSizeMm: 7, maxSizeMm: 38, density: 0.55,
  aspect: 2.8, coherence: 0.85, depth: 0.6, detail: 5, maxInstances: 500,
  construction: 'shared', nesting: true, recursionDepth: 0, recursionScale: 0.5,
  motifs: ['prism', 'frame', 'steps'], quiet: [], instances: [],
};
export const COMPOSITION_PRESETS = [
  { name: 'Recursive arcades', description: 'Frames within frames, branching into smaller chambers.', values: { motifs: ['frame'] as MotifKind[], aspect: 1.6, coherence: 0.9, depth: 0.2, seed: 271, minSizeMm: 2, maxSizeMm: 90, clearanceMm: 0.6, density: 0.55, nesting: true, recursionDepth: 3, recursionScale: 0.5 } },
  { name: 'Folded mineral', description: 'Facets, terraces and elongated frames.', values: { recursionDepth: 0, motifs: ['prism', 'steps', 'frame'] as MotifKind[], aspect: 3.5, coherence: 0.92, depth: 0.7, seed: 42 } },
  { name: 'Orbital reliquary', description: 'Rounded volumes, cut surfaces and quiet apertures.', values: { recursionDepth: 0, motifs: ['orb', 'cut-orb', 'frame'] as MotifKind[], aspect: 1.8, coherence: 0.55, depth: 0.65, seed: 91 } },
  { name: 'Stepped foundry', description: 'Long beams and closely fitted architectural forms.', values: { recursionDepth: 0, motifs: ['steps', 'prism'] as MotifKind[], aspect: 4.5, coherence: 1, depth: 0.45, seed: 137 } },
];
