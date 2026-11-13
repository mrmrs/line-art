import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS } from '../lib/presets';
import { MODEL_LIBRARY } from '../lib/model-library';
import { DEFAULT_SLICING, DEFAULT_TRANSFORM, type SceneNode } from '../lib/types';
import { LIMITS } from '../lib/limits';
import { useSceneStore, reportError } from '../lib/store';
import { LibraryIcon } from './LibraryIcon';
import type { LibraryIconName } from '../lib/library-icons';

const MODEL_ICONS: Record<string, LibraryIconName> = {
  suzanne: 'suzanne', teapot: 'teapot', ship: 'ship', castle: 'castle',
  tree: 'tree', rocket: 'rocket', skull: 'fossil', crystal: 'crystal',
};
interface LibraryEntry {
  name: string;
  description: string;
  icon: LibraryIconName;
  credit?: string;
  create: (signal: AbortSignal) => Omit<SceneNode, 'id'>[] | Promise<Omit<SceneNode, 'id'>[]>;
}
const modelCache = new Map<string, string>();
const MODELS: LibraryEntry[] = MODEL_LIBRARY.map(model => ({
  ...model,
  icon: MODEL_ICONS[model.id] ?? 'mesh',
  credit: `${model.attribution} · ${model.license}`,
  create: async signal => {
    let data = modelCache.get(model.id);
    if (!data) {
      const response = await fetch(model.url, { signal });
      if (!response.ok) throw new Error(`Could not load ${model.name}. Please try again.`);
      data = await response.text();
      if (data.length > LIMITS.inputBytes || !/^v\s/m.test(data) || !/^f\s/m.test(data))
        throw new Error(`The model file for ${model.name} is invalid.`);
      modelCache.set(model.id, data);
    }
    return [{ name: model.name, type: 'mesh', params: { data, format: 'obj', fileName: `${model.id}.obj` },
      transform: { ...DEFAULT_TRANSFORM }, visible: true, slicing: { ...DEFAULT_SLICING } }];
  },
}));

export function PresetLibrary() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tooltip, setTooltip] = useState<{ entry: LibraryEntry; left: number; top: number } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const tooltipId = useId();
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepTooltip = () => clearTimeout(dismissTimer.current);
  const dismissTooltip = () => {
    keepTooltip();
    dismissTimer.current = setTimeout(() => setTooltip(null), 120);
  };
  useEffect(() => {
    const hide = () => setTooltip(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      request.current?.abort();
      clearTimeout(dismissTimer.current);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const showTooltip = (entry: LibraryEntry, target: HTMLElement) => {
    keepTooltip();
    const rect = target.getBoundingClientRect();
    setTooltip({ entry, left: Math.min(rect.right + 8, window.innerWidth - 228), top: Math.min(rect.top, window.innerHeight - 150) });
  };
  const activate = async (entry: LibraryEntry, replace: boolean) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const originalNodes = useSceneStore.getState().nodes;
    const timeout = setTimeout(() => {
      if (request.current !== controller) return;
      controller.abort();
      request.current = null;
      setLoading(null);
      reportError(new Error(`${entry.name} took too long to load. Please try again.`));
    }, 15000);
    setLoading(entry.name);
    setTooltip(null);
    try {
      const nodes = await entry.create(controller.signal);
      if (controller.signal.aborted) return;
      const store = useSceneStore.getState();
      if (replace && store.nodes !== originalNodes)
        throw new Error('The scene changed while the model was loading. Replace again to use the model.');
      if (replace) store.loadNodes(nodes);
      else store.appendNodes(nodes);
    } catch (error) {
      if (!controller.signal.aborted) reportError(error);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(null);
    }
  };

  return <>
    {[{ title: 'Presets', entries: PRESETS as LibraryEntry[] }, { title: 'Models', entries: MODELS }].map(({ title, entries }) => (
      <section className="sidebar-section" aria-label={title} key={title} onKeyDown={e => { if (e.key === 'Escape') setTooltip(null); }}>
        <div className="sidebar-section-header">
          <span>{title}</span>
          {title === 'Presets' && <div className="preset-view-toggle" role="group" aria-label="Preset view">
            <button className="btn-icon" aria-label="Preset grid view" aria-pressed={view === 'grid'} title="Grid view" onClick={() => { setView('grid'); setTooltip(null); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4z" /></svg>
            </button>
            <button className="btn-icon" aria-label="Preset list view" aria-pressed={view === 'list'} title="List view" onClick={() => { setView('list'); setTooltip(null); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 3h2M6 3h8M2 8h2M6 8h8M2 13h2M6 13h8" /></svg>
            </button>
          </div>}
        </div>
        <div className={`preset-list preset-list-${view}`} onScroll={() => setTooltip(null)}>
          {entries.map(entry => (
            <div key={entry.name} className="preset-item-row" onMouseLeave={dismissTooltip} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTooltip(null); }}>
              <button className="preset-item" disabled={loading !== null}
                aria-label={`Add ${entry.name} to scene`}
                aria-describedby={tooltip?.entry === entry ? tooltipId : undefined}
                onMouseEnter={e => showTooltip(entry, e.currentTarget)} onFocus={e => showTooltip(entry, e.currentTarget)}
                onClick={() => void activate(entry, false)} title={`Add ${entry.name} to scene`}>
                <span className="preset-icon"><LibraryIcon name={entry.icon} /></span>
                <span className="preset-name">{entry.name}</span>
              </button>
              <button className="btn-icon preset-replace-btn" disabled={loading !== null}
                aria-label={`Replace scene with ${entry.name}`} title={`Replace scene with ${entry.name}`}
                onClick={() => void activate(entry, true)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1 4M13 2v5H8" /></svg>
              </button>
            </div>
          ))}
        </div>
        {title === 'Models' && <a className="model-credits" href="/models/ATTRIBUTION.md" target="_blank" rel="noreferrer">Model credits &amp; licenses</a>}
      </section>
    ))}
    <p className="library-status" role="status">{loading ? `Loading ${loading}…` : ''}</p>
    {tooltip && createPortal(
      <div id={tooltipId} role="tooltip" className="preset-tooltip" style={{ left: tooltip.left, top: tooltip.top }} onMouseEnter={keepTooltip} onMouseLeave={dismissTooltip}>
        <strong>{tooltip.entry.name}</strong><span>{tooltip.entry.description}</span>
        {tooltip.entry.credit && <span>{tooltip.entry.credit}</span>}
      </div>, document.body,
    )}
  </>;
}
