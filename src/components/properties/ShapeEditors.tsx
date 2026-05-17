import { memo } from 'react';
import type {
  CubeParams, SphereParams, ConeParams, CylinderParams,
  FunctionParams, MeshParams, PointCloudParams, BooleanParams,
  SceneNode, PointCloudPattern,
} from '../../lib/types';
import { NumberInput, SelectInput, Vec3Input, TextInput } from './inputs';

type Change = (p: Record<string, unknown>) => void;

export const CubeEditor = memo(function CubeEditor({ p, onChange }: { p: CubeParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <Vec3Input label="Min" value={p.min} onChange={(v) => onChange({ min: v })} step={0.1} />
      <Vec3Input label="Max" value={p.max} onChange={(v) => onChange({ max: v })} step={0.1} />
    </div>
  );
});

export const SphereEditor = memo(function SphereEditor({ p, onChange }: { p: SphereParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <Vec3Input label="Center" value={p.center} onChange={(v) => onChange({ center: v })} step={0.1} />
      <NumberInput label="Radius" value={p.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
    </div>
  );
});

export const ConeEditor = memo(function ConeEditor({ p, onChange }: { p: ConeParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <NumberInput label="Radius" value={p.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
      <NumberInput label="Height" value={p.height} onChange={(v) => onChange({ height: v })} step={0.1} min={0.01} />
    </div>
  );
});

export const CylinderEditor = memo(function CylinderEditor({ p, onChange }: { p: CylinderParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <NumberInput label="Radius" value={p.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
      <NumberInput label="Z Start" value={p.z0} onChange={(v) => onChange({ z0: v })} step={0.1} />
      <NumberInput label="Z End" value={p.z1} onChange={(v) => onChange({ z1: v })} step={0.1} />
    </div>
  );
});

export const FunctionEditor = memo(function FunctionEditor({ p, onChange }: { p: FunctionParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <TextInput label="f(x, y) =" value={p.expression} onChange={(v) => onChange({ expression: v })} mono full />
      <SelectInput
        label="Direction"
        value={p.direction}
        options={[
          { value: 'above', label: 'Above' },
          { value: 'below', label: 'Below' },
        ]}
        onChange={(v) => onChange({ direction: v })}
      />
      <div className="property-section-label">Bounds</div>
      <Vec3Input label="Min" value={p.bounds.min} onChange={(v) => onChange({ bounds: { ...p.bounds, min: v } })} step={0.5} />
      <Vec3Input label="Max" value={p.bounds.max} onChange={(v) => onChange({ bounds: { ...p.bounds, max: v } })} step={0.5} />
    </div>
  );
});

export const MeshEditor = memo(function MeshEditor({ p }: { p: MeshParams }) {
  return (
    <div className="property-grid">
      <div className="property-row">
        <label className="property-label">File</label>
        <span className="property-value-text">{p.fileName}</span>
      </div>
      <div className="property-row">
        <label className="property-label">Format</label>
        <span className="property-value-text">{p.format.toUpperCase()}</span>
      </div>
    </div>
  );
});

export const PointCloudEditor = memo(function PointCloudEditor({ p, onChange }: { p: PointCloudParams; onChange: Change }) {
  return (
    <div className="property-grid">
      <SelectInput
        label="Pattern"
        value={p.pattern}
        options={[
          { value: 'fibonacci-sphere', label: 'Fibonacci Sphere' },
          { value: 'random-sphere', label: 'Random Sphere' },
          { value: 'random-cube', label: 'Random Cube' },
          { value: 'grid', label: '3D Grid' },
        ]}
        onChange={(v) => onChange({ pattern: v as PointCloudPattern })}
      />
      <NumberInput label="Count" value={p.count} onChange={(v) => onChange({ count: Math.round(v) })} step={10} min={1} max={5000} />
      <NumberInput label="Radius" value={p.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.1} />
      <NumberInput label="Point Size" value={p.pointSize} onChange={(v) => onChange({ pointSize: v })} step={0.005} min={0.005} />
      {p.pattern === 'grid' && (
        <NumberInput label="Grid Spacing" value={p.gridSpacing} onChange={(v) => onChange({ gridSpacing: v })} step={0.05} min={0.05} />
      )}
    </div>
  );
});

export const BooleanEditor = memo(function BooleanEditor({
  p, onChange, nodes, currentId,
}: {
  p: BooleanParams;
  onChange: Change;
  nodes: SceneNode[];
  currentId: string;
}) {
  // Eligible child nodes: not this node, not booleans (avoid recursion)
  const eligible = nodes.filter((n) => n.id !== currentId && n.type !== 'boolean');
  return (
    <div className="property-grid">
      <SelectInput
        label="Operation"
        value={p.operation}
        options={[
          { value: 'difference', label: 'Difference' },
          { value: 'intersection', label: 'Intersection' },
          { value: 'union', label: 'Union' },
        ]}
        onChange={(v) => onChange({ operation: v })}
      />
      <div className="property-row">
        <label className="property-label">Child A</label>
        <select
          className="input input-sm"
          value={p.childIds[0] ?? ''}
          onChange={(e) => onChange({ childIds: [e.target.value, p.childIds[1] ?? ''] as [string, string] })}
        >
          <option value="">(none)</option>
          {eligible.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      <div className="property-row">
        <label className="property-label">Child B</label>
        <select
          className="input input-sm"
          value={p.childIds[1] ?? ''}
          onChange={(e) => onChange({ childIds: [p.childIds[0] ?? '', e.target.value] as [string, string] })}
        >
          <option value="">(none)</option>
          {eligible.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      {(!p.childIds[0] || !p.childIds[1]) && (
        <div className="property-row property-row-full" style={{ opacity: 0.7, fontStyle: 'italic' }}>
          Pick two shapes to combine.
        </div>
      )}
    </div>
  );
});
