import { memo } from 'react';
import type { PlaneGridParams, PlaneSizeMethod } from '../../lib/types';
import { NumberInput, SelectInput, CheckboxInput } from './inputs';

interface Props {
  params: PlaneGridParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const PlaneGridEditor = memo(function PlaneGridEditor({ params: pp, onChange }: Props) {
  const method = pp.sizeMethod ?? 'uniform';

  return (
    <div className="property-grid">
      <div className="property-section-label">Stack</div>

      <NumberInput label="Count" value={pp.count} onChange={(v) => onChange({ count: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
      <NumberInput label="Spacing" value={pp.spacing} onChange={(v) => onChange({ spacing: v })} step={0.05} min={0.01} />
      <SelectInput
        label="Stack Axis"
        value={pp.stackAxis}
        options={[
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
          { value: 'z', label: 'Z (up)' },
        ]}
        onChange={(v) => onChange({ stackAxis: v })}
      />

      <div className="property-section-label">Plane Size</div>

      <NumberInput label="Width" value={pp.planeWidth} onChange={(v) => onChange({ planeWidth: v })} step={0.1} min={0.01} />
      <NumberInput label="Height" value={pp.planeHeight} onChange={(v) => onChange({ planeHeight: v })} step={0.1} min={0.01} />
      <NumberInput label="Thickness" value={pp.thickness} onChange={(v) => onChange({ thickness: v })} step={0.01} min={0.005} />

      <div className="property-section-label">Size Variation</div>

      <SelectInput
        label="Method"
        value={method}
        options={[
          { value: 'uniform', label: 'Uniform' },
          { value: 'noise', label: 'Noise' },
          { value: 'random', label: 'Random' },
          { value: 'sine', label: 'Sine wave' },
          { value: 'radial', label: 'Radial (center)' },
          { value: 'gradient', label: 'Gradient' },
        ]}
        onChange={(v) => onChange({ sizeMethod: v as PlaneSizeMethod })}
      />

      {method !== 'uniform' && (
        <>
          <NumberInput label="Min Scale" value={pp.sizeMin ?? 0.3} onChange={(v) => onChange({ sizeMin: Math.max(0, Math.min(1, v)) })} step={0.05} min={0} max={1} />
          <NumberInput label="Max Scale" value={pp.sizeMax ?? 1.0} onChange={(v) => onChange({ sizeMax: Math.max(0, Math.min(1, v)) })} step={0.05} min={0} max={1} />
        </>
      )}

      {(method === 'noise' || method === 'random') && (
        <NumberInput label="Seed" value={pp.noiseSeed ?? 42} onChange={(v) => onChange({ noiseSeed: Math.round(v) })} step={1} min={0} />
      )}

      {method === 'noise' && (
        <NumberInput label="Noise Scale" value={pp.noiseScale ?? 0.8} onChange={(v) => onChange({ noiseScale: v })} step={0.1} min={0.1} />
      )}

      {method === 'sine' && (
        <NumberInput label="Frequency" value={pp.sineFreq ?? 2} onChange={(v) => onChange({ sineFreq: v })} step={0.5} min={0.1} />
      )}

      {method !== 'uniform' && (
        <CheckboxInput
          label="Anisotropic"
          value={pp.anisotropic ?? false}
          onChange={(v) => onChange({ anisotropic: v })}
          title="W and H get different noise values"
        />
      )}
    </div>
  );
});
