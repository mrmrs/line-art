import type {
  SceneNode,
  CubeGridParams,
  LineGridParams,
  PlaneGridParams,
  AutomataGridParams,
  PointCloudParams,
  MeshParams,
} from './types';

// =============================================================================
// Approximate complexity per node — shown in the scene tree to help users
// spot the expensive nodes. Returns a short label like "27k cells" or "8MB".
// =============================================================================

export function nodeComplexity(node: SceneNode): string | null {
  switch (node.type) {
    case 'cube-grid': {
      const p = node.params as CubeGridParams;
      const cells = p.dimensions === '3d'
        ? p.countX * p.countY * p.countZ
        : p.countX * p.countY;
      return formatCount(cells, 'cells');
    }
    case 'plane-grid': {
      const p = node.params as PlaneGridParams;
      return formatCount(p.count, 'planes');
    }
    case 'automata-grid': {
      const p = node.params as AutomataGridParams;
      const upper = p.gridWidth * p.gridHeight * p.generations;
      return `≤${formatCount(upper, 'cells')}`;
    }
    case 'line-grid': {
      const p = node.params as LineGridParams;
      const lines = p.countX * p.countY * (p.segmented ? 2 : 1);
      return formatCount(lines, 'lines');
    }
    case 'point-cloud': {
      const p = node.params as PointCloudParams;
      // Grid pattern derives count from radius/spacing
      if (p.pattern === 'grid') {
        const n = Math.floor((2 * p.radius) / Math.max(p.gridSpacing, 0.01)) + 1;
        return formatCount(n * n * n, 'pts');
      }
      return formatCount(p.count, 'pts');
    }
    case 'mesh': {
      const p = node.params as MeshParams;
      const bytes = p.data?.length ?? 0;
      return formatBytes(bytes);
    }
    default:
      return null;
  }
}

function formatCount(n: number, unit: string): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${unit}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k ${unit}`;
  return `${n} ${unit}`;
}

function formatBytes(b: number): string {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${Math.round(b / 1_024)} KB`;
  return `${b} B`;
}
