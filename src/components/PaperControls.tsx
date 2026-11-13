import { useEffect, useId, useRef, useState } from 'react';
import { MAX_PAPER_MM, MIN_PAPER_MM, PAPER_SIZES, PAPER_UNIT_MM, paperDimensions, resolvePaper, useViewSettings } from '../lib/view-settings';
import type { PaperUnit } from '../lib/view-settings';

interface CompositionPaper {
  widthMm: number;
  heightMm: number;
  onChange: (widthMm: number, heightMm: number) => void;
}
const display = (millimeters: number, unit: PaperUnit) =>
  Number.isFinite(millimeters) ? String(Number((millimeters / PAPER_UNIT_MM[unit]).toPrecision(12))) : '';

function CustomPaperForm({ widthMm, heightMm, composition, onClose }: {
  widthMm: number; heightMm: number; composition?: CompositionPaper; onClose: () => void;
}) {
  const unit = useViewSettings(s => s.paperUnit);
  const setUnit = useViewSettings(s => s.setPaperUnit);
  const setCustom = useViewSettings(s => s.setCustomPaperSize);
  const [dimensions, setDimensions] = useState({ widthMm, heightMm });
  const [width, setWidth] = useState(() => display(widthMm, unit));
  const [height, setHeight] = useState(() => display(heightMm, unit));
  const widthInput = useRef<HTMLInputElement>(null);
  useEffect(() => { widthInput.current?.focus(); }, []);
  const valid = Object.values(dimensions).every(value => Number.isFinite(value) && value >= MIN_PAPER_MM && value <= MAX_PAPER_MM);
  return <form className="paper-custom-form" onSubmit={event => {
    event.preventDefault();
    if (!valid) return;
    if (composition) composition.onChange(dimensions.widthMm, dimensions.heightMm);
    else setCustom(dimensions.widthMm, dimensions.heightMm);
    onClose();
  }}>
    <label className="grid-setting"><span>Units</span><select className="input input-sm" aria-label="Paper units" value={unit} onChange={event => {
      const next = event.target.value as PaperUnit;
      setWidth(display(dimensions.widthMm, next)); setHeight(display(dimensions.heightMm, next)); setUnit(next);
    }}><option value="mm">mm</option><option value="cm">cm</option><option value="in">in</option></select></label>
    <label className="grid-setting"><span>Width</span><input ref={widthInput} className="input input-sm" type="number" aria-label="Paper width" step="any" value={width} onChange={event => {
      setWidth(event.target.value); setDimensions(current => ({ ...current, widthMm: event.target.value === '' ? NaN : Number(event.target.value) * PAPER_UNIT_MM[unit] }));
    }} /></label>
    <label className="grid-setting"><span>Height</span><input className="input input-sm" type="number" aria-label="Paper height" step="any" value={height} onChange={event => {
      setHeight(event.target.value); setDimensions(current => ({ ...current, heightMm: event.target.value === '' ? NaN : Number(event.target.value) * PAPER_UNIT_MM[unit] }));
    }} /></label>
    <p className="paper-size-note">Each side: {MIN_PAPER_MM}–{MAX_PAPER_MM.toLocaleString()} mm.</p>
    {composition && <p className="paper-size-note">Existing forms stay in place. Regenerate to fit the new paper.</p>}
    {!valid && <p className="paper-size-error" role="alert">Enter dimensions between 40 and 2,000 mm.</p>}
    <div className="paper-size-actions"><button className="btn btn-sm" type="button" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" type="submit" disabled={!valid}>Apply</button></div>
  </form>;
}

export function PaperControls({ composition }: { composition?: CompositionPaper }) {
  const settings = useViewSettings();
  const paper = composition ?? resolvePaper(settings);
  const orientation = composition ? paper.widthMm > paper.heightMm ? 'landscape' : 'portrait' : settings.paperOrientation;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => { setOpen(false); customButton.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="paper-controls toolbar-group" ref={container} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); close(); } }}>
    <span className="toolbar-label">Paper</span>
    <select className="input input-sm paper-preset-select" aria-label="Paper size" title={`${display(paper.widthMm, settings.paperUnit)} × ${display(paper.heightMm, settings.paperUnit)} ${settings.paperUnit}`} value={composition ? 'composition' : settings.paperSize === 'A4L' ? 'A4' : settings.paperSize === 'A3L' ? 'A3' : settings.paperSize} onChange={event => {
      if (event.target.value === 'custom') { setOpen(true); return; }
      setOpen(false);
      if (composition) {
        const next = paperDimensions(event.target.value);
        composition.onChange(next.widthMm, next.heightMm);
      } else settings.setPaperSize(event.target.value);
    }}>
      {composition && <option value="composition">{display(paper.widthMm, settings.paperUnit)} × {display(paper.heightMm, settings.paperUnit)} {settings.paperUnit}</option>}
      {Object.entries(PAPER_SIZES).filter(([key]) => key !== 'A4L' && key !== 'A3L').map(([key, value]) => <option key={key} value={key}>{/^A[234]$/.test(key) ? key : value.label}</option>)}
      <option value="custom">{!composition && settings.paperSize === 'custom' ? `Custom · ${display(paper.widthMm, settings.paperUnit)} × ${display(paper.heightMm, settings.paperUnit)} ${settings.paperUnit}` : 'Custom'}</option>
    </select>
    <button className="btn btn-sm btn-square paper-orientation" aria-label="Landscape orientation" aria-pressed={orientation === 'landscape'} title={`Switch to ${orientation === 'landscape' ? 'portrait' : 'landscape'}`} onClick={() => {
      setOpen(false);
      if (composition) composition.onChange(paper.heightMm, paper.widthMm);
      else settings.setPaperOrientation(orientation === 'landscape' ? 'portrait' : 'landscape');
    }}><svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden="true"><rect x={orientation === 'landscape' ? 2 : 4} y={orientation === 'landscape' ? 4 : 2} width={orientation === 'landscape' ? 14 : 10} height={orientation === 'landscape' ? 10 : 14} rx="1" /></svg></button>
    <button ref={customButton} className="btn btn-sm btn-square paper-custom-toggle" aria-label="Custom paper size" title="Custom paper size" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 13 1-4 8-8 3 3-8 8-4 1ZM10 3l3 3" /></svg></button>
    {open && <div className="paper-settings-popover" id={id} role="dialog" aria-label="Custom paper size"><CustomPaperForm widthMm={paper.widthMm} heightMm={paper.heightMm} composition={composition} onClose={close} /></div>}
  </div>;
}
