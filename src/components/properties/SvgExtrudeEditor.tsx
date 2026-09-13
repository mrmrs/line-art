import { memo, useState } from 'react';
import type { SvgExtrudeParams } from '../../lib/types';
import { NumberInput, CheckboxInput, SelectInput } from './inputs';

interface Props {
  params: SvgExtrudeParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const SvgExtrudeEditor = memo(function SvgExtrudeEditor({
  params: p,
  onChange,
}: Props) {
  const [error, setError] = useState('');
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

      <SelectInput
        label="Import as"
        value={p.importMode ?? 'regions'}
        options={[
          { value: 'lines', label: 'Plot lines (keep open strokes)' },
          { value: 'regions', label: 'Extruded filled regions' },
        ]}
        onChange={async (mode) => {
          try {
            if (!p.sourceSvg)
              throw new Error(
                'Reimport the original SVG to change its interpretation.',
              );
            const { parseSvgString } = await import('../../lib/svg-parse');
            const parsed = parseSvgString(
              p.sourceSvg,
              0.1,
              mode as 'regions' | 'lines',
            );
            onChange({ ...parsed, importMode: mode });
            setError('');
          } catch (e) {
            setError(String(e));
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      <div className="property-section-label">Geometry</div>
      {p.importMode !== 'lines' && (
        <NumberInput
          label="Depth"
          value={p.extrudeDepth}
          onChange={(v) => onChange({ extrudeDepth: Math.max(0.01, v) })}
          step={0.05}
          min={0.01}
        />
      )}
      <NumberInput
        label="Fit Size"
        value={p.fitToSize}
        onChange={(v) => onChange({ fitToSize: Math.max(0.1, v) })}
        step={0.1}
        min={0.1}
      />
      <p className="property-value-text">
        Bevels are unavailable; extrusion has straight edges.
      </p>
      <CheckboxInput
        label="Centered"
        value={p.centerOnOrigin}
        onChange={(v) => onChange({ centerOnOrigin: v })}
      />
    </div>
  );
});
