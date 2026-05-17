import { memo, useCallback } from 'react';
import type { Vec3 } from '../../lib/types';
import { useDraftValue } from '../../hooks/useDraftValue';

// =============================================================================
// Shared input components for the Properties panel.
// Each control draft-values its input so dragging a slider produces at most
// one store commit per animation frame.
// =============================================================================

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}

export const NumberInput = memo(function NumberInput({
  label, value, onChange, step = 0.1, min, max,
}: NumberInputProps) {
  const [draft, setDraft] = useDraftValue(value, onChange);
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <input
        type="number"
        className="input input-sm"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
});

interface NumberSliderProps extends NumberInputProps {
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
}

// Combined slider + number input — great for parameters where ranged exploration matters
export const NumberSlider = memo(function NumberSlider({
  label, value, onChange, step = 0.1, min, max,
  sliderMin, sliderMax, sliderStep,
}: NumberSliderProps) {
  const [draft, setDraft] = useDraftValue(value, onChange);
  const lo = sliderMin ?? min ?? 0;
  const hi = sliderMax ?? max ?? 1;
  const sStep = sliderStep ?? step;
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <div className="number-slider-row">
        <input
          type="range"
          className="number-slider-range"
          min={lo}
          max={hi}
          step={sStep}
          value={draft}
          onChange={(e) => setDraft(parseFloat(e.target.value))}
        />
        <input
          type="number"
          className="input input-sm number-slider-input"
          value={draft}
          step={step}
          min={min}
          max={max}
          onChange={(e) => setDraft(parseFloat(e.target.value) || 0)}
        />
      </div>
    </div>
  );
});

interface Vec3InputProps {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
  step?: number;
  min?: number;
}

export const Vec3Input = memo(function Vec3Input({
  label, value, onChange, step = 0.1, min,
}: Vec3InputProps) {
  const [draft, setDraft] = useDraftValue(value, onChange);
  const labels = ['X', 'Y', 'Z'];
  const setComponent = useCallback(
    (i: number, v: number) => {
      const next: Vec3 = [...draft] as Vec3;
      next[i] = v;
      setDraft(next);
    },
    [draft, setDraft],
  );
  return (
    <div className="property-row property-row-vec3">
      <label className="property-label">{label}</label>
      <div className="vec3-inputs">
        {[0, 1, 2].map((i) => (
          <div key={i} className="vec3-input-group">
            <span className="vec3-label">{labels[i]}</span>
            <input
              type="number"
              className="input input-sm input-vec3"
              value={draft[i]}
              step={step}
              min={min}
              onChange={(e) => setComponent(i, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

interface SelectInputProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

export const SelectInput = memo(function SelectInput({
  label, value, options, onChange,
}: SelectInputProps) {
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <select
        className="input input-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
});

interface CheckboxInputProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}

export const CheckboxInput = memo(function CheckboxInput({
  label, value, onChange, title,
}: CheckboxInputProps) {
  return (
    <div className="property-row" title={title}>
      <label className="property-label">{label}</label>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
});

interface TextInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  full?: boolean;
}

export const TextInput = memo(function TextInput({
  label, value, onChange, placeholder, mono, full,
}: TextInputProps) {
  const [draft, setDraft] = useDraftValue(value, onChange);
  return (
    <div className={`property-row ${full ? 'property-row-full' : ''}`}>
      <label className="property-label">{label}</label>
      <input
        className={`input input-sm ${mono ? 'input-mono' : ''}`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
});
