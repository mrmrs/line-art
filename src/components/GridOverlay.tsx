import { useId } from 'react';
import { useViewSettings } from '../lib/view-settings';

/** A display-only guide in paper millimetres; never passed to a render worker. */
export function GridOverlay({ widthMm, heightMm }: { widthMm: number; heightMm: number }) {
  const id = useId();
  const visible = useViewSettings(s => s.gridVisible);
  const style = useViewSettings(s => s.gridStyle);
  const spacing = useViewSettings(s => s.gridSpacingMm);
  const color = useViewSettings(s => s.gridColor);
  if (!visible) return null;
  return <svg className="paper-grid" aria-hidden="true" viewBox={`0 0 ${widthMm} ${heightMm}`}
    preserveAspectRatio="none" data-grid-style={style} data-grid-spacing-mm={spacing}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
    <defs><pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
      {style === 'lines'
        ? <path d={`M ${spacing} 0 H 0 V ${spacing}`} fill="none" stroke={color} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        : <circle cx={spacing / 2} cy={spacing / 2} r="0.3" fill={color} />}
    </pattern></defs>
    <rect width={widthMm} height={heightMm} fill={`url(#${id})`} />
  </svg>;
}
