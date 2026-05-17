import { memo } from 'react';
import type { TransformParams } from '../../lib/types';
import { Vec3Input } from './inputs';

interface Props {
  transform: TransformParams;
  onChange: (t: Partial<TransformParams>) => void;
}

export const TransformEditor = memo(function TransformEditor({ transform, onChange }: Props) {
  return (
    <div className="property-grid">
      <Vec3Input label="Position" value={transform.translate} onChange={(v) => onChange({ translate: v })} step={0.1} />
      <Vec3Input label="Rotation" value={transform.rotate} onChange={(v) => onChange({ rotate: v })} step={5} />
      <Vec3Input label="Scale" value={transform.scale} onChange={(v) => onChange({ scale: v })} step={0.1} min={0.01} />
    </div>
  );
});
