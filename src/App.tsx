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
    <div className="app">
      <Toolbar />
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
        <Sidebar />
        {composition ? <ComposeWorkspace key={composition.id} node={composition} /> : <>
        <main className="app-main">
          <ViewportGrid />
        </main>
        <Properties />
        </>}
      </div>
      <DropZone />
    </div>
  );
}
