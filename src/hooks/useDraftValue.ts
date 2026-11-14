import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// useDraftValue — drag-friendly local state.
//
// Sliders / number inputs that commit straight to the store cause a full
// re-render and worker render on every keystroke. This hook:
//   - shows the live value as you type (uncontrolled-feel),
//   - commits to the store at most once per animation frame,
//   - resyncs when the upstream stored value changes (e.g. preset load).
//
// Usage:
//   const [draft, setDraft] = useDraftValue(stored, commit);
//   <input value={draft} onChange={(e) => setDraft(parseFloat(e.target.value))} />
// =============================================================================

export function useDraftValue<T>(
  stored: T,
  commit: (v: T) => void,
): [T, (v: T) => void] {
  const [draft, setDraftState] = useState<T>(stored);
  const pendingRef = useRef<{ value: T; commit: (v: T) => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCommittedRef = useRef<T>(stored);

  const flush = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending && !Object.is(pending.value, lastCommittedRef.current)) {
      lastCommittedRef.current = pending.value;
      // Keep the callback from the edit, even if selection changes on unmount.
      pending.commit(pending.value);
    }
  }, []);

  // Sync down from upstream when the canonical value changes externally
  useEffect(() => {
    if (Object.is(stored, lastCommittedRef.current)) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    pendingRef.current = null;
    setDraftState(stored);
    lastCommittedRef.current = stored;
  }, [stored]);

  const setDraft = useCallback(
    (v: T) => {
      pendingRef.current = { value: v, commit };
      setDraftState(v);
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(flush);
    },
    [commit, flush],
  );

  useEffect(() => {
    return flush;
  }, [flush]);

  return [draft, setDraft];
}
