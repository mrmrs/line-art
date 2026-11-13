import type { CompositionParams } from '../lib/composition-types';
import { compositionCamera, compositionResolution } from '../lib/composition';
import { useRef, useState } from 'react';
import { useSceneStore, snapshotScene, reportError } from '../lib/store';
import { serializeScene, parseScene } from '../lib/scene-file';
import { ExportPanel } from './ExportPanel';
import { downloadText } from '../lib/export-svg';
import type { ViewMode } from '../lib/types';

import { PAPER_SIZES, useViewSettings } from '../lib/view-settings';
import { GridControls } from './GridControls';

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

  const paperSize = useViewSettings(s => s.paperSize);
  const setPaperSize = useViewSettings(s => s.setPaperSize);
  const [optimize, setOptimize] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const packed = useSceneStore(s => s.nodes.find(n => n.id === s.selectedId && n.type === 'packed-composition'));
  const packedParams = packed?.params as CompositionParams | undefined;
  const paper = packedParams ? { w: compositionResolution(packedParams).width, h: compositionResolution(packedParams).height, physW: `${packedParams.widthMm}mm`, physH: `${packedParams.heightMm}mm` } : PAPER_SIZES[paperSize];
  const mm = (dimension: string) =>
    parseFloat(dimension) * (dimension.endsWith('in') ? 25.4 : 1);

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <svg className="studio-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Studio mark">
          <defs>
            <pattern id="studio-mark-stripes" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(-35)">
              <rect width="1.25" height="2" fill="currentColor" />
            </pattern>
          </defs>
          <path transform="translate(0 -1.5)" fill="url(#studio-mark-stripes)" d="M16 7 C13 7 2 9 2 16 C2 23 6 23 10 24 L11 28 L12 26 L20 26 L21 28 L22 24 C26 23 30 23 30 16 C30 9 19 7 16 7 M4 18 A4 4 0 0 1 12 18 A4 4 0 0 1 4 18 M20 18 A4 4 0 0 1 28 18 A4 4 0 0 1 20 18" />
        </svg>
      </div>

      <div className="toolbar-center">
        {!packed && <>
        <div className="toolbar-group">
          <label className="toolbar-label">View</label>
          <div className="button-group">
            {VIEW_MODES.map((m) => (
              <button
                key={m.value}
                disabled={!!packed}
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

        </>}
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
            aria-label="Visibility quality"
            value={renderSettings.curveTolerance ?? 0.25}
            onChange={(e) =>
              updateRenderSettings({ curveTolerance: parseFloat(e.target.value) })
            }
          >
            <option value={1}>Fast</option>
            <option value={0.25}>Fine</option>
            <option value={0.1}>Precise</option>
            <option value={0.025}>Ultra</option>
          </select>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label className="toolbar-label">Paper</label>
          <select
            className="input input-sm"
            value={packedParams ? 'composition' : paperSize}
            disabled={!!packedParams}
            onChange={(e) =>
              setPaperSize(e.target.value as keyof typeof PAPER_SIZES)
            }
            aria-label="Paper size"
            title="Paper size"
          >
            {packedParams && <option value="composition">{packedParams.widthMm} × {packedParams.heightMm} mm</option>}
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
        <GridControls />
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
          Save
        </button>
        <button
          className="btn btn-sm"
          onClick={() => fileInput.current?.click()}
        >
          Open
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
          composition={packed && packedParams ? { nodes: [packed], camera: compositionCamera(packedParams), marginMm: packedParams.marginMm } : undefined}
          optimize={optimize}
          onClose={() => setExportOpen(false)}
        />
      )}
    </header>
  );
}
