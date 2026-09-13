import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '../lib/store';
import { DEFAULT_PLOT_SETTINGS } from '../lib/plot-settings';
import type { PlotSettings, PlotStats } from '../lib/plot-settings';
import { downloadSVG, copySVGToClipboard } from '../lib/export-svg';

export function ExportPanel({
  width,
  height,
  pageWidthMm,
  pageHeightMm,
  optimize,
  onClose,
}: {
  width: number;
  height: number;
  pageWidthMm: number;
  pageHeightMm: number;
  optimize: boolean;
  onClose: () => void;
}) {
  const [plot, setPlot] = useState<PlotSettings>(() => {
    try {
      return {
        ...DEFAULT_PLOT_SETTINGS,
        ...JSON.parse(localStorage.getItem('ln-plot-settings') ?? '{}'),
      };
    } catch {
      return DEFAULT_PLOT_SETTINGS;
    }
  });
  const [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [svg, setSvg] = useState(''),
    [stats, setStats] = useState<PlotStats | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => worker.current?.terminate();
  }, []);
  const change = (next: Partial<PlotSettings>) => {
    const p = { ...plot, ...next };
    setPlot(p);
    setSvg('');
    setStats(null);
    try {
      localStorage.setItem('ln-plot-settings', JSON.stringify(p));
    } catch {
      /* export still works without settings storage */
    }
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setStatus('Export cancelled.');
  };
  const generate = () => {
    worker.current?.terminate();
    setBusy(true);
    setError('');
    setSvg('');
    setStats(null);
    setStatus('Preparing export…');
    const instance = new Worker(
      new URL('../lib/export-worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = instance;
    instance.onmessage = (event) => {
      if (worker.current !== instance) return;
      const m = event.data;
      if (m.type === 'progress') setStatus(m.message);
      if (m.type === 'error') {
        setError(m.error);
        setBusy(false);
        instance.terminate();
        worker.current = null;
      }
      if (m.type === 'result') {
        setSvg(m.svg);
        setStats(m.stats);
        setBusy(false);
        setStatus('SVG ready');
        instance.terminate();
        worker.current = null;
      }
    };
    instance.onerror = (event) => {
      setError(event.message || 'Export failed');
      setBusy(false);
      instance.terminate();
      worker.current = null;
    };
    const { nodes, cameras, activeCameraIndex, renderSettings } =
      useSceneStore.getState();
    instance.postMessage({
      nodes,
      camera: cameras[activeCameraIndex],
      settings: {
        ...renderSettings,
        step: Math.min(renderSettings.step, 0.01),
      },
      width,
      height,
      pageWidthMm,
      pageHeightMm,
      plot,
      optimize,
    });
  };
  const fields: [keyof PlotSettings, string, number, number][] = [
    ['marginMm', 'Page margin (mm)', 0, 1],
    ['penDiameterMm', 'Pen diameter (mm)', 0.01, 0.05],
    ['maxErrorMm', 'Polyline simplification error (mm)', 0, 0.01],
    ['minimumGapMm', 'Minimum clearance (mm; 0 allows overlaps)', 0, 0.05],
    ['drawSpeed', 'Drawing speed (mm/s)', 0.1, 1],
    ['travelSpeed', 'Travel speed (mm/s)', 0.1, 1],
    ['liftSeconds', 'Lift time per stroke (s)', 0, 0.05],
  ];
  return (
    <dialog
      ref={dialog}
      className="export-panel"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
        onClose();
      }}
    >
      <div className="export-heading">
        <h2>Plot output</h2>
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
        {pageWidthMm} × {pageHeightMm} mm. Margins clip the drawing. Clearance
        checks report overlaps; they never silently delete them.
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
        A direction lock on any scene object also preserves all stroke
        directions during export. Time assumes a start at the page margin for
        each pen and excludes manual pen changes.
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
          {stats.penLifts.toLocaleString()} lifts ·{' '}
          {(stats.inkMm / 1000).toFixed(2)} m drawn ·{' '}
          {(stats.travelMm / 1000).toFixed(2)} m travel · ~
          {(stats.estimatedSeconds / 60).toFixed(1)} min
        </p>
      )}
      <div className="export-actions">
        {busy ? (
          <button className="btn" onClick={cancel}>
            Cancel export
          </button>
        ) : (
          <button className="btn btn-primary" onClick={generate}>
            Generate SVG
          </button>
        )}
        <button
          className="btn"
          disabled={!svg || busy}
          onClick={() => downloadSVG(svg)}
        >
          Download SVG
        </button>
        <button
          className="btn"
          disabled={!svg || busy}
          onClick={() => {
            void copySVGToClipboard(svg)
              .then(() => setStatus('SVG copied'))
              .catch((e) => setError(String(e)));
          }}
        >
          Copy SVG
        </button>
      </div>
    </dialog>
  );
}
