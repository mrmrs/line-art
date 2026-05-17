import { memo } from 'react';
import type { SlicingConfig } from '../../lib/types';
import { CheckboxInput, NumberInput, SelectInput } from './inputs';

interface Props {
  slicing: SlicingConfig;
  onChange: (s: Partial<SlicingConfig>) => void;
}

export const SlicingEditor = memo(function SlicingEditor({ slicing, onChange }: Props) {
  return (
    <div className="property-grid">
      <CheckboxInput label="Enabled" value={slicing.enabled} onChange={(v) => onChange({ enabled: v })} />
      {slicing.enabled && (
        <>
          <SelectInput
            label="Axis"
            value={slicing.axis}
            options={[
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y' },
              { value: 'z', label: 'Z' },
            ]}
            onChange={(v) => onChange({ axis: v as 'x' | 'y' | 'z' })}
          />
          <NumberInput label="Slices" value={slicing.count} onChange={(v) => onChange({ count: Math.round(v) })} step={1} min={1} max={50} />
        </>
      )}
    </div>
  );
});
