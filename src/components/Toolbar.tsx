import { useState } from 'react';
import { useSceneStore } from '../lib/store';
import { downloadSVG, copySVGToClipboard } from '../lib/export-svg';
import { renderScene, renderScenePerPen, multiPenSvg } from '../lib/render';
import { optimizePathOrder } from '../lib/plotter-optimize';
import type { ViewMode } from '../lib/types';

// Paper sizes in pixels at 96 DPI. Width/height pairs; we render at these
// pixel dimensions and the resulting SVG can be printed/plotted at scale.
const PAPER_SIZES: Record<string, { w: number; h: number; label: string }> = {
  square:  { w: 1024, h: 1024, label: 'Square 1024' },
  A4:      { w: 794,  h: 1123, label: 'A4 portrait' },
  A4L:     { w: 1123, h: 794,  label: 'A4 landscape' },
  A3:      { w: 1123, h: 1587, label: 'A3 portrait' },
  A3L:     { w: 1587, h: 1123, label: 'A3 landscape' },
  letter:  { w: 816,  h: 1056, label: 'US Letter' },
  '12x18': { w: 1152, h: 1728, label: '12x18 in' },
};

// Default cycling palette for pens 2+ (pen 1 uses the user's stroke color).
const PEN_PALETTE: Record<number, string> = {
  2: '#d8463a',  // red
  3: '#3aa1d8',  // blue
  4: '#3ad864',  // green
  5: '#d8b53a',  // amber
  6: '#a93ad8',  // violet
  7: '#3ad8c3',  // cyan
  8: '#d83a8b',  // pink
};

// =============================================================================
// Top Toolbar: view mode, export, settings
// =============================================================================

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'single', label: '1', icon: '\u25A1' },
  { value: '1x2', label: '1\u00D72', icon: '\u25EB' },
  { value: '2x2', label: '2\u00D72', icon: '\u2B1A' },
  { value: '3x2', label: '3\u00D72', icon: '\u2593' },
];

export function Toolbar() {
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const nodes = useSceneStore((s) => s.nodes);
  const cameras = useSceneStore((s) => s.cameras);
  const activeCameraIndex = useSceneStore((s) => s.activeCameraIndex);
  const renderSettings = useSceneStore((s) => s.renderSettings);
  const updateRenderSettings = useSceneStore((s) => s.updateRenderSettings);

  const [paperSize, setPaperSize] = useState<keyof typeof PAPER_SIZES>('square');
  const [optimize, setOptimize] = useState(true);

  const hasMultiplePens = (() => {
    const pens = new Set<number>();
    for (const n of nodes) for (const f of n.fills ?? []) if (f.enabled) pens.add(f.pen);
    return pens.size > 1;
  })();

  const buildExportSVG = (): string => {
    const camera = cameras[activeCameraIndex];
    const highQuality = { ...renderSettings, step: 0.01 };
    const { w, h } = PAPER_SIZES[paperSize];
    if (hasMultiplePens) {
      const { penGroups } = renderScenePerPen(nodes, camera, w, h, highQuality);
      const optimized = optimize
        ? penGroups.map((g) => ({ ...g, paths: optimizePathOrder(g.paths) }))
        : penGroups;
      return multiPenSvg(optimized, w, h, highQuality, PEN_PALETTE);
    }
    return renderScene(nodes, camera, w, h, highQuality).svg;
  };

  const handleExportSVG = () => {
    downloadSVG(buildExportSVG(), 'plotter-art.svg');
  };

  const handleCopySVG = async () => {
    await copySVGToClipboard(buildExportSVG());
  };

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <h1 className="toolbar-title">ln.studio</h1>
        <span className="toolbar-subtitle">plotter art engine</span>
      </div>

      <div className="toolbar-center">
        <div className="toolbar-group">
          <label className="toolbar-label">View</label>
          <div className="button-group">
            {VIEW_MODES.map((m) => (
              <button
                key={m.value}
                className={`btn btn-sm ${viewMode === m.value ? 'active' : ''}`}
                onClick={() => setViewMode(m.value)}
                title={m.label}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label className="toolbar-label">Stroke</label>
          <input
            type="number"
            className="input input-sm"
            value={renderSettings.strokeWidth}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(e) =>
              updateRenderSettings({ strokeWidth: parseFloat(e.target.value) || 1 })
            }
            style={{ width: 52 }}
          />
          <input
            type="color"
            className="input-color"
            value={renderSettings.strokeColor}
            onChange={(e) =>
              updateRenderSettings({ strokeColor: e.target.value })
            }
          />
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label className="toolbar-label">Bg</label>
          <input
            type="color"
            className="input-color"
            value={renderSettings.backgroundColor}
            onChange={(e) =>
              updateRenderSettings({ backgroundColor: e.target.value })
            }
          />
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label className="toolbar-label">Quality</label>
          <select
            className="input input-sm"
            value={renderSettings.step}
            onChange={(e) =>
              updateRenderSettings({ step: parseFloat(e.target.value) })
            }
          >
            <option value={0.1}>Draft (0.1)</option>
            <option value={0.05}>Medium (0.05)</option>
            <option value={0.01}>High (0.01)</option>
            <option value={0.005}>Ultra (0.005)</option>
          </select>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label className="toolbar-label">Paper</label>
          <select
            className="input input-sm"
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value as keyof typeof PAPER_SIZES)}
            title="Export size"
          >
            {Object.entries(PAPER_SIZES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <label className="toolbar-label" style={{ marginLeft: 8 }}>
            <input
              type="checkbox"
              checked={optimize}
              onChange={(e) => setOptimize(e.target.checked)}
              title="Reorder paths for shorter pen travel"
              style={{ marginRight: 4 }}
            />
            optimize
          </label>
        </div>
      </div>

      <div className="toolbar-right">
        <button
          className="btn btn-sm"
          onClick={() => useSceneStore.temporal.getState().undo()}
          title="Undo (Cmd+Z)"
        >
          ↶
        </button>
        <button
          className="btn btn-sm"
          onClick={() => useSceneStore.temporal.getState().redo()}
          title="Redo (Cmd+Shift+Z)"
        >
          ↷
        </button>
        <button className="btn btn-sm" onClick={handleCopySVG} title="Copy SVG to clipboard">
          Copy SVG
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleExportSVG}>
          Export SVG
        </button>
      </div>
    </header>
  );
}
