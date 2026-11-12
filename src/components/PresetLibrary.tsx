import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS } from '../lib/presets';
import { useSceneStore } from '../lib/store';

export function PresetLibrary() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tooltip, setTooltip] = useState<{ index: number; left: number; top: number } | null>(null);
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
      clearTimeout(dismissTimer.current);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const appendNodes = useSceneStore(s => s.appendNodes);
  const loadNodes = useSceneStore(s => s.loadNodes);
  const showTooltip = (index: number, target: HTMLElement) => {
    keepTooltip();
    const rect = target.getBoundingClientRect();
    setTooltip({ index, left: Math.min(rect.right + 8, window.innerWidth - 228), top: Math.min(rect.top, window.innerHeight - 90) });
  };

  return (
    <div className="sidebar-section" onKeyDown={e => { if (e.key === 'Escape') setTooltip(null); }}>
      <div className="sidebar-section-header">
        <span>Presets</span>
        <div className="preset-view-toggle" role="group" aria-label="Preset view">
          <button className="btn-icon" aria-label="Preset grid view" aria-pressed={view === 'grid'} title="Grid view" onClick={() => { setView('grid'); setTooltip(null); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10h4v4h-4z" /></svg>
          </button>
          <button className="btn-icon" aria-label="Preset list view" aria-pressed={view === 'list'} title="List view" onClick={() => { setView('list'); setTooltip(null); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 3h2M6 3h8M2 8h2M6 8h8M2 13h2M6 13h8" /></svg>
          </button>
        </div>
      </div>
      <div className={`preset-list preset-list-${view}`} onScroll={() => setTooltip(null)}>
        {PRESETS.map((preset, index) => (
          <div key={preset.name} className="preset-item-row" onMouseLeave={dismissTooltip} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTooltip(null); }}>
            <button
              className="preset-item"
              aria-label={`Add ${preset.name} to scene`}
              aria-describedby={tooltip?.index === index ? tooltipId : undefined}
              onMouseEnter={e => showTooltip(index, e.currentTarget)}
              onFocus={e => showTooltip(index, e.currentTarget)}
              onClick={() => { appendNodes(preset.create()); setTooltip(null); }}
              title={`Add ${preset.name} to scene`}
            >
              <span className="preset-icon" aria-hidden="true">{preset.icon}</span>
              <span className="preset-name">{preset.name}</span>
            </button>
            <button
              className="btn-icon preset-replace-btn"
              aria-label={`Replace scene with ${preset.name}`}
              title={`Replace scene with ${preset.name}`}
              onClick={() => { loadNodes(preset.create()); setTooltip(null); }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1 4M13 2v5H8" /></svg>
            </button>
          </div>
        ))}
      </div>
      {tooltip && createPortal(
        <div id={tooltipId} role="tooltip" className="preset-tooltip" style={{ left: tooltip.left, top: tooltip.top }} onMouseEnter={keepTooltip} onMouseLeave={dismissTooltip}>
          <strong>{PRESETS[tooltip.index].name}</strong>
          <span>{PRESETS[tooltip.index].description}</span>
        </div>, document.body,
      )}
    </div>
  );
}
