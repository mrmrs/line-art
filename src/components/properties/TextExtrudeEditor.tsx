import { memo, useEffect, useRef, useState } from 'react';
import type { TextExtrudeParams } from '../../lib/types';
import { NumberInput, SelectInput, CheckboxInput, TextInput } from './inputs';
import { listFonts, loadFont, uploadFont, textToPolylines, getFontEntry } from '../../lib/fonts';

interface Props {
  params: TextExtrudeParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const TextExtrudeEditor = memo(function TextExtrudeEditor({ params: p, onChange }: Props) {
  const [fontList, setFontList] = useState(() => listFonts());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const regenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced polylines regeneration on text/font/layout changes
  const triggerRegen = (next: Partial<TextExtrudeParams>) => {
    if (regenTimer.current) clearTimeout(regenTimer.current);
    const merged: TextExtrudeParams = { ...p, ...next };
    if (!merged.fontId) return;
    const entry = getFontEntry(merged.fontId);
    if (!entry) return;
    regenTimer.current = setTimeout(async () => {
      try {
        const font = await loadFont(merged.fontId);
        const { polylines, bounds } = textToPolylines(font, merged.text, {
          fontSize: merged.fontSize,
          letterSpacing: merged.letterSpacing,
          lineHeight: merged.lineHeight,
          align: merged.align,
        });
        onChange({ polylines, bounds });
      } catch (err) {
        console.warn('Text extrude regeneration failed:', err);
      }
    }, 120);
  };

  // First-load regen if we have a font but no polylines
  useEffect(() => {
    if (p.fontId && (!p.polylines || p.polylines.length === 0)) {
      triggerRegen({});
    }
    return () => {
      if (regenTimer.current) clearTimeout(regenTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const id = uploadFont(file.name, buffer);
    setFontList(listFonts());
    onChange({ fontId: id });
    triggerRegen({ fontId: id });
  };

  const noFonts = fontList.length === 0;

  return (
    <div className="property-grid">
      <TextInput
        label="Text"
        value={p.text}
        onChange={(v) => { onChange({ text: v }); triggerRegen({ text: v }); }}
        placeholder="HELLO"
        full
      />

      <div className="property-section-label">Font</div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {noFonts ? (
        <div className="property-row property-row-full" style={{ opacity: 0.85, fontStyle: 'italic', fontSize: 10 }}>
          No fonts loaded.
        </div>
      ) : (
        <SelectInput
          label="Family"
          value={p.fontId}
          options={fontList.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(v) => { onChange({ fontId: v }); triggerRegen({ fontId: v }); }}
        />
      )}

      <div className="property-row">
        <label className="property-label">Upload</label>
        <button className="btn btn-xs" onClick={() => fileInputRef.current?.click()}>
          + .ttf / .otf
        </button>
      </div>

      <NumberInput label="Size" value={p.fontSize} onChange={(v) => { const next = Math.max(8, v); onChange({ fontSize: next }); triggerRegen({ fontSize: next }); }} step={10} min={8} />

      <NumberInput label="Tracking" value={p.letterSpacing} onChange={(v) => { onChange({ letterSpacing: v }); triggerRegen({ letterSpacing: v }); }} step={1} />
      <NumberInput label="Line Height" value={p.lineHeight} onChange={(v) => { onChange({ lineHeight: Math.max(0.5, v) }); triggerRegen({ lineHeight: Math.max(0.5, v) }); }} step={0.1} min={0.5} />
      <SelectInput
        label="Align"
        value={p.align}
        options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
        onChange={(v) => { onChange({ align: v }); triggerRegen({ align: v as 'left' | 'center' | 'right' }); }}
      />

      <div className="property-section-label">Extrude</div>
      <NumberInput label="Depth" value={p.extrudeDepth} onChange={(v) => onChange({ extrudeDepth: Math.max(0.01, v) })} step={0.05} min={0.01} />
      <NumberInput label="Fit Size" value={p.fitToSize} onChange={(v) => onChange({ fitToSize: Math.max(0.1, v) })} step={0.1} min={0.1} />
      <CheckboxInput label="Centered" value={p.centerOnOrigin} onChange={(v) => onChange({ centerOnOrigin: v })} />
    </div>
  );
});
