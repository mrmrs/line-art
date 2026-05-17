import { useEffect } from 'react';
import { useSceneStore } from '../lib/store';

// =============================================================================
// Listen for Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z to undo/redo via zundo's
// temporal middleware. Ignored when focus is inside an editable input so
// typing in text fields still does the platform-default text undo.
// =============================================================================

function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useUndoShortcuts() {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (isEditing(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useSceneStore.temporal.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useSceneStore.temporal.getState().redo();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
}
