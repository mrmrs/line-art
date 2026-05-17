import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Properties } from './components/Properties';
import { ViewportGrid } from './components/ViewportGrid';
import { DropZone } from './components/DropZone';
import { useUndoShortcuts } from './hooks/useUndoShortcuts';

export default function App() {
  useUndoShortcuts();
  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <ViewportGrid />
        </main>
        <Properties />
      </div>
      <DropZone />
    </div>
  );
}
