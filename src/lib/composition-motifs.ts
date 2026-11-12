import type { CompositionInstance } from './composition-types';

/** Axis-aligned local solid bounds: minimum XYZ followed by maximum XYZ. */
export type MotifBox = readonly [x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number];

/** Local plane shared by sliced-sphere construction and silhouette support. */
export const CUT_ORB_HEIGHT = 0.35;

const PRISM_BOXES: readonly MotifBox[] = [[-1, -1, -1, 1, 1, 1]];
const STEP_BOXES: readonly MotifBox[] = [
  [-1, -1, -1, 1, 1, -0.35],
  [-0.65, -1, -0.35, 1, 0.65, 0.3],
  [-0.3, -1, 0.3, 1, 0.3, 1],
];
const NO_BOXES: readonly MotifBox[] = [];

/**
 * Half-widths of the unobstructed local aperture. With shared construction,
 * every rail is 20% of the smaller physical plan extent. Local X scales by
 * sqrt(aspect) and Y by its reciprocal, so the X wall must shrink by aspect.
 * Missing construction markers preserve the original stretched-stock frame.
 */
export function frameOpening(instance: CompositionInstance): [number, number] {
  return instance.construction === 'shared'
    ? [1 - 0.4 / instance.aspect, 0.6]
    : [0.6, 0.6];
}

/**
 * Canonical solid pieces for both geometry and projected occupancy. Frame
 * rails meet at their faces without overlapping volumes; terrace levels use
 * the same shared boundaries. Curved motifs have no box decomposition here.
 */
export function motifBoxes(instance: CompositionInstance): readonly MotifBox[] {
  if (instance.motif === 'prism') return PRISM_BOXES;
  if (instance.motif === 'steps') return STEP_BOXES;
  if (instance.motif !== 'frame') return NO_BOXES;
  const [innerX, innerY] = frameOpening(instance);
  return [
    [-1, -1, -1, -innerX, 1, 1],
    [innerX, -1, -1, 1, 1, 1],
    [-innerX, -1, -1, innerX, -innerY, 1],
    [-innerX, innerY, -1, innerX, 1, 1],
  ];
}
