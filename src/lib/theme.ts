import { create } from 'zustand';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'skullcat-theme';

function savedTheme(): Theme {
  try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: savedTheme(),
  toggle: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    set({ theme });
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Theme still works without storage. */ }
  },
}));

/** Apply before mounting React, including the scene-restoration screen. */
export function initializeTheme() {
  document.documentElement.dataset.theme = useTheme.getState().theme;
}
