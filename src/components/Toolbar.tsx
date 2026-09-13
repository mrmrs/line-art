import { useRef, useState } from 'react';
import { useSceneStore, snapshotScene, reportError } from '../lib/store';
import { serializeScene, parseScene } from '../lib/scene-file';
import { ExportPanel } from './ExportPanel';
import { downloadText } from '../lib/export-svg';
import type { ViewMode } from '../lib/types';

// Paper sizes — pixel dimensions at 96 DPI for the render viewport AND
// physical dimensions for the exported <svg width/height>. Plotters honor the
// physical units; viewBox stays in pixel-space so the render coordinates map
// 1:1 to plot coordinates.
const PAPER_SIZES: Record<
  string,
  {
    w: number;
    h: number; // pixels (render size)
    physW: string;
    physH: string; // physical size attributes
    label: string;
  }
> = {
  square: {
    w: 1024,
    h: 1024,
    physW: '250mm',
    physH: '250mm',
    label: 'Square 250mm',
  },
  A4: {
    w: 794,
    h: 1123,
    physW: '210mm',
    physH: '297mm',
    label: 'A4 (210×297mm)',
  },
  A4L: {
    w: 1123,
    h: 794,
    physW: '297mm',
    physH: '210mm',
    label: 'A4 landscape',
  },
  A3: {
    w: 1123,
    h: 1587,
    physW: '297mm',
    physH: '420mm',
    label: 'A3 (297×420mm)',
  },
  A3L: {
    w: 1587,
    h: 1123,
    physW: '420mm',
    physH: '297mm',
    label: 'A3 landscape',
  },
  A2: {
    w: 1587,
    h: 2245,
    physW: '420mm',
    physH: '594mm',
    label: 'A2 (420×594mm)',
  },
  letter: {
    w: 816,
    h: 1056,
    physW: '8.5in',
    physH: '11in',
    label: 'US Letter (8.5×11in)',
  },
  tabloid: {
    w: 1056,
    h: 1632,
    physW: '11in',
    physH: '17in',
    label: 'Tabloid (11×17in)',
  },
  '12x18': {
    w: 1152,
    h: 1728,
    physW: '12in',
    physH: '18in',
    label: '12×18 in',
  },
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
  const renderSettings = useSceneStore((s) => s.renderSettings);
  const updateRenderSettings = useSceneStore((s) => s.updateRenderSettings);

  const [paperSize, setPaperSize] =
    useState<keyof typeof PAPER_SIZES>('square');
  const [optimize, setOptimize] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const paper = PAPER_SIZES[paperSize];
  const mm = (dimension: string) =>
    parseFloat(dimension) * (dimension.endsWith('in') ? 25.4 : 1);

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
              updateRenderSettings({
                strokeWidth: parseFloat(e.target.value) || 1,
              })
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
            onChange={(e) =>
              setPaperSize(e.target.value as keyof typeof PAPER_SIZES)
            }
            title="Export size"
          >
            {Object.entries(PAPER_SIZES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
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
        <button
          className="btn btn-sm"
          onClick={() => {
            try {
              downloadText(
                serializeScene(snapshotScene()),
                'drawing.lnscene',
                'application/json',
              );
            } catch (error) {
              reportError(error);
            }
          }}
        >
          Save scene
        </button>
        <button
          className="btn btn-sm"
          onClick={() => fileInput.current?.click()}
        >
          Open scene
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".lnscene,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              if (file.size > 60000000)
                throw new Error('Scene file exceeds size limit');
              useSceneStore
                .getState()
                .importScene(parseScene(await file.text()));
            } catch (error) {
              reportError(error);
            }
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setExportOpen(true)}
        >
          Export SVG
        </button>
      </div>
      {exportOpen && (
        <ExportPanel
          width={paper.w}
          height={paper.h}
          pageWidthMm={mm(paper.physW)}
          pageHeightMm={mm(paper.physH)}
          optimize={optimize}
          onClose={() => setExportOpen(false)}
        />
      )}
    </header>
  );
}
