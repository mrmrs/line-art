import { memo } from 'react';
import type { LineGridParams, LineLengthMethod } from '../../lib/types';
import { NumberInput, SelectInput } from './inputs';

interface Props {
  params: LineGridParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const LineGridEditor = memo(function LineGridEditor({ params: lp, onChange }: Props) {
  const lengthMethod = lp.lengthMethod ?? 'uniform';
  const segmented = lp.segmented ?? false;

  return (
    <div className="property-grid">
      <div className="property-section-label">Grid</div>

      <NumberInput label="Count X" value={lp.countX} onChange={(v) => onChange({ countX: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
      <NumberInput label="Count Y" value={lp.countY} onChange={(v) => onChange({ countY: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
      <NumberInput label="Spacing" value={lp.spacing} onChange={(v) => onChange({ spacing: v })} step={0.05} min={0.05} />
      <SelectInput
        label="Line Axis"
        value={lp.lineAxis}
        options={[
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
          { value: 'z', label: 'Z (up)' },
        ]}
        onChange={(v) => onChange({ lineAxis: v })}
      />

      {/* Mode selector at the top — cleaner than per-section toggle */}
      <div className="property-section-label">Mode</div>

      <SelectInput
        label="Mode"
        value={segmented ? 'pin-art' : 'length'}
        options={[
          { value: 'length', label: 'Length-modulated' },
          { value: 'pin-art', label: 'Pin Art (gap)' },
        ]}
        onChange={(v) => onChange({ segmented: v === 'pin-art' })}
      />

      <NumberInput label="Total Length" value={lp.lineLength} onChange={(v) => onChange({ lineLength: v })} step={0.1} min={0.01} />

      {segmented ? (
        <>
          <div className="property-section-label">Pin Art</div>
          <NumberInput label="Gap Size" value={lp.gapSize ?? 0.3} onChange={(v) => onChange({ gapSize: Math.max(0.01, v) })} step={0.05} min={0.01} />

          <SelectInput
            label="Surface"
            value={lengthMethod}
            options={[
              { value: 'uniform', label: 'Flat (center)' },
              { value: 'noise', label: 'Noise' },
              { value: 'random', label: 'Random' },
              { value: 'sine', label: 'Sine wave' },
              { value: 'radial', label: 'Radial' },
              { value: 'gradient', label: 'Gradient' },
            ]}
            onChange={(v) => onChange({ lengthMethod: v as LineLengthMethod })}
          />

          {lengthMethod !== 'uniform' && (
            <>
              <NumberInput label="Min Split" value={lp.lengthMin ?? 0.2} onChange={(v) => onChange({ lengthMin: Math.max(0.01, v) })} step={0.1} min={0.01} />
              <NumberInput label="Max Split" value={lp.lengthMax ?? (lp.lineLength - (lp.gapSize ?? 0.3))} onChange={(v) => onChange({ lengthMax: v })} step={0.1} min={0.01} />
            </>
          )}
          {(lengthMethod === 'noise' || lengthMethod === 'random') && (
            <NumberInput label="Seed" value={lp.lengthSeed ?? 42} onChange={(v) => onChange({ lengthSeed: Math.round(v) })} step={1} min={0} />
          )}
          {lengthMethod === 'noise' && (
            <NumberInput label="Noise Scale" value={lp.lengthNoiseScale ?? 1} onChange={(v) => onChange({ lengthNoiseScale: v })} step={0.1} min={0.1} />
          )}
          {lengthMethod === 'sine' && (
            <NumberInput label="Frequency" value={lp.lengthSineFreq ?? 2} onChange={(v) => onChange({ lengthSineFreq: v })} step={0.5} min={0.1} />
          )}
          {lengthMethod === 'gradient' && (
            <SelectInput
              label="Axis"
              value={lp.lengthGradientAxis ?? 'x'}
              options={[
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' },
              ]}
              onChange={(v) => onChange({ lengthGradientAxis: v })}
            />
          )}
        </>
      ) : (
        <>
          <div className="property-section-label">Length Variation</div>
          <SelectInput
            label="Variation"
            value={lengthMethod}
            options={[
              { value: 'uniform', label: 'Uniform' },
              { value: 'noise', label: 'Noise' },
              { value: 'random', label: 'Random' },
              { value: 'sine', label: 'Sine wave' },
              { value: 'radial', label: 'Radial' },
              { value: 'gradient', label: 'Gradient' },
            ]}
            onChange={(v) => onChange({ lengthMethod: v as LineLengthMethod })}
          />
          {lengthMethod !== 'uniform' && (
            <>
              <NumberInput label="Min Length" value={lp.lengthMin ?? 0.5} onChange={(v) => onChange({ lengthMin: v })} step={0.1} min={0.01} />
              <NumberInput label="Max Length" value={lp.lengthMax ?? 2.0} onChange={(v) => onChange({ lengthMax: v })} step={0.1} min={0.01} />
            </>
          )}
          {(lengthMethod === 'noise' || lengthMethod === 'random') && (
            <NumberInput label="Seed" value={lp.lengthSeed ?? 42} onChange={(v) => onChange({ lengthSeed: Math.round(v) })} step={1} min={0} />
          )}
          {lengthMethod === 'noise' && (
            <NumberInput label="Noise Scale" value={lp.lengthNoiseScale ?? 1} onChange={(v) => onChange({ lengthNoiseScale: v })} step={0.1} min={0.1} />
          )}
          {lengthMethod === 'sine' && (
            <NumberInput label="Frequency" value={lp.lengthSineFreq ?? 2} onChange={(v) => onChange({ lengthSineFreq: v })} step={0.5} min={0.1} />
          )}
          {lengthMethod === 'gradient' && (
            <SelectInput
              label="Axis"
              value={lp.lengthGradientAxis ?? 'x'}
              options={[
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' },
              ]}
              onChange={(v) => onChange({ lengthGradientAxis: v })}
            />
          )}
        </>
      )}
    </div>
  );
});
