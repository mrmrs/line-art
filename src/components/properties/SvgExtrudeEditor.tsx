import { memo } from 'react';
import type { SvgExtrudeParams } from '../../lib/types';
import { NumberInput, CheckboxInput } from './inputs';

interface Props {
  params: SvgExtrudeParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const SvgExtrudeEditor = memo(function SvgExtrudeEditor({ params: p, onChange }: Props) {
  const polyCount = p.polylines?.length ?? 0;
  return (
    <div className="property-grid">
      <div className="property-row">
        <label className="property-label">File</label>
        <span className="property-value-text">{p.filename}</span>
      </div>
      <div className="property-row">
        <label className="property-label">Polylines</label>
        <span className="property-value-text">{polyCount}</span>
      </div>

      <div className="property-section-label">Extrude</div>
      <NumberInput label="Depth" value={p.extrudeDepth} onChange={(v) => onChange({ extrudeDepth: Math.max(0.01, v) })} step={0.05} min={0.01} />
      <NumberInput label="Fit Size" value={p.fitToSize} onChange={(v) => onChange({ fitToSize: Math.max(0.1, v) })} step={0.1} min={0.1} />
      <CheckboxInput label="Centered" value={p.centerOnOrigin} onChange={(v) => onChange({ centerOnOrigin: v })} />
    </div>
  );
});
