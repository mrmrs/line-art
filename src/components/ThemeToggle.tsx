import { useTheme } from '../lib/theme';

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  return <button className={`btn btn-sm theme-toggle ${showLabel ? 'with-label toolbar-menu-action' : 'btn-square'}`} onClick={toggle} aria-label={label} title={label}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>
        : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />}
    </svg>
    {showLabel && <span>{label}</span>}
  </button>;
}
