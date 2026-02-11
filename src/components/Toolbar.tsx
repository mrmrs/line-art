import { useSceneStore } from '../lib/store';
import { downloadSVG, copySVGToClipboard } from '../lib/export-svg';
import { renderScene } from '../lib/render';
import type { ViewMode } from '../lib/types';

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

  const handleExportSVG = () => {
    const camera = cameras[activeCameraIndex];
    const highQuality = { ...renderSettings, step: 0.01 };
    const result = renderScene(nodes, camera, 1024, 1024, highQuality);
    downloadSVG(result.svg, 'plotter-art.svg');
  };

  const handleCopySVG = async () => {
    const camera = cameras[activeCameraIndex];
    const highQuality = { ...renderSettings, step: 0.01 };
    const result = renderScene(nodes, camera, 1024, 1024, highQuality);
    await copySVGToClipboard(result.svg);
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
      </div>

      <div className="toolbar-right">
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
