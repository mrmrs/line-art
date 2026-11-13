import type { CompositionParams } from '../lib/composition-types';
import { useSceneStore } from '../lib/store';
import { useViewSettings } from '../lib/view-settings';
import { PaperControls } from './PaperControls';
import './DocumentControls.css';

export function DocumentControls() {
  const settings = useSceneStore(s => s.renderSettings);
  const updateSettings = useSceneStore(s => s.updateRenderSettings);
  const packed = useSceneStore(s => s.nodes.find(node => node.id === s.selectedId && node.type === 'packed-composition'));
  const updateNodeParams = useSceneStore(s => s.updateNodeParams);
  const optimize = useViewSettings(s => s.optimizePaths);
  const setOptimize = useViewSettings(s => s.setOptimizePaths);
  const params = packed?.params as CompositionParams | undefined;

  return <section className="properties-section document-controls" aria-label="Document">
    <div className="properties-section-title">Document</div>
    <div className="document-pair">
      <div className="document-row">
        <label htmlFor="document-stroke-width">Stroke</label>
        <div className="document-row-inputs">
          <input id="document-stroke-width" aria-label="Stroke width" type="number" className="input input-sm" value={settings.strokeWidth} min={0.1} max={5} step={0.1} onChange={event => {
            const value = event.currentTarget.valueAsNumber;
            if (Number.isFinite(value) && value >= 0.1 && value <= 5) updateSettings({ strokeWidth: value });
          }} />
          <input aria-label="Stroke color" type="color" className="input-color" value={settings.strokeColor} onChange={event => updateSettings({ strokeColor: event.target.value })} />
        </div>
      </div>
      <label className="document-row"><span>BG</span><input aria-label="BG color" type="color" className="input-color" value={settings.backgroundColor} onChange={event => updateSettings({ backgroundColor: event.target.value })} /></label>
    </div>
    <div className="document-pair">
      <label className="document-row"><span>Quality</span><select className="input input-sm" aria-label="Visibility quality" value={settings.curveTolerance ?? 0.25} onChange={event => updateSettings({ curveTolerance: Number(event.target.value) })}>
        <option value={1}>Fast</option><option value={0.25}>Fine</option><option value={0.1}>Precise</option><option value={0.025}>Ultra</option>
      </select></label>
      <label className="document-row document-optimize"><span>Optimize paths</span><input type="checkbox" checked={optimize} onChange={event => setOptimize(event.target.checked)} title="Reorder paths for shorter pen travel" /></label>
    </div>
    <PaperControls key={packed?.id ?? 'scene'} composition={packed && params ? {
      widthMm: params.widthMm, heightMm: params.heightMm,
      onChange: (widthMm, heightMm) => updateNodeParams(packed.id, {
        widthMm, heightMm,
        marginMm: Math.min(params.marginMm, Math.min(widthMm, heightMm) / 3),
        quiet: params.quiet.map(region => {
          const width = Math.max(1, Math.min(widthMm, region.width * widthMm / params.widthMm));
          const height = Math.max(1, Math.min(heightMm, region.height * heightMm / params.heightMm));
          return { ...region, width, height,
            x: Math.max(0, Math.min(widthMm - width, region.x * widthMm / params.widthMm)),
            y: Math.max(0, Math.min(heightMm - height, region.y * heightMm / params.heightMm)),
          };
        }),
      }),
    } : undefined} />
  </section>;
}
