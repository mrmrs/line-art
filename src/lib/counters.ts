export const COUNTER_KEYS = [
  'SKULLCAT_SVG_EXPORT',
  'SKULLCAT_OBJ_IMPORT',
  'SKULLCAT_STL_IMPORT',
  'SKULLCAT_SVG_IMPORT',
] as const;
export type CounterKey = typeof COUNTER_KEYS[number];
export type CounterTotals = Partial<Record<CounterKey, number>>;
const COUNTER_BASE = 'https://ts-gen-count.adam-f8f.workers.dev';

/** Anonymous event counts only. Failures never interrupt creating or exporting art. */
export function createCounterClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let totals: CounterTotals = {};
  let initialLoad: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const request = async (key: CounterKey, increment: boolean) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(`${COUNTER_BASE}${increment ? '/increment' : '/'}?name=${encodeURIComponent(key)}`, {
        method: increment ? 'POST' : 'GET',
        signal: controller.signal,
        ...(increment ? { keepalive: true } : { cache: 'no-store' as const }),
      });
      return { ok: response.ok, text: response.ok && !increment ? await response.text() : '' };
    } finally { clearTimeout(timeout); }
  };
  const refresh = async (key: CounterKey): Promise<void> => {
    try {
      const response = await request(key, false);
      if (!response.ok) return;
      const text = response.text.trim();
      if (!/^\d+$/.test(text)) return;
      const count = Number(text);
      if (!Number.isSafeInteger(count)) return;
      // Initial reads and simultaneous increments may finish out of order.
      if (totals[key] !== undefined && count <= totals[key]!) return;
      totals = { ...totals, [key]: count };
      listeners.forEach(listener => listener());
    } catch { /* Counting is optional, including while offline. */ }
  };
  return {
    getSnapshot: () => totals,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    load: () => initialLoad ??= Promise.all(COUNTER_KEYS.map(refresh)).then(() => {}),
    increment: async (key: CounterKey): Promise<void> => {
      try {
        const response = await request(key, true);
        if (response.ok) await refresh(key);
      } catch { /* Never retry POST: a lost response may already have incremented. */ }
    },
  };
}

export const counters = createCounterClient();
