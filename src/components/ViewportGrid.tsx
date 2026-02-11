import { useSceneStore } from '../lib/store';
import { Viewport } from './Viewport';

// =============================================================================
// Multi-camera grid: renders multiple viewports in a grid layout
// =============================================================================

export function ViewportGrid() {
  const viewMode = useSceneStore((s) => s.viewMode);

  const gridConfig = getGridConfig(viewMode);

  return (
    <div
      className="viewport-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
        gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
        gap: '2px',
        width: '100%',
        height: '100%',
        background: 'var(--color-border)',
      }}
    >
      {gridConfig.cameras.map((camIdx) => (
        <Viewport key={camIdx} cameraIndex={camIdx} showLabel={gridConfig.cameras.length > 1} />
      ))}
    </div>
  );
}

function getGridConfig(mode: string): {
  cols: number;
  rows: number;
  cameras: number[];
} {
  switch (mode) {
    case '1x2':
      return { cols: 2, rows: 1, cameras: [0, 1] };
    case '2x2':
      return { cols: 2, rows: 2, cameras: [0, 1, 2, 3] };
    case '3x2':
      return { cols: 3, rows: 2, cameras: [0, 1, 2, 3, 4, 5] };
    case 'single':
    default:
      return { cols: 1, rows: 1, cameras: [0] };
  }
}
