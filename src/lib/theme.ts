import { create } from 'zustand';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'skullcat-theme';

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch { return null; }
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

// A deliberate choice remains authoritative in this tab even if storage fails.
let preference = savedTheme();
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#141414' : '#fafafa';
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141414' : '#fafafa');
}

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: preference ?? systemTheme(),
  toggle: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    preference = theme;
    applyTheme(theme);
    set({ theme });
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* In-memory choice still works. */ }
  },
}));

let unsubscribe: (() => void) | undefined;

/** Start before React mounts. The head bootstrap covers the earlier module-loading interval. */
export function initializeTheme(): () => void {
  unsubscribe?.();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    const theme = preference ?? (media.matches ? 'dark' : 'light');
    applyTheme(theme);
    if (useTheme.getState().theme !== theme) useTheme.setState({ theme });
  };
  const followSystem = () => { if (preference === null) sync(); };
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== localStorage) return;
    } catch { return; }
    preference = savedTheme();
    sync();
  };
  media.addEventListener('change', followSystem);
  window.addEventListener('storage', syncStorage);
  sync();
  const cleanup = () => {
    media.removeEventListener('change', followSystem);
    window.removeEventListener('storage', syncStorage);
    if (unsubscribe === cleanup) unsubscribe = undefined;
  };
  unsubscribe = cleanup;
  return cleanup;
}
