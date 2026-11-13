import { useEffect, useId, useRef, useState } from 'react';
import { useViewSettings } from '../lib/view-settings';

export function GridControls() {
  const visible = useViewSettings(s => s.gridVisible);
  const style = useViewSettings(s => s.gridStyle);
  const spacing = useViewSettings(s => s.gridSpacingMm);
  const color = useViewSettings(s => s.gridColor);
  const setVisible = useViewSettings(s => s.setGridVisible);
  const setStyle = useViewSettings(s => s.setGridStyle);
  const setSpacing = useViewSettings(s => s.setGridSpacingMm);
  const setColor = useViewSettings(s => s.setGridColor);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const spacingInput = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    spacingInput.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div className="grid-controls" ref={container} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); setOpen(false); settingsButton.current?.focus();
      }
    }}>
      <div className="button-group">
        <button className={`btn btn-sm btn-square grid-toggle${visible ? ' active' : ''}`} aria-label="Show grid" aria-pressed={visible} title={visible ? 'Hide grid' : 'Show grid'} onClick={() => setVisible(!visible)}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="1" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></svg>
        </button>
        <button className="btn btn-sm btn-square grid-settings-toggle" ref={settingsButton} aria-label="Grid settings" title="Grid settings" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
        </button>
      </div>
      {open && <div className="grid-settings-popover" id={id} role="dialog" aria-label="Grid settings">
        <label className="grid-setting"><span>Spacing (mm)</span><input ref={spacingInput} className="input input-sm" type="number" min="1" max="100" step="1" value={spacing} onChange={event => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) setSpacing(value);
        }} /></label>
        <label className="grid-setting"><span>Style</span><select className="input input-sm" value={style} onChange={event => setStyle(event.target.value as 'lines' | 'dots')}><option value="lines">Lines</option><option value="dots">Dots</option></select></label>
        <label className="grid-setting"><span>Color</span><input className="input-color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      </div>}
    </div>
  );
}
