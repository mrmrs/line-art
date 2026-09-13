import { renderScenePerPen, multiPenSvg } from './render';
import { preparePlot } from './plot-output';
import type { SceneNode, CameraConfig, RenderSettings } from './types';
import type { PlotSettings } from './plot-settings';
export interface ExportRequest {
  nodes: SceneNode[];
  camera: CameraConfig;
  settings: RenderSettings;
  width: number;
  height: number;
  pageWidthMm: number;
  pageHeightMm: number;
  plot: PlotSettings;
  optimize: boolean;
}
self.onmessage = (event: MessageEvent<ExportRequest>) => {
  try {
    const r = event.data;
    self.postMessage({ type: 'progress', message: 'Rendering geometry…' });
    const { penGroups } = renderScenePerPen(
      r.nodes,
      r.camera,
      r.width,
      r.height,
      r.settings,
      (pen) =>
        self.postMessage({
          type: 'progress',
          message: `Rendering pen ${pen}…`,
        }),
    );
    self.postMessage({
      type: 'progress',
      message: 'Clipping, simplifying and ordering strokes…',
    });
    const plot = {
      ...r.plot,
      lockDirection:
        r.plot.lockDirection || r.nodes.some((n) => n.directionLocked),
    };
    const { groups, stats } = preparePlot(
      penGroups,
      r.pageWidthMm,
      r.pageHeightMm,
      r.width,
      r.height,
      plot,
      r.optimize,
    );
    const colors = {
      2: '#d8463a',
      3: '#3aa1d8',
      4: '#3ad864',
      5: '#d8b53a',
      6: '#a93ad8',
      7: '#3ad8c3',
      8: '#d83a8b',
    };
    const svg = multiPenSvg(
      groups,
      r.width,
      r.height,
      {
        ...r.settings,
        strokeWidth: (r.plot.penDiameterMm * r.width) / r.pageWidthMm,
      },
      colors,
      { width: `${r.pageWidthMm}mm`, height: `${r.pageHeightMm}mm` },
    );
    self.postMessage({ type: 'result', svg, stats });
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error) });
  }
};
