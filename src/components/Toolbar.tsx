import { SKULLCAT_PATH } from '../lib/brand';
import type { CompositionParams } from '../lib/composition-types';
import { compositionCamera, compositionResolution } from '../lib/composition';
import { useRef, useState } from 'react';
import { useSceneStore, snapshotScene, reportError } from '../lib/store';
import { serializeScene, parseScene } from '../lib/scene-file';
import { ExportPanel } from './ExportPanel';
import { downloadText } from '../lib/export-svg';
import type { ViewMode } from '../lib/types';

import { resolvePaper, useViewSettings } from '../lib/view-settings';
import { ThemeToggle } from './ThemeToggle';
import { GridControls } from './GridControls';
import { ActionMenu } from './ActionMenu';

// =============================================================================
// Top Toolbar: view mode, export, settings
// =============================================================================

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'single', label: '1', icon: '\u25A1' },
  { value: '1x2', label: '1\u00D72', icon: '\u25EB' },
  { value: '2x2', label: '2\u00D72', icon: '\u2B1A' },
  { value: '3x2', label: '3\u00D72', icon: '\u2593' },
];

export function Toolbar({ compact = false, onOpenScene, onOpenProperties }: { compact?: boolean; onOpenScene?: () => void; onOpenProperties?: () => void }) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);

  const viewSettings = useViewSettings();
  const optimize = useViewSettings(s => s.optimizePaths);

  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const packed = useSceneStore(s => s.nodes.find(n => n.id === s.selectedId && n.type === 'packed-composition'));
  const packedParams = packed?.params as CompositionParams | undefined;
  const paper = packedParams ? { w: compositionResolution(packedParams).width, h: compositionResolution(packedParams).height, physW: `${packedParams.widthMm}mm`, physH: `${packedParams.heightMm}mm` } : resolvePaper(viewSettings);
  const mm = (dimension: string) =>
    parseFloat(dimension) * (dimension.endsWith('in') ? 25.4 : 1);

  const saveProject = () => {
    try { downloadText(serializeScene(snapshotScene()), 'drawing.lnscene', 'application/json'); }
    catch (error) { reportError(error); }
  };
  const views = !packed && <div className="toolbar-group toolbar-view-group" role="group" aria-label="View layout">
    <span className="toolbar-label">View</span>
    <div className="button-group">
      {VIEW_MODES.map(mode => <button key={mode.value} className={`btn btn-sm ${viewMode === mode.value ? 'active' : ''}`} aria-pressed={viewMode === mode.value} onClick={() => setViewMode(mode.value)} title={mode.label}>{mode.label}</button>)}
    </div>
  </div>;
  const history = <div className="toolbar-group toolbar-history" role="group" aria-label="History">
    {compact && <span className="toolbar-label">History</span>}
    <button className="btn btn-sm btn-square" onClick={() => useSceneStore.temporal.getState().undo()} title="Undo (Cmd+Z)" aria-label="Undo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -2)" /></svg>
    </button>
    <button className="btn btn-sm btn-square" onClick={() => useSceneStore.temporal.getState().redo()} title="Redo (Cmd+Shift+Z)" aria-label="Redo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10H10a6 6 0 0 0 0 12M21 10l-5-5M21 10l-5 5" transform="translate(0 -2)" /></svg>
    </button>
  </div>;
  return (
    <header className={`toolbar${compact ? ' compact' : ''}`}>
      <div className="toolbar-left">
        <svg className="studio-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="3D SVG">
          <defs>
            <pattern id="studio-mark-stripes" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(-35)">
              <rect width="1.25" height="2" fill="currentColor" />
            </pattern>
          </defs>
          <path transform="translate(0 -1.5)" fill="url(#studio-mark-stripes)" d={SKULLCAT_PATH} />
        </svg>
      </div>

      {compact ? <div className="toolbar-right toolbar-compact-actions">
        <button className="btn btn-sm btn-square toolbar-panel-toggle" aria-label="Scene" title="Open scene panel" onClick={onOpenScene}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M5 7h2M5 11h2M5 15h2" /></svg>
        </button>
        <button className="btn btn-sm btn-square toolbar-panel-toggle" aria-label="Properties" title="Open properties panel" onClick={onOpenProperties}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18M17 7h2M17 11h2M17 15h2" /></svg>
        </button>
        <ActionMenu>{close => <>
          <div className="toolbar-menu-section" role="group" aria-label="Project">
            <button className="btn toolbar-menu-action" title="Open project" onClick={() => { close(); fileInput.current?.click(); }}>Open</button>
            <button className="btn toolbar-menu-action" title="Save project" onClick={() => { close(); saveProject(); }}>Save</button>
          </div>
          <div className="toolbar-menu-section"><ThemeToggle showLabel /></div>
          {views && <div className="toolbar-menu-section">{views}</div>}
          <div className="toolbar-menu-section"><GridControls inline /></div>
          <div className="toolbar-menu-section">{history}</div>
        </>}</ActionMenu>
        <button className="btn btn-primary btn-sm toolbar-export" onClick={() => setExportOpen(true)} title="Export SVG">Export SVG</button>
      </div> : <>
        <div className="toolbar-center toolbar-secondary-controls">
          {views}
          <GridControls />
          {history}
        </div>
        <div className="toolbar-right">
          <ThemeToggle />
          <div className="project-actions" role="group" aria-label="Project">
            <button className="btn btn-sm" title="Open project" onClick={() => fileInput.current?.click()}>Open</button>
            <button className="btn btn-sm" title="Save project" onClick={saveProject}>Save</button>
          </div>
          <button className="btn btn-primary btn-sm toolbar-export" onClick={() => setExportOpen(true)} title="Export SVG">Export SVG</button>
        </div>
      </>}
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
