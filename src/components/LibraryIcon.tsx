import { LIBRARY_ICONS, type LibraryIconName } from '../lib/library-icons';

export function LibraryIcon({ name }: { name: LibraryIconName }) {
  return <svg className="library-icon" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"><path d={LIBRARY_ICONS[name]} /></svg>;
}
