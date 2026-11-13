import { counters } from '../lib/counters';
import { useCounters } from '../hooks/useCounters';
import type { SceneNode, CameraConfig } from '../lib/types';
import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '../lib/store';
import { DEFAULT_PLOT_SETTINGS } from '../lib/plot-settings';
import type { PlotSettings, PlotStats } from '../lib/plot-settings';
import { downloadSVG, copySVGToClipboard } from '../lib/export-svg';
import './ExportPanel.css';

export function ExportPanel({
  width,
  height,
  pageWidthMm,
  pageHeightMm,
  optimize,
  onClose,
  composition,
}: {
  width: number;
  height: number;
  pageWidthMm: number;
  pageHeightMm: number;
  optimize: boolean;
  onClose: () => void;
  composition?: { nodes: SceneNode[]; camera: CameraConfig; marginMm: number };
}) {
  const totals = useCounters();
  const [plot, setPlot] = useState<PlotSettings>(() => {
    try {
      return {
        ...DEFAULT_PLOT_SETTINGS,
        ...JSON.parse(localStorage.getItem('ln-plot-settings') ?? '{}'),
        // Hidden checks and estimates must not block an SVG export.
        minimumGapMm: 0,
        drawSpeed: DEFAULT_PLOT_SETTINGS.drawSpeed,
        travelSpeed: DEFAULT_PLOT_SETTINGS.travelSpeed,
        liftSeconds: DEFAULT_PLOT_SETTINGS.liftSeconds,
        ...(composition ? { marginMm: composition.marginMm } : {}),
      };
    } catch {
      return { ...DEFAULT_PLOT_SETTINGS, ...(composition ? { marginMm: composition.marginMm } : {}) };
    }
  });
  const [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [stats, setStats] = useState<PlotStats | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const abortExport = useRef<(() => void) | null>(null);
  const operation = useRef({ id: 0 });
  useEffect(() => {
    dialog.current?.showModal();
    const currentOperation = operation.current;
    return () => {
      currentOperation.id++;
      abortExport.current?.();
    };
  }, []);
  const change = (next: Partial<PlotSettings>) => {
    const p = { ...plot, ...next };
    setPlot(p);
    setStats(null);
    try {
      localStorage.setItem('ln-plot-settings', JSON.stringify(p));
    } catch {
      /* export still works without settings storage */
    }
  };
  const cancel = () => {
    operation.current.id++;
    abortExport.current?.();
    setBusy(false);
    setStatus('Export cancelled.');
  };
  const generate = () => new Promise<{ svg: string; stats: PlotStats }>((resolve, reject) => {
    const instance = new Worker(
      new URL('../lib/export-worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = instance;
    const release = () => {
      instance.terminate();
      worker.current = null;
      abortExport.current = null;
    };
    const fail = (error: Error) => {
      if (worker.current !== instance) return;
      release();
      reject(error);
    };
    abortExport.current = () => fail(new DOMException('Export cancelled', 'AbortError'));
    instance.onmessage = (event) => {
      if (worker.current !== instance) return;
      const m = event.data;
      if (m.type === 'progress') setStatus(m.message);
      if (m.type === 'error') fail(new Error(m.error));
      if (m.type === 'result') {
        release();
        resolve({ svg: m.svg, stats: m.stats });
      }
    };
    instance.onerror = (event) => fail(new Error(event.message || 'Export failed'));
    const { nodes, cameras, activeCameraIndex, renderSettings } =
      useSceneStore.getState();
    try { instance.postMessage({
      nodes: composition?.nodes ?? nodes,
      camera: composition?.camera ?? cameras[activeCameraIndex],
      settings: {
        ...renderSettings,
        ...(composition ? { near: 0.1, far: 100 } : {}),
        step: Math.min(renderSettings.step, 0.01),
        curveTolerance: Math.max(
          0.001,
          Math.min(
            renderSettings.curveTolerance ?? 0.25,
            Math.max(0.001, plot.maxErrorMm / 2) *
              Math.min(width / pageWidthMm, height / pageHeightMm),
          ),
        ),
      },
      width,
      height,
      pageWidthMm,
      pageHeightMm,
      plot,
      optimize,
    }); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  });
  const deliver = async (action: 'download' | 'copy') => {
    if (busy) return;
    const id = ++operation.current.id;
    setBusy(true);
    setError('');
    setStats(null);
    setStatus('Preparing export…');
    try {
      const output = generate();
      // Start the clipboard request during the click, before the worker returns.
      const delivery = action === 'copy'
        ? copySVGToClipboard(output.then(result => result.svg))
        : output.then(result => { if (id === operation.current.id) downloadSVG(result.svg); });
      const [result] = await Promise.all([output, delivery]);
      if (id !== operation.current.id) return;
      setStats(result.stats);
      setStatus(action === 'copy' ? 'SVG copied' : 'SVG downloaded');
      void counters.increment('SKULLCAT_SVG_EXPORT');
    } catch (error) {
      if (id !== operation.current.id) return;
      setError(String(error));
      setStatus(action === 'copy' ? 'Copy failed. Try again.' : 'Download failed. Try again.');
    } finally {
      if (id === operation.current.id) {
        abortExport.current?.();
        setBusy(false);
      }
    }
  };
  const fields: [keyof PlotSettings, string, number, number][] = [
    ['marginMm', 'Page margin (mm)', 0, 1],
    ['penDiameterMm', 'SVG stroke width (mm)', 0.01, 0.05],
    ['maxErrorMm', 'Polyline simplification error (mm)', 0, 0.01],
  ];
  return (
    <dialog
      ref={dialog}
      className="export-panel"
      aria-labelledby="export-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
        onClose();
      }}
    >
      <div className="export-heading">
        <h2 id="export-dialog-title">Export SVG</h2>
        <button
          className="btn btn-sm"
          onClick={() => {
            cancel();
            onClose();
          }}
        >
          Close
        </button>
      </div>
      <p>
        {Number(pageWidthMm.toFixed(3))} × {Number(pageHeightMm.toFixed(3))} mm. Both actions render the drawing at export quality.
      </p>
      <fieldset disabled={busy}>
        <div className="export-fields">
          {fields.map(([key, label, min, step]) => (
            <label key={key}>
              {label}
              <input
                className="input"
                type="number"
                min={min}
                step={step}
                value={plot[key] as number}
                onChange={(e) => change({ [key]: e.target.valueAsNumber })}
              />
            </label>
          ))}
        </div>
        {(['removeDuplicates', 'joinTouching', 'lockDirection'] as const).map(
          (key) => (
            <label className="export-check" key={key}>
              <input
                type="checkbox"
                checked={plot[key]}
                onChange={(e) => change({ [key]: e.target.checked })}
              />
              {key === 'removeDuplicates'
                ? 'Remove exact duplicate edges'
                : key === 'joinTouching'
                  ? 'Join touching endpoints (no gap bridging)'
                  : 'Preserve stroke direction'}
            </label>
          ),
        )}
      </fieldset>
      <p className="muted">
        Stroke width is saved in the SVG. Margins clip the drawing.
        Direction locks on scene objects also apply here.
      </p>
      {error && (
        <p role="alert" className="export-error">
          {error}
        </p>
      )}
      <p role="status">{status}</p>
      {stats && (
        <p>
          {stats.strokes.toLocaleString()} strokes ·{' '}
          {(stats.inkMm / 1000).toFixed(2)} m of linework
        </p>
      )}
      {totals.SKULLCAT_SVG_EXPORT !== undefined && <p className="muted">{totals.SKULLCAT_SVG_EXPORT.toLocaleString()} SVG exports worldwide</p>}
      <div className="export-actions">
        {busy && <button className="btn" onClick={cancel}>Cancel export</button>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void deliver('download')}>
          Download SVG
        </button>
        <button className="btn" disabled={busy} onClick={() => void deliver('copy')}>
          Copy SVG
        </button>
      </div>
    </dialog>
  );
}
