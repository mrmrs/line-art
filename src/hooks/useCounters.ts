import { useEffect, useSyncExternalStore } from 'react';
import { counters } from '../lib/counters';

export function useCounters() {
  useEffect(() => { void counters.load(); }, []);
  return useSyncExternalStore(counters.subscribe, counters.getSnapshot, counters.getSnapshot);
}
