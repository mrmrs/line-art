import { ResponsivePanel } from './ResponsivePanel';
import { GridOverlay } from './GridOverlay';
import { randomizeComposition } from '../lib/randomize';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SceneNode } from '../lib/types';
import type { CompositionParams, MotifKind } from '../lib/composition-types';
import { COMPOSITION_PRESETS, DEFAULT_COMPOSITION, MOTIFS } from '../lib/composition-types';
import { compositionCamera, compositionResolution, footprintParts, footprintArea } from '../lib/composition';
import { selectAssemblies, removeBranches } from '../lib/composition-selection';
import type { PackingResult } from '../lib/composition';
import { useSceneStore } from '../lib/store';
import { useWorkerRender } from '../hooks/useWorkerRender';
import { DocumentControls } from './DocumentControls';
import './ComposeWorkspace.css';

export function ComposeWorkspace({ node, compact = false, propertiesOpen = false, onCloseProperties }: {
  node: SceneNode; compact?: boolean; propertiesOpen?: boolean; onCloseProperties: () => void;
}) {
  const p = node.params as CompositionParams;
  const update = useSceneStore(s => s.updateNodeParams);
  const updateNode = useSceneStore(s => s.updateNode);
  const settings = useSceneStore(s => s.renderSettings);
  const [selected, select] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('Choose a recipe, then generate your composition.');
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 400, height: 400 });
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setStageSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const paperScale = Math.min(Math.max(1, stageSize.width - 48) / p.widthMm, Math.max(1, stageSize.height - 48) / p.heightMm);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const nodes = useMemo(() => [node], [node]);
  const camera = useMemo(() => compositionCamera(p), [p]);
  const previewSettings = useMemo(() => ({ ...settings, near: 0.1, far: 100 }), [settings]);
  const { width, height } = compositionResolution(p);
  const render = useWorkerRender(nodes, camera, width, height, previewSettings, false);
  // Hit regions use the actual occupied pieces so an enclosing frame cannot
  // intercept clicks intended for a child in its opening.
  const hitPaths = useMemo(() => p.instances.map(i => footprintParts(i, true)
    .map(poly => `M${poly.map(v => v.join(',')).join('L')}Z`).join('')), [p.instances]);
  const occupied = useMemo(() => p.instances.reduce((sum, i) => sum + footprintArea(i, p.nesting === true), 0), [p.instances, p.nesting]);
  const descendants = p.instances.filter(i => i.parentId).length;
  const selectedIds = selected.filter(id => p.instances.some(i => i.id === id));
  const coverage = occupied / ((p.widthMm - 2 * p.marginMm) * (p.heightMm - 2 * p.marginMm));
  const change = (values: Partial<CompositionParams>) => update(node.id, values);
  const cancel = () => { worker.current?.terminate(); worker.current = null; setBusy(false); setStatus('Packing cancelled. Your previous composition is preserved.'); };
  const generate = (refill: boolean, params = p) => {
    worker.current?.terminate(); setBusy(true); setError(''); setStatus('Fitting forms…');
    const instance = new Worker(new URL('../lib/composition-worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    const finish = () => { instance.terminate(); if (worker.current === instance) worker.current = null; setBusy(false); };
    instance.onmessage = e => {
      if (worker.current !== instance) return;
      const message = e.data;
      if (message.type === 'progress') setStatus(`Fitting forms · ${message.count} placed`);
      if (message.type === 'error') { setError(message.error); setStatus('Packing failed. Your previous composition is preserved.'); finish(); }
      if (message.type === 'result') {
        const current = useSceneStore.getState().nodes.find(n => n.id === node.id);
        if (current?.params !== p) { setStatus('Settings changed. Generate again to use the new settings.'); finish(); return; }
        const result = message.result as PackingResult;
        change({ ...params, instances: result.instances });
        select([]);
        const repaired = result.repairAdded ? ` · ${result.repairAdded} fitted into gaps` : '';
        const limit = result.limited ? result.instances.length >= params.maxInstances
          ? ' · Form limit reached.' : ' · Fit limit reached; try smaller forms or less clearance.' : '';
        setStatus(`${result.instances.length} forms · ${Math.round(result.coverage * 100)}% footprint coverage${repaired}${limit}`);
        finish();
      }
    };
    instance.onerror = e => { setError(e.message || 'Packing failed'); setStatus('Packing failed. Your previous composition is preserved.'); finish(); };
    instance.postMessage({ params, refill });
  };
  const pin = (value: boolean) => change({ instances: p.instances.map(i => selectedIds.includes(i.id) ? { ...i, pinned: value } : i) });
  const pick = (id: string, additive: boolean) => select(current => additive ? current.includes(id) ? current.filter(x => x !== id) : [...current, id] : [id]);
  const numeric = (key: keyof CompositionParams, label: string, min: number, max: number, step: number) => (
    <label className="compose-field" key={key}><span>{label}</span><input className="input input-sm" type="number" aria-label={label}
      min={min} max={max} step={step} value={(p[key] ?? (key === 'recursionScale' ? 0.5 : 0)) as number} disabled={busy || (key === 'recursionDepth' || key === 'recursionScale') && !p.nesting}
      onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) change({ [key]: value }); }} /></label>
  );
  return <>
    <main className="compose-workspace" tabIndex={-1} data-workspace-focus aria-label="Composition canvas">
      <div className="compose-stage" ref={stageRef}>
        <div className="compose-paper" aria-label="Composition paper" style={{ width: p.widthMm * paperScale, height: p.heightMm * paperScale, background: settings.backgroundColor }}>
          <GridOverlay widthMm={p.widthMm} heightMm={p.heightMm} />
          <div className="compose-art" dangerouslySetInnerHTML={{ __html: render.svg }} />
          <svg className="compose-selection" viewBox={`0 0 ${p.widthMm} ${p.heightMm}`} aria-label="Select composition forms">
            <g transform={`translate(0 ${p.heightMm}) scale(1 -1)`}>
              {p.quiet.map(q => <rect key={q.id} x={q.x} y={q.y} width={q.width} height={q.height} className="compose-quiet" />)}
              {p.instances.map((i, j) => <path key={i.id} d={hitPaths[j]} fillRule="nonzero" data-instance-id={i.id} data-parent-id={i.parentId} data-generation={i.generation ?? 0}
                className={`compose-hit${selected.includes(i.id) ? ' is-selected' : ''}${i.pinned ? ' is-pinned' : ''}`}
                role="button" tabIndex={0} aria-label={`${i.motif} ${j + 1}${i.parentId ? `, level ${i.generation}` : ''}${i.pinned ? ', kept' : ''}`} aria-pressed={selected.includes(i.id)}
                onClick={e => pick(i.id, e.shiftKey || e.metaKey)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i.id, e.shiftKey); } }}>
                <title>{i.motif}{i.parentId ? ` · level ${i.generation}` : ''}{i.pinned ? ' · kept' : ''}</title>
              </path>)}
            </g>
          </svg>

        </div>
      </div>
    </main>
    <ResponsivePanel compact={compact} open={propertiesOpen} title="Properties" onClose={onCloseProperties}>
    <aside className="properties compose-controls" aria-label="Packed composition controls">
      <DocumentControls />
      <div className="properties-header"><input className="input properties-name-input" aria-label="Layer title" value={node.name} onChange={event => updateNode(node.id, { name: event.target.value })} /></div>
      {p.instances.length > 0 && <div className="properties-section compose-selection-controls" aria-label="Composition selection">
        <div className="properties-section-title">Selection <span>{selectedIds.length || ''}</span></div>
        <div className="compose-selection-actions">
          <button className="btn btn-xs" disabled={!selectedIds.length || busy} onClick={() => select(selectAssemblies(p.instances, selectedIds))}>Select assembly</button>
          <button className="btn btn-xs" disabled={!selectedIds.length || busy} onClick={() => pin(true)}>Keep selected</button>
          <button className="btn btn-xs" disabled={!selectedIds.length || busy} onClick={() => pin(false)}>Release selected</button>
          <button className="btn btn-xs" disabled={!selectedIds.length || busy} title="Remove selected forms and their descendants" onClick={() => { change({ instances: removeBranches(p.instances, selectedIds) }); select([]); }}>Remove selected</button>
        </div>
      </div>}
      <div className="properties-section"><div className="properties-section-title">Starting points</div>
        {COMPOSITION_PRESETS.map(recipe => <button className="compose-recipe" key={recipe.name} disabled={busy} onClick={() => { change({ ...DEFAULT_COMPOSITION, ...recipe.values, widthMm: p.widthMm, heightMm: p.heightMm, marginMm: p.marginMm, quiet: p.quiet, instances: p.instances }); setStatus(`${recipe.name} selected. Generate to apply; kept forms will stay.`); }}><strong>{recipe.name}</strong><span>{recipe.description}</span></button>)}
      </div>
      <div className="properties-section"><div className="properties-section-title">Forms</div><div className="compose-motifs">
        {MOTIFS.map(m => <label key={m.value}><input type="checkbox" checked={p.motifs.includes(m.value)} disabled={busy || (p.motifs.length === 1 && p.motifs.includes(m.value))}
          onChange={e => change({ motifs: e.target.checked ? [...p.motifs, m.value] : p.motifs.filter(x => x !== m.value) as MotifKind[] })} />{m.label}</label>)}
      </div></div>
      <div className="properties-section"><div className="properties-section-title">Composition <button className="btn btn-xs btn-ghost" disabled={busy} onClick={() => generate(false, randomizeComposition(p))}>Randomize</button></div>
        <label className="compose-field"><span>Construction</span><select className="input input-sm" aria-label="Construction" disabled={busy} value={p.construction ?? 'free'}
          onChange={e => change({ construction: e.target.value as 'shared' | 'free' })}>
          <option value="shared">Shared isometric</option><option value="free">Free orientation</option>
        </select></label>
        <p className="compose-note">Shared isometric keeps one set of 3D axes. Forms turn on their base plane, with consistent frame walls. Generate refits unlocked forms; kept forms retain their original construction.</p>
        {numeric('seed', 'Seed', 0, 4294967295, 1)}
        {numeric('density', 'Target coverage', 0.1, 0.85, 0.05)}
        {numeric('minSizeMm', 'Smallest form (mm)', 2, 100, 1)}
        {numeric('maxSizeMm', 'Largest form (mm)', 2, 300, 1)}
        {numeric('aspect', 'Maximum aspect', 1, 6, 0.1)}
        {numeric('coherence', 'Direction coherence', 0, 1, 0.05)}
        {numeric('depth', 'Depth', 0.1, 1.5, 0.05)}
        {numeric('detail', 'Surface detail', 1, 12, 1)}
        {numeric('clearanceMm', 'Clearance (mm)', 0.1, 20, 0.1)}
        {numeric('maxInstances', 'Maximum forms', 1, 1500, 50)}
        <p className="compose-note">Surface detail updates immediately. Generate applies placement settings. Kept forms retain their original shape and position. Refill measures free pockets and keeps all existing forms.</p>
      </div>
      <div className="properties-section"><div className="properties-section-title">Nesting & recursion</div>
        <label className="compose-toggle"><input type="checkbox" checked={p.nesting === true} disabled={busy}
          onChange={e => change({ nesting: e.target.checked, ...(!e.target.checked ? { recursionDepth: 0 } : {}) })} />Nest in openings</label>
        {numeric('recursionDepth', 'Recursion depth', 0, 5, 1)}
        {numeric('recursionScale', 'Child scale', 0.25, 0.7, 0.05)}
        <p className="compose-note">Nest uses actual occupied shapes, leaving apertures available. Recursion grows smaller forms inside frame openings and stops at the smallest form size. Keeping a child preserves its enclosing frames. Select assembly to keep a whole family; removing a frame removes its descendants.</p>
      </div>
      <div className="properties-section"><div className="properties-section-title">Paper & quiet space</div>
        {numeric('marginMm', 'Margin (mm)', 0, Math.min(p.widthMm, p.heightMm) / 3, 1)}
        <label className="compose-field"><span>Quiet region</span><select className="input input-sm" aria-label="Quiet region" disabled={busy} value={p.quiet[0]?.id ?? 'none'} onChange={e => {
          const id = e.target.value; change({ quiet: id === 'none' ? [] : [{ id,
            x: p.widthMm * (id === 'center' ? 0.35 : 0.46), y: p.heightMm * 0.25,
            width: p.widthMm * (id === 'center' ? 0.3 : 0.08), height: p.heightMm * 0.5 }] });
        }}><option value="none">None</option><option value="center">Central clearing</option><option value="channel">Vertical channel</option></select></label>
        <button className="btn btn-xs" disabled={busy || !p.instances.length} onClick={() => change({ instances: p.instances.map(i => ({ ...i, pinned: i.pinned || i.x < p.widthMm / 3 })) })}>Keep left third</button>
        <button className="btn btn-xs" disabled={busy} onClick={() => change({ instances: p.instances.map(i => ({ ...i, pinned: false })) })}>Release all</button>
        <p className="compose-note">Generate to clear a new quiet region. Resize paper before fitting; export uses these exact dimensions.</p>
      </div>
      <div className="compose-generate">
        {busy ? <button className="btn" onClick={cancel}>Cancel packing</button> : <><button className="btn" onClick={() => generate(false)}>Generate composition</button><button className="btn btn-sm" disabled={!p.instances.length} onClick={() => generate(true)}>Refill gaps</button></>}
        <p role="status">{status}</p>{error && <p className="compose-error" role="alert">{error}</p>}
        <p className="compose-summary">{p.instances.length} forms{descendants ? ` · ${descendants} nested` : ''} · {Math.round(coverage * 100)}% coverage · {render.pathCount.toLocaleString()} strokes</p>
        {render.rendering && <button className="btn btn-xs" onClick={render.cancel}>Cancel preview</button>}
        {render.error && <p role="alert" className="compose-error">{render.error} <button className="btn btn-xs" onClick={render.retry}>Retry preview</button></p>}
      </div>
    </aside>
    </ResponsivePanel>

  </>;
}
