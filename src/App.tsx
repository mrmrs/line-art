import { useCallback, useEffect, useState } from 'react';
import { ResponsivePanel } from './components/ResponsivePanel';
import { COMPACT_WORKSPACE_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { useCounters } from './hooks/useCounters';
import { ComposeWorkspace } from './components/ComposeWorkspace';
import { useStorageStatus, useSceneStore } from './lib/store';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Properties } from './components/Properties';
import { ViewportGrid } from './components/ViewportGrid';
import { DropZone } from './components/DropZone';
import { useUndoShortcuts } from './hooks/useUndoShortcuts';

export default function App() {
  const compact = useMediaQuery(COMPACT_WORKSPACE_QUERY);
  const [panel, setPanel] = useState<'scene' | 'properties' | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  // A desktop resize dismisses the mobile panel instead of reopening it when
  // returning to a small window. The media event does not touch scene state.
  useEffect(() => {
    const media = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    const dismiss = () => { if (!media.matches) setPanel(null); };
    media.addEventListener('change', dismiss);
    return () => media.removeEventListener('change', dismiss);
  }, []);
  useUndoShortcuts();
  useCounters();
  const composition = useSceneStore(s => s.nodes.find(n => n.id === s.selectedId && n.type === 'packed-composition'));
  const { ready, error } = useStorageStatus();
  if (!ready)
    return (
      <div className="app-status" role="status">
        Restoring scene…
      </div>
    );
  return (
    <div className="app" data-compact={compact}>
      <Toolbar compact={compact} onOpenScene={() => setPanel('scene')} onOpenProperties={() => setPanel('properties')} />
      {error && (
        <div className="app-error" role="alert">
          {error}
          <button
            className="btn btn-xs"
            onClick={() => useStorageStatus.setState({ error: null })}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="app-body">
        <ResponsivePanel compact={compact} open={panel === 'scene'} title="Scene" onClose={closePanel}>
          <Sidebar />
        </ResponsivePanel>
        {composition ? <ComposeWorkspace key={composition.id} node={composition} compact={compact} propertiesOpen={panel === 'properties'} onCloseProperties={closePanel} /> : <>
        <main className="app-main" tabIndex={-1} data-workspace-focus aria-label="Drawing canvas">
          <ViewportGrid />
        </main>
        <ResponsivePanel compact={compact} open={panel === 'properties'} title="Properties" onClose={closePanel}>
          <Properties />
        </ResponsivePanel>
        </>}
      </div>
      <DropZone />
    </div>
  );
}
