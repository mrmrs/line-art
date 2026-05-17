import { memo, useMemo } from 'react';
import type { AutomataGridParams, AutomataPattern } from '../../lib/types';
import { AUTOMATA_RULE_PRESETS } from '../../lib/automata-grid';
import { NumberInput, SelectInput, CheckboxInput, TextInput } from './inputs';

interface Props {
  params: AutomataGridParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const AutomataGridEditor = memo(function AutomataGridEditor({ params: ap, onChange }: Props) {
  // Resolve current preset by matching rule (so dropdown reflects state, not "Choose...")
  const activePreset = useMemo(() => {
    const match = AUTOMATA_RULE_PRESETS.find((p) => p.rule === ap.rule);
    return match?.name ?? '';
  }, [ap.rule]);

  return (
    <div className="property-grid">
      <div className="property-section-label">Grid</div>

      <NumberInput label="Width" value={ap.gridWidth} onChange={(v) => onChange({ gridWidth: Math.max(1, Math.round(v)) })} step={1} min={1} max={64} />
      <NumberInput label="Height" value={ap.gridHeight} onChange={(v) => onChange({ gridHeight: Math.max(1, Math.round(v)) })} step={1} min={1} max={64} />
      <NumberInput label="Generations" value={ap.generations} onChange={(v) => onChange({ generations: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
      <NumberInput label="Spacing" value={ap.spacing} onChange={(v) => onChange({ spacing: v })} step={0.02} min={0.05} />
      <NumberInput label="Cube Size" value={ap.cubeSize} onChange={(v) => onChange({ cubeSize: v })} step={0.02} min={0.01} />

      <div className="property-section-label">Rule</div>

      <div className="property-row">
        <label className="property-label">Preset</label>
        <select
          className="input input-sm"
          value={activePreset}
          onChange={(e) => {
            const preset = AUTOMATA_RULE_PRESETS.find((r) => r.name === e.target.value);
            if (preset) onChange({ rule: preset.rule });
          }}
        >
          {!activePreset && <option value="">Custom</option>}
          {AUTOMATA_RULE_PRESETS.map((r) => (
            <option key={r.name} value={r.name}>{r.name} ({r.rule})</option>
          ))}
        </select>
      </div>

      <TextInput label="B/S Rule" value={ap.rule} onChange={(v) => onChange({ rule: v })} placeholder="B3/S23" mono />

      <CheckboxInput label="Wrap" value={ap.wrapEdges} onChange={(v) => onChange({ wrapEdges: v })} />

      <div className="property-section-label">Initial State</div>

      <SelectInput
        label="Pattern"
        value={ap.initialPattern}
        options={[
          { value: 'random', label: 'Random' },
          { value: 'center', label: 'Single cell' },
          { value: 'glider', label: 'Glider' },
          { value: 'r-pentomino', label: 'R-pentomino' },
          { value: 'acorn', label: 'Acorn' },
          { value: 'cross', label: 'Cross (+)' },
        ]}
        onChange={(v) => onChange({ initialPattern: v as AutomataPattern })}
      />

      {ap.initialPattern === 'random' && (
        <NumberInput label="Density" value={ap.randomDensity} onChange={(v) => onChange({ randomDensity: Math.max(0, Math.min(1, v)) })} step={0.05} min={0} max={1} />
      )}

      <NumberInput label="Seed" value={ap.seed} onChange={(v) => onChange({ seed: Math.round(v) })} step={1} min={0} />
    </div>
  );
});
