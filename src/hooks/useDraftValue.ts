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
  const draftRef = useRef<T>(stored);
  const rafRef = useRef<number | null>(null);
  const lastCommittedRef = useRef<T>(stored);

  // Sync down from upstream when the canonical value changes externally
  useEffect(() => {
    if (Object.is(stored, lastCommittedRef.current)) return;
    setDraftState(stored);
    draftRef.current = stored;
    lastCommittedRef.current = stored;
  }, [stored]);

  const setDraft = useCallback(
    (v: T) => {
      draftRef.current = v;
      setDraftState(v);
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const next = draftRef.current;
        if (!Object.is(next, lastCommittedRef.current)) {
          lastCommittedRef.current = next;
          commit(next);
        }
      });
    },
    [commit],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return [draft, setDraft];
}
