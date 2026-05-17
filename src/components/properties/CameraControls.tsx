import { memo, useMemo } from 'react';
import type { CameraConfig } from '../../lib/types';
import { CAMERA_PRESETS } from '../../lib/cameras';
import { NumberInput, Vec3Input, CheckboxInput } from './inputs';
import { useDraftValue } from '../../hooks/useDraftValue';

interface Props {
  camera: CameraConfig;
  onChange: (updates: Partial<CameraConfig>) => void;
}

// Approximate equality on a camera preset — used to detect which preset is active
function presetMatchesCamera(p: CameraConfig, c: CameraConfig): boolean {
  const eps = 0.001;
  const eq = (a: number, b: number) => Math.abs(a - b) < eps;
  return (
    eq(p.eye[0], c.eye[0]) && eq(p.eye[1], c.eye[1]) && eq(p.eye[2], c.eye[2]) &&
    eq(p.center[0], c.center[0]) && eq(p.center[1], c.center[1]) && eq(p.center[2], c.center[2]) &&
    eq(p.fovy, c.fovy) && p.ortho === c.ortho
  );
}

export const CameraControls = memo(function CameraControls({ camera, onChange }: Props) {
  const activePresetName = useMemo(() => {
    const m = CAMERA_PRESETS.find((p) => presetMatchesCamera(p, camera));
    return m?.name ?? '';
  }, [camera]);

  const zoom = camera.zoom ?? 1;
  const [zoomDraft, setZoomDraft] = useDraftValue(zoom, (v) => onChange({ zoom: v }));

  return (
    <div className="properties-section">
      <div className="properties-section-title">Camera</div>
      <div className="property-grid">
        <div className="property-row">
          <label className="property-label">Preset</label>
          <select
            className="input input-sm"
            value={activePresetName}
            onChange={(e) => {
              const preset = CAMERA_PRESETS.find((p) => p.name === e.target.value);
              if (preset) onChange({ ...preset, zoom: zoom });
            }}
          >
            {!activePresetName && <option value="">Custom</option>}
            {CAMERA_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="property-row">
          <label className="property-label">Zoom</label>
          <div className="zoom-control">
            <input
              type="range"
              className="zoom-slider"
              min={-6}
              max={5}
              step={0.01}
              value={Math.log2(zoomDraft)}
              onChange={(e) => setZoomDraft(Math.pow(2, parseFloat(e.target.value)))}
            />
            <input
              type="number"
              className="input input-sm zoom-number"
              value={parseFloat(zoomDraft.toFixed(2))}
              step={0.1}
              min={0.01}
              max={50}
              onChange={(e) => setZoomDraft(Math.max(0.01, parseFloat(e.target.value) || 1))}
            />
            {zoomDraft !== 1 && (
              <button className="btn btn-xs btn-ghost" onClick={() => setZoomDraft(1)} title="Reset zoom">
                1x
              </button>
            )}
          </div>
        </div>

        <NumberInput label="FOV" value={camera.fovy} onChange={(v) => onChange({ fovy: v })} step={5} min={10} max={120} />
        <Vec3Input label="Eye" value={camera.eye} onChange={(v) => onChange({ eye: v })} step={0.5} />
        <Vec3Input label="Target" value={camera.center} onChange={(v) => onChange({ center: v })} step={0.5} />
        <CheckboxInput label="Ortho" value={camera.ortho} onChange={(v) => onChange({ ortho: v })} />
        {camera.ortho && (
          <NumberInput label="Ortho Size" value={camera.orthoSize} onChange={(v) => onChange({ orthoSize: v })} step={0.5} min={0.5} max={20} />
        )}
      </div>
    </div>
  );
});
