import { useSceneStore } from '../lib/store';
import { CAMERA_PRESETS } from '../lib/cameras';
import type {
  Vec3,
  CubeParams,
  SphereParams,
  ConeParams,
  CylinderParams,
  FunctionParams,
  PointCloudParams,
  MeshParams,
  BooleanParams,
  CubeGridParams,
  LineGridParams,
  PlaneGridParams,
  PlaneSizeMethod,
  AutomataGridParams,
  AutomataPattern,
  TransformParams,
  SlicingConfig,
  PointCloudPattern,
  GridSizeMethod,
  GridPresenceMethod,
  LineLengthMethod,
  CameraConfig,
} from '../lib/types';
import { AUTOMATA_RULE_PRESETS } from '../lib/automata-grid';
import { suggestCountXForText } from '../lib/cube-grid';

// =============================================================================
// Right Sidebar: Properties panel for the selected node + camera controls
// =============================================================================

export function Properties() {
  const selectedId = useSceneStore((s) => s.selectedId);
  const nodes = useSceneStore((s) => s.nodes);
  const updateNode = useSceneStore((s) => s.updateNode);
  const updateNodeParams = useSceneStore((s) => s.updateNodeParams);
  const updateNodeTransform = useSceneStore((s) => s.updateNodeTransform);
  const updateNodeSlicing = useSceneStore((s) => s.updateNodeSlicing);
  const cameras = useSceneStore((s) => s.cameras);
  const activeCameraIndex = useSceneStore((s) => s.activeCameraIndex);
  const updateCamera = useSceneStore((s) => s.updateCamera);

  const node = nodes.find((n) => n.id === selectedId);

  if (!node) {
    return (
      <aside className="properties">
        <CameraControls
          camera={cameras[activeCameraIndex]}
          cameraIndex={activeCameraIndex}
          onChange={(updates) => updateCamera(activeCameraIndex, updates)}
        />
      </aside>
    );
  }

  return (
    <aside className="properties">
      {/* Camera controls always at top */}
      <CameraControls
        camera={cameras[activeCameraIndex]}
        cameraIndex={activeCameraIndex}
        onChange={(updates) => updateCamera(activeCameraIndex, updates)}
      />

      <div className="properties-header">
        <input
          className="input properties-name-input"
          value={node.name}
          onChange={(e) => updateNode(node.id, { name: e.target.value })}
        />
      </div>

      {/* Transform */}
      <div className="properties-section">
        <div className="properties-section-title">Transform</div>
        <TransformEditor
          transform={node.transform}
          onChange={(t) => updateNodeTransform(node.id, t)}
        />
      </div>

      {/* Shape-specific params */}
      <div className="properties-section">
        <div className="properties-section-title">Shape</div>
        <ShapeParamsEditor node={node} onChange={(p) => updateNodeParams(node.id, p)} />
      </div>

      {/* Slicing */}
      <div className="properties-section">
        <div className="properties-section-title">Slicing</div>
        <SlicingEditor
          slicing={node.slicing}
          onChange={(s) => updateNodeSlicing(node.id, s)}
        />
      </div>
    </aside>
  );
}

// --- Transform Editor ---

function TransformEditor({
  transform,
  onChange,
}: {
  transform: TransformParams;
  onChange: (t: Partial<TransformParams>) => void;
}) {
  return (
    <div className="property-grid">
      <Vec3Input
        label="Position"
        value={transform.translate}
        onChange={(v) => onChange({ translate: v })}
        step={0.1}
      />
      <Vec3Input
        label="Rotation"
        value={transform.rotate}
        onChange={(v) => onChange({ rotate: v })}
        step={5}
      />
      <Vec3Input
        label="Scale"
        value={transform.scale}
        onChange={(v) => onChange({ scale: v })}
        step={0.1}
        min={0.01}
      />
    </div>
  );
}

// --- Shape Params Editor ---

function ShapeParamsEditor({
  node,
  onChange,
}: {
  node: { type: string; params: Record<string, unknown> };
  onChange: (p: Record<string, unknown>) => void;
}) {
  const p = node.params;

  switch (node.type) {
    case 'cube': {
      const cp = p as unknown as CubeParams;
      return (
        <div className="property-grid">
          <Vec3Input label="Min" value={cp.min} onChange={(v) => onChange({ min: v })} step={0.1} />
          <Vec3Input label="Max" value={cp.max} onChange={(v) => onChange({ max: v })} step={0.1} />
        </div>
      );
    }
    case 'sphere': {
      const sp = p as unknown as SphereParams;
      return (
        <div className="property-grid">
          <Vec3Input label="Center" value={sp.center} onChange={(v) => onChange({ center: v })} step={0.1} />
          <NumberInput label="Radius" value={sp.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
        </div>
      );
    }
    case 'cone': {
      const cp = p as unknown as ConeParams;
      return (
        <div className="property-grid">
          <NumberInput label="Radius" value={cp.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
          <NumberInput label="Height" value={cp.height} onChange={(v) => onChange({ height: v })} step={0.1} min={0.01} />
        </div>
      );
    }
    case 'cylinder': {
      const cp = p as unknown as CylinderParams;
      return (
        <div className="property-grid">
          <NumberInput label="Radius" value={cp.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.01} />
          <NumberInput label="Z Start" value={cp.z0} onChange={(v) => onChange({ z0: v })} step={0.1} />
          <NumberInput label="Z End" value={cp.z1} onChange={(v) => onChange({ z1: v })} step={0.1} />
        </div>
      );
    }
    case 'function': {
      const fp = p as unknown as FunctionParams;
      return (
        <div className="property-grid">
          <div className="property-row property-row-full">
            <label className="property-label">f(x, y) =</label>
            <input
              className="input input-sm input-mono"
              value={fp.expression}
              onChange={(e) => onChange({ expression: e.target.value })}
            />
          </div>
          <SelectInput
            label="Direction"
            value={fp.direction}
            options={[
              { value: 'above', label: 'Above' },
              { value: 'below', label: 'Below' },
            ]}
            onChange={(v) => onChange({ direction: v })}
          />
        </div>
      );
    }
    case 'mesh': {
      const mp = p as unknown as MeshParams;
      return (
        <div className="property-grid">
          <div className="property-row">
            <label className="property-label">File</label>
            <span className="property-value-text">{mp.fileName}</span>
          </div>
          <div className="property-row">
            <label className="property-label">Format</label>
            <span className="property-value-text">{mp.format.toUpperCase()}</span>
          </div>
        </div>
      );
    }
    case 'point-cloud': {
      const pp = p as unknown as PointCloudParams;
      return (
        <div className="property-grid">
          <SelectInput
            label="Pattern"
            value={pp.pattern}
            options={[
              { value: 'fibonacci-sphere', label: 'Fibonacci Sphere' },
              { value: 'random-sphere', label: 'Random Sphere' },
              { value: 'random-cube', label: 'Random Cube' },
              { value: 'grid', label: '3D Grid' },
            ]}
            onChange={(v) => onChange({ pattern: v as PointCloudPattern })}
          />
          <NumberInput label="Count" value={pp.count} onChange={(v) => onChange({ count: Math.round(v) })} step={10} min={1} max={5000} />
          <NumberInput label="Radius" value={pp.radius} onChange={(v) => onChange({ radius: v })} step={0.1} min={0.1} />
          <NumberInput label="Point Size" value={pp.pointSize} onChange={(v) => onChange({ pointSize: v })} step={0.005} min={0.005} />
          {pp.pattern === 'grid' && (
            <NumberInput label="Grid Spacing" value={pp.gridSpacing} onChange={(v) => onChange({ gridSpacing: v })} step={0.05} min={0.05} />
          )}
        </div>
      );
    }
    case 'boolean': {
      const bp = p as unknown as BooleanParams;
      return (
        <div className="property-grid">
          <SelectInput
            label="Operation"
            value={bp.operation}
            options={[
              { value: 'difference', label: 'Difference' },
              { value: 'intersection', label: 'Intersection' },
              { value: 'union', label: 'Union' },
            ]}
            onChange={(v) => onChange({ operation: v })}
          />
        </div>
      );
    }
    case 'cube-grid': {
      const gp = p as unknown as CubeGridParams;
      return <CubeGridEditor params={gp} onChange={onChange} />;
    }
    case 'line-grid': {
      const lp = p as unknown as LineGridParams;
      return <LineGridEditor params={lp} onChange={onChange} />;
    }
    case 'plane-grid': {
      const pp = p as unknown as PlaneGridParams;
      return <PlaneGridEditor params={pp} onChange={onChange} />;
    }
    case 'automata-grid': {
      const ap = p as unknown as AutomataGridParams;
      return <AutomataGridEditor params={ap} onChange={onChange} />;
    }
    default:
      return <div className="property-row">No editable properties</div>;
  }
}

// --- Slicing Editor ---

function SlicingEditor({
  slicing,
  onChange,
}: {
  slicing: SlicingConfig;
  onChange: (s: Partial<SlicingConfig>) => void;
}) {
  return (
    <div className="property-grid">
      <div className="property-row">
        <label className="property-label">Enabled</label>
        <input
          type="checkbox"
          checked={slicing.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
      </div>
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
}

// =============================================================================
// Reusable input components
// =============================================================================

function Vec3Input({
  label,
  value,
  onChange,
  step = 0.1,
  min,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
  step?: number;
  min?: number;
}) {
  const labels = ['X', 'Y', 'Z'];
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
              value={value[i]}
              step={step}
              min={min}
              onChange={(e) => {
                const v: Vec3 = [...value];
                v[i] = parseFloat(e.target.value) || 0;
                onChange(v);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <input
        type="number"
        className="input input-sm"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="property-row">
      <label className="property-label">{label}</label>
      <select
        className="input input-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// Automata Grid Editor
// =============================================================================

function AutomataGridEditor({
  params: ap,
  onChange,
}: {
  params: AutomataGridParams;
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <div className="property-grid">
      {/* --- Grid --- */}
      <div className="property-section-label">Grid</div>

      <NumberInput label="Width" value={ap.gridWidth} onChange={(v) => onChange({ gridWidth: Math.max(1, Math.round(v)) })} step={1} min={1} max={64} />
      <NumberInput label="Height" value={ap.gridHeight} onChange={(v) => onChange({ gridHeight: Math.max(1, Math.round(v)) })} step={1} min={1} max={64} />
      <NumberInput label="Generations" value={ap.generations} onChange={(v) => onChange({ generations: Math.max(1, Math.round(v)) })} step={1} min={1} max={100} />
      <NumberInput label="Spacing" value={ap.spacing} onChange={(v) => onChange({ spacing: v })} step={0.02} min={0.05} />
      <NumberInput label="Cube Size" value={ap.cubeSize} onChange={(v) => onChange({ cubeSize: v })} step={0.02} min={0.01} />

      {/* --- Rule --- */}
      <div className="property-section-label">Rule</div>

      <div className="property-row">
        <label className="property-label">Preset</label>
        <select
          className="input input-sm"
          value=""
          onChange={(e) => {
            const preset = AUTOMATA_RULE_PRESETS.find((r) => r.name === e.target.value);
            if (preset) onChange({ rule: preset.rule });
          }}
        >
          <option value="" disabled>Choose...</option>
          {AUTOMATA_RULE_PRESETS.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} ({r.rule})
            </option>
          ))}
        </select>
      </div>

      <div className="property-row">
        <label className="property-label">B/S Rule</label>
        <input
          className="input input-sm input-mono"
          value={ap.rule}
          placeholder="B3/S23"
          onChange={(e) => onChange({ rule: e.target.value })}
        />
      </div>

      <div className="property-row">
        <label className="property-label">Wrap</label>
        <input
          type="checkbox"
          checked={ap.wrapEdges}
          onChange={(e) => onChange({ wrapEdges: e.target.checked })}
        />
      </div>

      {/* --- Initial State --- */}
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
}

// =============================================================================
// Plane Grid Editor
// =============================================================================

function PlaneGridEditor({
  params: pp,
  onChange,
}: {
  params: PlaneGridParams;
  onChange: (p: Record<string, unknown>) => void;
}) {
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
        <div className="property-row">
          <label className="property-label">Anisotropic</label>
          <input
            type="checkbox"
            checked={pp.anisotropic ?? false}
            onChange={(e) => onChange({ anisotropic: e.target.checked })}
            title="W and H get different noise values"
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Line Grid Editor
// =============================================================================

function LineGridEditor({
  params: lp,
  onChange,
}: {
  params: LineGridParams;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const lengthMethod = lp.lengthMethod ?? 'uniform';
  const segmented = lp.segmented ?? false;

  return (
    <div className="property-grid">
      {/* --- Grid --- */}
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

      {/* --- Length --- */}
      <div className="property-section-label">{segmented ? 'Pin Art' : 'Length'}</div>

      <NumberInput label="Total Length" value={lp.lineLength} onChange={(v) => onChange({ lineLength: v })} step={0.1} min={0.01} />

      {/* --- Segmentation (pin art) --- */}
      <div className="property-row">
        <label className="property-label">Pin Art Gap</label>
        <input
          type="checkbox"
          checked={segmented}
          onChange={(e) => onChange({ segmented: e.target.checked })}
        />
      </div>

      {segmented && (
        <>
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
      )}

      {/* --- Non-segmented: length variation drives total line length --- */}
      {!segmented && (
        <>
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
}

// =============================================================================
// Cube Grid Editor
// =============================================================================

function CubeGridEditor({
  params: gp,
  onChange,
}: {
  params: CubeGridParams;
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <div className="property-grid">
      {/* --- Structure --- */}
      <div className="property-section-label">Grid</div>

      <SelectInput
        label="Type"
        value={gp.dimensions}
        options={[
          { value: '2d', label: '2D (flat)' },
          { value: '3d', label: '3D (volume)' },
        ]}
        onChange={(v) => onChange({ dimensions: v })}
      />

      <NumberInput label="Count X" value={gp.countX} onChange={(v) => onChange({ countX: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      <NumberInput label="Count Y" value={gp.countY} onChange={(v) => onChange({ countY: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      {gp.dimensions === '3d' && (
        <NumberInput label="Count Z" value={gp.countZ} onChange={(v) => onChange({ countZ: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      )}
      <NumberInput label="Spacing" value={gp.spacing} onChange={(v) => onChange({ spacing: v })} step={0.05} min={0.1} />

      {/* --- Size --- */}
      <div className="property-section-label">Size</div>

      <SelectInput
        label="Method"
        value={gp.sizeMethod}
        options={[
          { value: 'uniform', label: 'Uniform' },
          { value: 'noise', label: 'Noise (fractal)' },
          { value: 'radial', label: 'Radial (center)' },
          { value: 'radial-inv', label: 'Radial (edges)' },
          { value: 'sine', label: 'Sine wave' },
          { value: 'random', label: 'Random' },
          { value: 'step', label: 'Staircase' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'manhattan', label: 'Manhattan dist' },
          { value: 'ripple', label: 'Ripple' },
          { value: 'expression', label: 'Expression' },
        ]}
        onChange={(v) => onChange({ sizeMethod: v as GridSizeMethod })}
      />

      <NumberInput label="Min Size" value={gp.sizeMin} onChange={(v) => onChange({ sizeMin: v })} step={0.02} min={0} />
      <NumberInput label="Max Size" value={gp.sizeMax} onChange={(v) => onChange({ sizeMax: v })} step={0.02} min={0.01} />

      {(gp.sizeMethod === 'noise' || gp.sizeMethod === 'random') && (
        <>
          <NumberInput label="Seed" value={gp.noiseSeed} onChange={(v) => onChange({ noiseSeed: Math.round(v) })} step={1} min={0} />
          {gp.sizeMethod === 'noise' && (
            <NumberInput label="Scale" value={gp.noiseScale} onChange={(v) => onChange({ noiseScale: v })} step={0.1} min={0.1} />
          )}
        </>
      )}

      {gp.sizeMethod === 'sine' && (
        <Vec3Input
          label="Frequency"
          value={gp.sineFrequency}
          onChange={(v) => onChange({ sineFrequency: v })}
          step={0.5}
        />
      )}

      {gp.sizeMethod === 'step' && (
        <NumberInput label="Levels" value={gp.stepCount} onChange={(v) => onChange({ stepCount: Math.max(2, Math.round(v)) })} step={1} min={2} max={20} />
      )}

      {gp.sizeMethod === 'gradient' && (
        <SelectInput
          label="Axis"
          value={gp.gradientAxis}
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
          onChange={(v) => onChange({ gradientAxis: v })}
        />
      )}

      {gp.sizeMethod === 'expression' && (
        <div className="property-row property-row-full">
          <label className="property-label">f(x,y,z,ix,iy,iz,nx,ny,nz) =</label>
          <input
            className="input input-sm input-mono"
            value={gp.sizeExpression}
            onChange={(e) => onChange({ sizeExpression: e.target.value })}
          />
        </div>
      )}

      {/* --- Presence --- */}
      <div className="property-section-label">Presence</div>

      <SelectInput
        label="Method"
        value={gp.presenceMethod}
        options={[
          { value: 'all', label: 'All cells' },
          { value: 'random', label: 'Random' },
          { value: 'threshold', label: 'Size threshold' },
          { value: 'checkerboard', label: 'Checkerboard' },
          { value: 'sphere-mask', label: 'Sphere' },
          { value: 'noise-mask', label: 'Noise mask' },
          { value: 'voxel-pyramid', label: 'Pyramid' },
          { value: 'voxel-torus', label: 'Torus' },
          { value: 'voxel-diamond', label: 'Diamond' },
          { value: 'voxel-cross', label: 'Cross (+)' },
          { value: 'voxel-letter', label: 'Text / Letter' },
          { value: 'menger-sponge', label: 'Menger Sponge' },
          { value: 'city-skyline', label: 'City Skyline' },
          { value: 'heightmap', label: 'Heightmap Terrain' },
          { value: 'maze', label: 'Maze' },
          { value: 'expression', label: 'Expression' },
        ]}
        onChange={(v) => onChange({ presenceMethod: v as GridPresenceMethod })}
      />

      {(gp.presenceMethod === 'random' || gp.presenceMethod === 'noise-mask') && (
        <NumberInput label="Density" value={gp.presenceProbability} onChange={(v) => onChange({ presenceProbability: Math.max(0, Math.min(1, v)) })} step={0.05} min={0} max={1} />
      )}

      {gp.presenceMethod === 'threshold' && (
        <NumberInput label="Min Size" value={gp.presenceThreshold} onChange={(v) => onChange({ presenceThreshold: v })} step={0.02} min={0} />
      )}

      {gp.presenceMethod === 'voxel-letter' && (
        <>
          <div className="property-row property-row-full">
            <label className="property-label">Text</label>
            <input
              className="input input-sm"
              value={gp.voxelLetter}
              maxLength={32}
              placeholder="HELLO WORLD"
              style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}
              onChange={(e) => onChange({ voxelLetter: e.target.value.toUpperCase() })}
            />
          </div>
          {gp.voxelLetter.length > 1 && (
            <div className="property-row">
              <label className="property-label">Auto-size X</label>
              <button
                className="btn btn-xs"
                title={`Set Count X to ${suggestCountXForText(gp.voxelLetter)} for pixel-perfect text`}
                onClick={() => onChange({ countX: suggestCountXForText(gp.voxelLetter) })}
              >
                {suggestCountXForText(gp.voxelLetter)} cols
              </button>
            </div>
          )}
        </>
      )}

      {/* --- Menger Sponge controls --- */}
      {gp.presenceMethod === 'menger-sponge' && (
        <NumberInput label="Depth" value={gp.mengerDepth ?? 2} onChange={(v) => onChange({ mengerDepth: Math.max(1, Math.min(4, Math.round(v))) })} step={1} min={1} max={4} />
      )}

      {/* --- City Skyline controls --- */}
      {gp.presenceMethod === 'city-skyline' && (
        <>
          <NumberInput label="Min Height" value={gp.cityMinHeight ?? 1} onChange={(v) => onChange({ cityMinHeight: Math.max(1, Math.round(v)) })} step={1} min={1} />
          <NumberInput label="Max Height" value={gp.cityMaxHeight ?? 8} onChange={(v) => onChange({ cityMaxHeight: Math.max(1, Math.round(v)) })} step={1} min={1} />
          <NumberInput label="Seed" value={gp.citySeed ?? 42} onChange={(v) => onChange({ citySeed: Math.round(v) })} step={1} min={0} />
        </>
      )}

      {/* --- Heightmap controls --- */}
      {gp.presenceMethod === 'heightmap' && (
        <>
          <NumberInput label="Noise Scale" value={gp.heightmapScale ?? 0.5} onChange={(v) => onChange({ heightmapScale: v })} step={0.05} min={0.05} />
          <NumberInput label="Seed" value={gp.heightmapSeed ?? 42} onChange={(v) => onChange({ heightmapSeed: Math.round(v) })} step={1} min={0} />
          <NumberInput label="Octaves" value={gp.heightmapOctaves ?? 3} onChange={(v) => onChange({ heightmapOctaves: Math.max(1, Math.min(6, Math.round(v))) })} step={1} min={1} max={6} />
        </>
      )}

      {/* --- Maze controls --- */}
      {gp.presenceMethod === 'maze' && (
        <>
          <NumberInput label="Seed" value={gp.mazeSeed ?? 42} onChange={(v) => onChange({ mazeSeed: Math.round(v) })} step={1} min={0} />
          <NumberInput label="Wall Width" value={gp.mazeWallThickness ?? 1} onChange={(v) => onChange({ mazeWallThickness: Math.max(1, Math.round(v)) })} step={1} min={1} max={3} />
        </>
      )}

      {(gp.presenceMethod === 'sphere-mask' ||
        gp.presenceMethod === 'voxel-pyramid' ||
        gp.presenceMethod === 'voxel-torus' ||
        gp.presenceMethod === 'voxel-diamond' ||
        gp.presenceMethod === 'voxel-cross' ||
        gp.presenceMethod === 'menger-sponge') && (
        <div className="property-row">
          <label className="property-label">Shell only</label>
          <input
            type="checkbox"
            checked={gp.voxelShellOnly}
            onChange={(e) => onChange({ voxelShellOnly: e.target.checked })}
          />
        </div>
      )}

      {gp.presenceMethod === 'expression' && (
        <div className="property-row property-row-full">
          <label className="property-label">show if:</label>
          <input
            className="input input-sm input-mono"
            value={gp.presenceExpression}
            onChange={(e) => onChange({ presenceExpression: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Camera Controls
// =============================================================================

function CameraControls({
  camera,
  cameraIndex,
  onChange,
}: {
  camera: CameraConfig;
  cameraIndex: number;
  onChange: (updates: Partial<CameraConfig>) => void;
}) {
  return (
    <div className="properties-section">
      <div className="properties-section-title">Camera</div>
      <div className="property-grid">
        {/* Preset selector -- preserves zoom when switching */}
        <div className="property-row">
          <label className="property-label">Preset</label>
          <select
            className="input input-sm"
            value=""
            onChange={(e) => {
              const preset = CAMERA_PRESETS.find((p) => p.name === e.target.value);
              if (preset) {
                // Preserve current zoom level when switching angles
                onChange({ ...preset, zoom: camera.zoom ?? 1 });
              }
            }}
          >
            <option value="" disabled>
              Choose...
            </option>
            {CAMERA_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Zoom */}
        <div className="property-row">
          <label className="property-label">Zoom</label>
          <div className="zoom-control">
            <input
              type="range"
              className="zoom-slider"
              min={-6}
              max={5}
              step={0.01}
              value={Math.log2(camera.zoom ?? 1)}
              onChange={(e) => onChange({ zoom: Math.pow(2, parseFloat(e.target.value)) })}
            />
            <input
              type="number"
              className="input input-sm zoom-number"
              value={parseFloat((camera.zoom ?? 1).toFixed(2))}
              step={0.1}
              min={0.01}
              max={50}
              onChange={(e) => onChange({ zoom: Math.max(0.01, parseFloat(e.target.value) || 1) })}
            />
            {(camera.zoom ?? 1) !== 1 && (
              <button
                className="btn btn-xs btn-ghost"
                onClick={() => onChange({ zoom: 1 })}
                title="Reset zoom"
              >
                1x
              </button>
            )}
          </div>
        </div>

        {/* FOV */}
        <NumberInput
          label="FOV"
          value={camera.fovy}
          onChange={(v) => onChange({ fovy: v })}
          step={5}
          min={10}
          max={120}
        />

        {/* Eye position */}
        <Vec3Input
          label="Eye"
          value={camera.eye}
          onChange={(v) => onChange({ eye: v })}
          step={0.5}
        />

        {/* Look-at target */}
        <Vec3Input
          label="Target"
          value={camera.center}
          onChange={(v) => onChange({ center: v })}
          step={0.5}
        />

        {/* Ortho toggle */}
        <div className="property-row">
          <label className="property-label">Ortho</label>
          <input
            type="checkbox"
            checked={camera.ortho}
            onChange={(e) => onChange({ ortho: e.target.checked })}
          />
        </div>

        {/* Ortho size (only when ortho is on) */}
        {camera.ortho && (
          <NumberInput
            label="Ortho Size"
            value={camera.orthoSize}
            onChange={(v) => onChange({ orthoSize: v })}
            step={0.5}
            min={0.5}
            max={20}
          />
        )}
      </div>
    </div>
  );
}
