import { memo } from 'react';
import type { FillConfig, FillType } from '../../lib/types';
import { NumberInput, SelectInput, CheckboxInput } from './inputs';
import { useSceneStore } from '../../lib/store';

interface Props {
  nodeId: string;
  fills: FillConfig[];
}

export const FillEditor = memo(function FillEditor({ nodeId, fills }: Props) {
  const addFill = useSceneStore((s) => s.addFill);
  const updateFill = useSceneStore((s) => s.updateFill);
  const removeFill = useSceneStore((s) => s.removeFill);

  return (
    <div className="property-grid">
      <div className="fill-add-row">
        <span className="property-label">Add</span>
        <div className="fill-add-buttons">
          <button className="btn btn-xs" onClick={() => addFill(nodeId, 'cross-hatch')} title="Volumetric parallel lines">Hatch</button>
          <button className="btn btn-xs" onClick={() => addFill(nodeId, 'surface-hatch')} title="Face-aligned lines">Surface</button>
          <button className="btn btn-xs" onClick={() => addFill(nodeId, 'stipple')} title="Poisson dots">Dots</button>
          <button className="btn btn-xs" onClick={() => addFill(nodeId, 'contour')} title="Level-set planes">Contour</button>
        </div>
      </div>

      {fills.length === 0 && (
        <div className="property-row property-row-full" style={{ opacity: 0.6, fontStyle: 'italic', fontSize: 10 }}>
          No fills. Add hatch / surface / dots / contour above.
        </div>
      )}

      {fills.map((fill) => (
        <FillCard
          key={fill.id}
          fill={fill}
          onChange={(updates) => updateFill(nodeId, fill.id, updates)}
          onRemove={() => removeFill(nodeId, fill.id)}
        />
      ))}
    </div>
  );
});

const FillCard = memo(function FillCard({
  fill,
  onChange,
  onRemove,
}: {
  fill: FillConfig;
  onChange: (u: Partial<FillConfig>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fill-card">
      <div className="fill-card-header">
        <span className="fill-card-type">{fillLabel(fill.type)}</span>
        <CheckboxInput label="" value={fill.enabled} onChange={(v) => onChange({ enabled: v })} />
        <button className="btn btn-xs btn-ghost" onClick={onRemove} title="Remove fill">×</button>
      </div>

      {(fill.type === 'cross-hatch' || fill.type === 'surface-hatch') && (
        <NumberInput label="Spacing" value={fill.spacing} onChange={(v) => onChange({ spacing: Math.max(0.005, v) })} step={0.01} min={0.005} />
      )}

      {fill.type === 'cross-hatch' && (
        <>
          <div className="property-row">
            <label className="property-label">Axes</label>
            <div className="fill-axes-row">
              {(['x', 'y', 'z'] as const).map((ax) => {
                const active = fill.crossHatchAxes?.includes(ax) ?? false;
                return (
                  <button
                    key={ax}
                    className={`btn btn-xs ${active ? 'active' : ''}`}
                    onClick={() => {
                      const current = fill.crossHatchAxes ?? [];
                      const next = active
                        ? current.filter((a) => a !== ax)
                        : [...current, ax];
                      onChange({ crossHatchAxes: next.length > 0 ? next : [ax] });
                    }}
                  >
                    {ax.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {fill.type === 'surface-hatch' && (
        <NumberInput label="Angle°" value={fill.angleDeg} onChange={(v) => onChange({ angleDeg: v })} step={5} />
      )}

      {fill.type === 'stipple' && (
        <>
          <NumberInput label="Density" value={fill.density} onChange={(v) => onChange({ density: Math.max(1, v) })} step={10} min={1} />
          <NumberInput label="Dot Size" value={fill.dotSize} onChange={(v) => onChange({ dotSize: Math.max(0.001, v) })} step={0.005} min={0.001} />
          <CheckboxInput label="Surface" value={fill.surfaceMode} onChange={(v) => onChange({ surfaceMode: v })} />
        </>
      )}

      {fill.type === 'contour' && (
        <>
          <SelectInput
            label="Axis"
            value={fill.axis}
            options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]}
            onChange={(v) => onChange({ axis: v as 'x' | 'y' | 'z' })}
          />
          <NumberInput label="Count" value={fill.count} onChange={(v) => onChange({ count: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
        </>
      )}

      <NumberInput label="Pen #" value={fill.pen} onChange={(v) => onChange({ pen: Math.max(1, Math.round(v)) })} step={1} min={1} max={8} />
    </div>
  );
});

function fillLabel(t: FillType): string {
  switch (t) {
    case 'cross-hatch': return 'Cross-hatch';
    case 'surface-hatch': return 'Surface hatch';
    case 'stipple': return 'Stipple';
    case 'contour': return 'Contour';
  }
}
